import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { SessionPrincipal } from '../../common/types';
import {
  addDays, atLocalTime, dateOnly, endOfMonth, startOfMonth, startOfWeek, toIsoDate,
} from '../../common/utils/dates';
import { companyFilter } from '../../common/utils/scope';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async rooms(user: SessionPrincipal, companyId?: number, locationId?: number) {
    const companyIds = companyFilter(user, companyId);
    return this.prisma.room.findMany({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        ...(locationId ? { locationId } : {}),
      },
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * The Day / Week / Month booking grid.
   *
   * Returns bookings for the whole window in one call, keyed by room, so
   * the client can render rooms-as-columns × hours-as-rows without a
   * request per cell.
   */
  async grid(
    user: SessionPrincipal,
    view: 'day' | 'week' | 'month',
    dateIso?: string,
    roomIds?: number[],
    companyId?: number,
    locationId?: number,
  ) {
    const anchor = dateIso ? dateOnly(dateIso) : dateOnly(new Date());
    const { timezone } = await this.tenant.get(companyId ?? user.companyId);
    const { fromDate, toDate, fromInstant, toInstant } = this.windowFor(view, anchor, timezone);
    const companyIds = companyFilter(user, companyId);

    const roomWhere: Prisma.RoomWhereInput = {
      companyId: { in: companyIds },
      isActive: true,
      ...(locationId ? { locationId } : {}),
      ...(roomIds && roomIds.length > 0 ? { id: { in: roomIds } } : {}),
    };

    const rooms = await this.prisma.room.findMany({
      where: roomWhere,
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
      include: { location: { select: { id: true, name: true } } },
    });

    const bookings = await this.prisma.roomBooking.findMany({
      where: {
        roomId: { in: rooms.map((r) => r.id) },
        status: { not: 'CANCELLED' },
        // Overlap, not containment: a meeting that starts before the
        // window and ends inside it must still appear.
        startAt: { lt: toInstant },
        endAt: { gt: fromInstant },
      },
      include: {
        organiser: { select: { id: true, firstName: true, lastName: true, thumbnailsPath01: true } },
        attendees: {
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { startAt: 'asc' },
    });

    const byRoom = new Map<number, typeof bookings>();
    for (const booking of bookings) {
      byRoom.set(booking.roomId, [...(byRoom.get(booking.roomId) ?? []), booking]);
    }

    return {
      view,
      from: toIsoDate(fromDate),
      to: toIsoDate(toDate),
      rooms: rooms.map((room) => ({
        ...room,
        bookings: (byRoom.get(room.id) ?? []).map((booking) => ({
          id: booking.id,
          title: booking.title,
          agenda: booking.agenda,
          startAt: booking.startAt,
          endAt: booking.endAt,
          status: booking.status,
          seriesId: booking.seriesId,
          isRecurring: booking.seriesId !== null,
          organiser: {
            id: booking.organiser.id,
            fullName: `${booking.organiser.firstName} ${booking.organiser.lastName}`,
            initials: initials(booking.organiser.firstName, booking.organiser.lastName),
            avatarUrl: booking.organiser.thumbnailsPath01,
          },
          attendeeCount: booking.attendees.length,
          attendees: booking.attendees.map((a) => ({
            id: a.employee.id,
            fullName: `${a.employee.firstName} ${a.employee.lastName}`,
            response: a.response,
          })),
          externalGuests: booking.externalGuests,
          isMine: booking.organiserId === user.id,
          amInvited: booking.attendees.some((a) => a.employeeId === user.id),
          durationMinutes: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000),
        })),
      })),
    };
  }

  /**
   * Resolves a view into calendar bounds *and* the instants that bracket
   * them in the tenant's timezone.
   *
   * The distinction matters: `@db.Date` columns elsewhere are anchored at
   * UTC noon, but `room_booking.startAt` is a full timestamp. Querying it
   * with a UTC-noon anchor selects the wrong 24 hours — a 15:00 booking
   * lands in the neighbouring day's window and the grid silently renders
   * empty. The further the tenant is from UTC, the worse it gets.
   */
  private windowFor(
    view: 'day' | 'week' | 'month',
    anchor: Date,
    timezone: string,
  ): { fromDate: Date; toDate: Date; fromInstant: Date; toInstant: Date } {
    const bounds =
      view === 'day'
        ? { fromDate: anchor, toDate: anchor }
        : view === 'week'
          ? { fromDate: startOfWeek(anchor), toDate: addDays(startOfWeek(anchor), 6) }
          : { fromDate: startOfMonth(anchor), toDate: endOfMonth(anchor) };

    return {
      ...bounds,
      // Local midnight on the first day, to local midnight after the last.
      fromInstant: atLocalTime(bounds.fromDate, '00:00', timezone),
      toInstant: atLocalTime(addDays(bounds.toDate, 1), '00:00', timezone),
    };
  }

  /**
   * Creates a booking, or a whole recurring series.
   *
   * Conflict detection runs inside the transaction against every
   * occurrence, so a weekly series that collides on one date is rejected
   * as a whole rather than half-created.
   */
  async create(
    user: SessionPrincipal,
    dto: {
      roomId: number; title: string; agenda?: string; startAt: string; endAt: string;
      attendeeIds?: string[]; externalGuests?: string[];
      recurrence?: { freq: 'WEEKLY' | 'DAILY'; count: number };
    },
  ) {
    const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('Room not found.');
    if (!user.accessibleCompanyIds.includes(room.companyId)) {
      throw new ForbiddenException('That room belongs to a company you do not have access to.');
    }
    if (!room.isActive) throw new BadRequestException('That room is not bookable.');

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end time.');
    }
    if (end <= start) throw new BadRequestException('The end time must be after the start time.');
    if (end.getTime() - start.getTime() > 12 * 3_600_000) {
      throw new BadRequestException('A single booking cannot exceed 12 hours.');
    }
    if (start < addDays(new Date(), -1)) {
      throw new BadRequestException('You cannot book a room in the past.');
    }

    const attendeeIds = [...new Set(dto.attendeeIds ?? [])]
      .map((id) => BigInt(id))
      .filter((id) => id !== user.id);

    if (attendeeIds.length + 1 > room.capacity) {
      throw new BadRequestException(
        `${room.name} seats ${room.capacity}; you have invited ${attendeeIds.length + 1} people.`,
      );
    }

    // Build every occurrence up front.
    const occurrences: { startAt: Date; endAt: Date }[] = [];
    const count = dto.recurrence ? Math.min(dto.recurrence.count, 52) : 1;
    const stepDays = dto.recurrence?.freq === 'DAILY' ? 1 : 7;
    for (let i = 0; i < count; i++) {
      const offset = i * stepDays * 86_400_000;
      occurrences.push({
        startAt: new Date(start.getTime() + offset),
        endAt: new Date(end.getTime() + offset),
      });
    }

    const seriesId = dto.recurrence ? randomUUID() : null;

    return this.prisma.$transaction(async (tx) => {
      for (const occurrence of occurrences) {
        const clash = await tx.roomBooking.findFirst({
          where: {
            roomId: dto.roomId,
            status: { not: 'CANCELLED' },
            startAt: { lt: occurrence.endAt },
            endAt: { gt: occurrence.startAt },
          },
          include: { organiser: { select: { firstName: true, lastName: true } } },
        });
        if (clash) {
          throw new BadRequestException(
            `${room.name} is already booked from ${clash.startAt.toISOString().slice(11, 16)} `
            + `to ${clash.endAt.toISOString().slice(11, 16)} on ${toIsoDate(clash.startAt)} `
            + `by ${clash.organiser.firstName} ${clash.organiser.lastName} ("${clash.title}").`,
          );
        }
      }

      const created: Awaited<ReturnType<typeof tx.roomBooking.create>>[] = [];
      for (const occurrence of occurrences) {
        created.push(
          await tx.roomBooking.create({
            data: {
              roomId: dto.roomId,
              organiserId: user.id,
              title: dto.title,
              agenda: dto.agenda,
              startAt: occurrence.startAt,
              endAt: occurrence.endAt,
              seriesId,
              recurrence: dto.recurrence ?? undefined,
              externalGuests: dto.externalGuests ?? [],
              ...(attendeeIds.length > 0
                ? { attendees: { create: attendeeIds.map((employeeId) => ({ employeeId })) } }
                : {}),
            },
          }),
        );
      }

      if (attendeeIds.length > 0) {
        await tx.notification.createMany({
          data: attendeeIds.map((employeeId) => ({
            employeeId,
            kind: 'BOOKING' as const,
            title: `You have been invited to "${dto.title}"`,
            body: `${room.name}, ${toIsoDate(start)}${dto.recurrence ? ` (${count} occurrences)` : ''}`,
            link: '/space-booking',
            entityType: 'room_booking',
            entityId: String(created[0].id),
          })),
        });
      }

      return {
        created: created.length,
        seriesId,
        bookings: created,
      };
    });
  }

  async cancel(user: SessionPrincipal, bookingId: bigint, reason?: string, wholeSeries = false) {
    const booking = await this.prisma.roomBooking.findUnique({
      where: { id: bookingId },
      include: { attendees: { select: { employeeId: true } }, room: { select: { name: true, companyId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found.');

    const isOrganiser = booking.organiserId === user.id;
    const isAdmin = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);
    if (!isOrganiser && !isAdmin) {
      throw new ForbiddenException('Only the organiser can cancel this booking.');
    }
    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('That booking is already cancelled.');
    }

    const where: Prisma.RoomBookingWhereInput =
      wholeSeries && booking.seriesId
        // Cancelling a series only affects occurrences still to come.
        ? { seriesId: booking.seriesId, startAt: { gte: new Date() }, status: { not: 'CANCELLED' } }
        : { id: bookingId };

    const result = await this.prisma.roomBooking.updateMany({
      where,
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });

    if (booking.attendees.length > 0) {
      await this.prisma.notification.createMany({
        data: booking.attendees.map((attendee) => ({
          employeeId: attendee.employeeId,
          kind: 'BOOKING' as const,
          title: `"${booking.title}" was cancelled`,
          body: reason ?? `${booking.room.name}, ${toIsoDate(booking.startAt)}`,
          link: '/space-booking',
          entityType: 'room_booking',
          entityId: String(bookingId),
        })),
      });
    }

    return { cancelled: result.count, wholeSeries };
  }

  async respond(user: SessionPrincipal, bookingId: bigint, accept: boolean) {
    const attendee = await this.prisma.roomBookingAttendee.findUnique({
      where: { bookingId_employeeId: { bookingId, employeeId: user.id } },
    });
    if (!attendee) throw new NotFoundException('You are not invited to that booking.');

    return this.prisma.roomBookingAttendee.update({
      where: { bookingId_employeeId: { bookingId, employeeId: user.id } },
      data: { response: accept ? 'APPROVED' : 'REJECTED' },
    });
  }

  async myBookings(user: SessionPrincipal, upcomingOnly = true) {
    const bookings = await this.prisma.roomBooking.findMany({
      where: {
        status: { not: 'CANCELLED' },
        OR: [{ organiserId: user.id }, { attendees: { some: { employeeId: user.id } } }],
        ...(upcomingOnly ? { endAt: { gte: new Date() } } : {}),
      },
      include: {
        room: { select: { id: true, name: true, floor: true, capacity: true } },
        organiser: { select: { id: true, firstName: true, lastName: true } },
        attendees: {
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { startAt: upcomingOnly ? 'asc' : 'desc' },
      take: 100,
    });

    return bookings.map((booking) => ({
      ...booking,
      organiser: {
        id: booking.organiser.id,
        fullName: `${booking.organiser.firstName} ${booking.organiser.lastName}`,
      },
      isMine: booking.organiserId === user.id,
      myResponse:
        booking.attendees.find((a) => a.employeeId === user.id)?.response ?? null,
      attendees: booking.attendees.map((a) => ({
        id: a.employee.id,
        fullName: `${a.employee.firstName} ${a.employee.lastName}`,
        response: a.response,
      })),
    }));
  }

  /** Free slots for one room on one day, for the "+ Book Now" affordance. */
  async availability(user: SessionPrincipal, roomId: number, dateIso: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found.');
    if (!user.accessibleCompanyIds.includes(room.companyId)) {
      throw new ForbiddenException('That room belongs to a company you do not have access to.');
    }

    const day = dateOnly(dateIso);
    const bookings = await this.prisma.roomBooking.findMany({
      where: {
        roomId,
        status: { not: 'CANCELLED' },
        startAt: { gte: new Date(day.getTime() - 12 * 3_600_000) },
        endAt: { lte: new Date(day.getTime() + 36 * 3_600_000) },
      },
      select: { startAt: true, endAt: true, title: true },
      orderBy: { startAt: 'asc' },
    });

    // Hourly slots across the room's bookable window.
    const [openHour] = room.openTime.split(':').map(Number);
    const [closeHour] = room.closeTime.split(':').map(Number);
    const slots: {
      hour: number;
      label: string;
      startAt: Date;
      endAt: Date;
      available: boolean;
      bookedFor: string | null;
    }[] = [];
    for (let hour = openHour; hour < closeHour; hour++) {
      const slotStart = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 6, 0),
      );
      const slotEnd = new Date(slotStart.getTime() + 3_600_000);
      const conflict = bookings.find((b) => b.startAt < slotEnd && b.endAt > slotStart);
      slots.push({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        startAt: slotStart,
        endAt: slotEnd,
        available: !conflict,
        bookedFor: conflict?.title ?? null,
      });
    }

    return { room, date: toIsoDate(day), slots };
  }
}
