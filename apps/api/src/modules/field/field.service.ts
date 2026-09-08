import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { addDays, dateOnly, monthWindow, toIsoDate } from '../../common/utils/dates';
import { collectSubordinateIds, companyFilter } from '../../common/utils/scope';

@Injectable()
export class FieldService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whose visits/tracking the caller may see. */
  private async visibleEmployeeIds(user: SessionPrincipal): Promise<bigint[] | 'all'> {
    if (user.permissions.has(PERMISSIONS.VISIT_READ_ALL) ||
        user.permissions.has(PERMISSIONS.TRACKING_READ_ALL)) {
      return 'all';
    }
    if (user.permissions.has(PERMISSIONS.TRACKING_READ_TEAM)) {
      const subordinates = await collectSubordinateIds(this.prisma, user.id);
      return [user.id, ...subordinates];
    }
    return [user.id];
  }

  // ── customer visits ────────────────────────────────────────────────

  async myVisits(
    user: SessionPrincipal,
    query: { page: number; pageSize: number; skip: number; sortDir: 'asc' | 'desc'; month?: number; year?: number; search?: string },
  ) {
    const now = new Date();
    const { start, end } = monthWindow(
      query.month ?? now.getUTCMonth() + 1,
      query.year ?? now.getUTCFullYear(),
    );

    const where: Prisma.CustomerVisitWhereInput = {
      employeeId: user.id,
      visitDate: { gte: start, lte: end },
      ...(query.search
        ? { customer: { name: { contains: query.search, mode: 'insensitive' } } }
        : {}),
    };

    const [rows, total, aggregate] = await Promise.all([
      this.prisma.customerVisit.findMany({
        where,
        orderBy: { visitDate: query.sortDir },
        skip: query.skip,
        take: query.pageSize,
        include: {
          customer: { select: { id: true, name: true, address: true, city: true, contactLevel: true, orgType: true } },
          participants: {
            include: { employee: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.customerVisit.count({ where }),
      this.prisma.customerVisit.aggregate({
        where,
        _sum: { orderValue: true },
        _count: true,
      }),
    ]);

    return {
      ...paginate(
        rows.map((row) => ({
          ...row,
          orderValue: row.orderValue === null ? null : Number(row.orderValue),
          jointWith: row.participants.map((p) => ({
            id: p.employee.id,
            fullName: `${p.employee.firstName} ${p.employee.lastName}`,
          })),
        })),
        total,
        query,
      ),
      summary: {
        visitCount: aggregate._count,
        totalOrderValue: Number(aggregate._sum.orderValue ?? 0),
        uniqueCustomers: new Set(rows.map((r) => r.customerId)).size,
      },
    };
  }

  /**
   * Customer Visit dashboard: the four widgets plus the joint-visit table.
   *
   * All five aggregations run as grouped queries rather than loading the
   * visit rows and reducing in JS — a busy month is tens of thousands of
   * rows and this page has to stay responsive.
   */
  async visitDashboard(user: SessionPrincipal, month?: number, year?: number, companyId?: number) {
    if (!user.permissions.has(PERMISSIONS.VISIT_READ_ALL)) {
      throw new ForbiddenException('You do not have access to the visit dashboard.');
    }
    const now = new Date();
    const targetMonth = month ?? now.getUTCMonth() + 1;
    const targetYear = year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(targetMonth, targetYear);
    const companyIds = companyFilter(user, companyId);

    const scope: Prisma.CustomerVisitWhereInput = {
      visitDate: { gte: start, lte: end },
      customer: { companyId: { in: companyIds } },
    };

    const [byCustomer, byEmployee, byLevel, daily, jointVisits, totals] = await Promise.all([
      this.prisma.customerVisit.groupBy({
        by: ['customerId'],
        where: scope,
        _count: { _all: true },
        _sum: { orderValue: true },
        orderBy: { _count: { customerId: 'desc' } },
        take: 20,
      }),
      this.prisma.customerVisit.groupBy({
        by: ['employeeId'],
        where: scope,
        _count: { _all: true },
        _sum: { orderValue: true },
        orderBy: { _count: { employeeId: 'desc' } },
        take: 20,
      }),
      // Contact level lives on the customer, so this one needs a join.
      this.prisma.$queryRaw<{ contact_level: string; visits: bigint }[]>`
        SELECT c.contact_level, COUNT(*)::bigint AS visits
        FROM customer_visit v
        JOIN customer c ON c.id = v.customer_id
        WHERE v.visit_date BETWEEN ${start} AND ${end}
          AND c.company_id = ANY(${companyIds})
        GROUP BY c.contact_level
        ORDER BY visits DESC
      `,
      this.prisma.customerVisit.groupBy({
        by: ['visitDate'],
        where: scope,
        _count: { _all: true },
        orderBy: { visitDate: 'asc' },
      }),
      this.prisma.customerVisit.findMany({
        where: { ...scope, isJointVisit: true },
        orderBy: { visitDate: 'desc' },
        take: 100,
        include: {
          customer: { select: { id: true, name: true, address: true, city: true } },
          employee: { select: { id: true, firstName: true, lastName: true } },
          participants: {
            include: { employee: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.customerVisit.aggregate({
        where: scope,
        _count: true,
        _sum: { orderValue: true },
      }),
    ]);

    // Resolve the grouped ids to names in one round trip each.
    const [customers, employees] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: byCustomer.map((x) => x.customerId) } },
        select: { id: true, name: true, city: true, contactLevel: true },
      }),
      this.prisma.employee.findMany({
        where: { id: { in: byEmployee.map((x) => x.employeeId) } },
        select: {
          id: true, firstName: true, lastName: true, employeeVisibleId: true,
          designation: { select: { name: true } },
        },
      }),
    ]);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const employeeById = new Map(employees.map((e) => [String(e.id), e]));

    return {
      month: targetMonth,
      year: targetYear,
      summary: {
        totalVisits: totals._count,
        totalOrderValue: Number(totals._sum.orderValue ?? 0),
        activeReps: byEmployee.length,
        customersVisited: byCustomer.length,
      },
      topCustomers: byCustomer.map((row) => ({
        customerId: row.customerId,
        name: customerById.get(row.customerId)?.name ?? 'Unknown',
        city: customerById.get(row.customerId)?.city ?? null,
        contactLevel: customerById.get(row.customerId)?.contactLevel ?? null,
        visits: row._count._all,
        orderValue: Number(row._sum.orderValue ?? 0),
      })),
      topEmployees: byEmployee.map((row) => {
        const employee = employeeById.get(String(row.employeeId));
        return {
          employeeId: row.employeeId,
          fullName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
          initials: employee ? initials(employee.firstName, employee.lastName) : '?',
          designation: employee?.designation?.name ?? null,
          visits: row._count._all,
          orderValue: Number(row._sum.orderValue ?? 0),
        };
      }),
      byContactLevel: byLevel.map((row) => ({
        contactLevel: row.contact_level,
        visits: Number(row.visits),
      })),
      dailyTrend: daily.map((row) => ({
        date: toIsoDate(row.visitDate),
        visits: row._count._all,
      })),
      jointVisits: jointVisits.map((visit) => ({
        visitId: visit.id,
        customerName: visit.customer.name,
        address: [visit.customer.address, visit.customer.city].filter(Boolean).join(', '),
        visitDate: visit.visitDate,
        personVisited: visit.personVisited,
        visitedBy: [
          `${visit.employee.firstName} ${visit.employee.lastName}`,
          ...visit.participants.map((p) => `${p.employee.firstName} ${p.employee.lastName}`),
        ],
      })),
    };
  }

  async createVisit(
    user: SessionPrincipal,
    dto: {
      customerId: number; visitDate: string; personVisited?: string; purpose?: string;
      outcome?: string; orderValue?: number; lat?: number; lng?: number;
      participantIds?: string[];
    },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true, companyId: true, lat: true, lng: true, name: true },
    });
    if (!customer) throw new NotFoundException('Customer not found.');
    if (customer.companyId !== user.companyId) {
      throw new ForbiddenException('That customer belongs to another company.');
    }

    const visitDate = dateOnly(dto.visitDate);
    if (visitDate > addDays(new Date(), 1)) {
      throw new BadRequestException('A visit cannot be logged for a future date.');
    }

    // Distance from the registered coordinates is the visit-verification
    // signal; the check-in is not rejected, just measured.
    let distanceM: number | null = null;
    if (dto.lat !== undefined && dto.lng !== undefined && customer.lat !== null && customer.lng !== null) {
      distanceM = Math.round(haversineMetres(dto.lat, dto.lng, customer.lat, customer.lng));
    }

    const participantIds = (dto.participantIds ?? [])
      .map((id) => BigInt(id))
      .filter((id) => id !== user.id);

    return this.prisma.customerVisit.create({
      data: {
        customerId: dto.customerId,
        employeeId: user.id,
        visitDate,
        checkInAt: new Date(),
        personVisited: dto.personVisited,
        purpose: dto.purpose,
        outcome: dto.outcome,
        orderValue: dto.orderValue,
        lat: dto.lat,
        lng: dto.lng,
        distanceM,
        isJointVisit: participantIds.length > 0,
        ...(participantIds.length > 0
          ? { participants: { create: participantIds.map((employeeId) => ({ employeeId })) } }
          : {}),
      },
      include: { customer: { select: { name: true } } },
    });
  }

  async customers(
    user: SessionPrincipal,
    query: { page: number; pageSize: number; skip: number; search?: string; contactLevel?: string },
  ) {
    const where: Prisma.CustomerWhereInput = {
      companyId: user.companyId,
      isActive: true,
      ...(query.contactLevel ? { contactLevel: query.contactLevel as never } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where, orderBy: { name: 'asc' }, skip: query.skip, take: query.pageSize,
        include: { _count: { select: { visits: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(
      rows.map(({ _count, ...rest }) => ({ ...rest, visitCount: _count.visits })),
      total,
      query,
    );
  }

  // ── GPS tracking ───────────────────────────────────────────────────

  /**
   * Live and recent tracking sessions.
   *
   * Employees who have not given consent are reported explicitly rather
   * than silently omitted — a manager looking at a map with someone
   * missing should know *why*.
   */
  async trackingOverview(
    user: SessionPrincipal,
    scope: 'ongoing' | 'previous' = 'ongoing',
    companyId?: number,
  ) {
    const visible = await this.visibleEmployeeIds(user);
    if (visible !== 'all' && visible.length === 1 && visible[0] === user.id &&
        !user.permissions.has(PERMISSIONS.TRACKING_READ_TEAM)) {
      throw new ForbiddenException('You do not have access to employee tracking.');
    }

    const companyIds = companyFilter(user, companyId);
    const employeeWhere: Prisma.EmployeeWhereInput = {
      companyId: { in: companyIds },
      ...(visible === 'all' ? {} : { id: { in: visible } }),
    };

    const sessions = await this.prisma.trackingSession.findMany({
      where: {
        status: scope === 'ongoing' ? 'ONGOING' : 'COMPLETED',
        employee: employeeWhere,
        ...(scope === 'previous' ? { startedAt: { gte: addDays(new Date(), -14) } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: scope === 'ongoing' ? 200 : 100,
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            thumbnailsPath01: true,
            designation: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        // Only the newest point is needed to place a live marker.
        points: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
          select: { lat: true, lng: true, recordedAt: true, speedKph: true },
        },
      },
    });

    const nonConsenting = await this.prisma.employee.findMany({
      where: {
        ...employeeWhere,
        active: true,
        OR: [{ trackingConfig: null }, { trackingConfig: { enabled: false } }],
      },
      select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } },
      take: 50,
    });

    return {
      scope,
      sessions: sessions.map((session) => ({
        id: session.id,
        employee: {
          ...session.employee,
          fullName: `${session.employee.firstName} ${session.employee.lastName}`,
          initials: initials(session.employee.firstName, session.employee.lastName),
        },
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        status: session.status,
        distanceKm: Number(session.distanceKm),
        pointCount: session.pointCount,
        batteryStart: session.batteryStart,
        batteryEnd: session.batteryEnd,
        deviceInfo: session.deviceInfo,
        lastPoint: session.points[0] ?? null,
        durationMinutes: Math.round(
          ((session.endedAt ?? new Date()).getTime() - session.startedAt.getTime()) / 60_000,
        ),
      })),
      /** Surfaced deliberately: consent is a precondition, not a default. */
      withoutConsent: nonConsenting.map((employee) => ({
        id: employee.id,
        fullName: `${employee.firstName} ${employee.lastName}`,
        designation: employee.designation?.name ?? null,
      })),
    };
  }

  /** Full breadcrumb polyline for one session. */
  async trackingSession(user: SessionPrincipal, sessionId: bigint) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, companyId: true,
            designation: { select: { name: true } },
          },
        },
        points: { orderBy: { recordedAt: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Tracking session not found.');

    const visible = await this.visibleEmployeeIds(user);
    const allowed =
      visible === 'all'
        ? user.accessibleCompanyIds.includes(session.employee.companyId)
        : visible.some((id) => id === session.employeeId);
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this tracking session.');
    }
    if (session.purgedAt !== null) {
      return {
        session: { ...session, points: [] },
        purged: true,
        message: 'The breadcrumb data for this session has been purged under the retention policy.',
      };
    }

    return {
      session: {
        ...session,
        distanceKm: Number(session.distanceKm),
        employee: {
          ...session.employee,
          fullName: `${session.employee.firstName} ${session.employee.lastName}`,
        },
      },
      purged: false,
    };
  }

  /** Per-employee tracking report for a date range. */
  async trackingReport(
    user: SessionPrincipal,
    from?: string,
    to?: string,
    companyId?: number,
  ) {
    if (!user.permissions.has(PERMISSIONS.TRACKING_READ_TEAM) &&
        !user.permissions.has(PERMISSIONS.TRACKING_READ_ALL)) {
      throw new ForbiddenException('You do not have access to tracking reports.');
    }

    const end = to ? dateOnly(to) : new Date();
    const start = from ? dateOnly(from) : addDays(end, -30);
    const visible = await this.visibleEmployeeIds(user);
    const companyIds = companyFilter(user, companyId);

    const grouped = await this.prisma.trackingSession.groupBy({
      by: ['employeeId'],
      where: {
        startedAt: { gte: start, lte: addDays(end, 1) },
        employee: {
          companyId: { in: companyIds },
          ...(visible === 'all' ? {} : { id: { in: visible } }),
        },
      },
      _sum: { distanceKm: true, pointCount: true },
      _count: { _all: true },
    });

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: grouped.map((g) => g.employeeId) } },
      select: {
        id: true, employeeVisibleId: true, firstName: true, lastName: true,
        designation: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const byId = new Map(employees.map((e) => [String(e.id), e]));

    // Visits in the same window, so distance can be read against output.
    const visits = await this.prisma.customerVisit.groupBy({
      by: ['employeeId'],
      where: {
        visitDate: { gte: start, lte: end },
        employeeId: { in: grouped.map((g) => g.employeeId) },
      },
      _count: { _all: true },
      _sum: { orderValue: true },
    });
    const visitsById = new Map(visits.map((v) => [String(v.employeeId), v]));

    return {
      from: toIsoDate(start),
      to: toIsoDate(end),
      rows: grouped
        .map((row) => {
          const employee = byId.get(String(row.employeeId));
          const visit = visitsById.get(String(row.employeeId));
          const distanceKm = Number(row._sum.distanceKm ?? 0);
          const visitCount = visit?._count._all ?? 0;
          return {
            employee: employee
              ? {
                  ...employee,
                  fullName: `${employee.firstName} ${employee.lastName}`,
                  initials: initials(employee.firstName, employee.lastName),
                }
              : null,
            sessions: row._count._all,
            distanceKm: Math.round(distanceKm * 100) / 100,
            pointCount: row._sum.pointCount ?? 0,
            visitCount,
            orderValue: Number(visit?._sum.orderValue ?? 0),
            kmPerVisit: visitCount > 0 ? Math.round((distanceKm / visitCount) * 100) / 100 : null,
          };
        })
        .sort((a, b) => b.distanceKm - a.distanceKm),
    };
  }

  /** Consent management — the employee's own switch. */
  async myTrackingConfig(user: SessionPrincipal) {
    const config = await this.prisma.trackingConfig.findUnique({
      where: { employeeId: user.id },
    });
    return (
      config ?? {
        employeeId: user.id,
        enabled: false,
        consentGivenAt: null,
        consentRevokedAt: null,
        windowStart: '09:00',
        windowEnd: '19:00',
        pingIntervalSec: 120,
        retentionDays: 90,
      }
    );
  }

  /**
   * Records or revokes tracking consent.
   *
   * Consent is the employee's to give and to withdraw; timestamps are
   * kept on both transitions so the record shows exactly when tracking
   * was permitted.
   */
  async setTrackingConsent(user: SessionPrincipal, enabled: boolean) {
    const now = new Date();
    return this.prisma.trackingConfig.upsert({
      where: { employeeId: user.id },
      create: {
        employeeId: user.id,
        enabled,
        consentGivenAt: enabled ? now : null,
        consentRevokedAt: enabled ? null : now,
      },
      update: {
        enabled,
        ...(enabled ? { consentGivenAt: now, consentRevokedAt: null } : { consentRevokedAt: now }),
      },
    });
  }
}

/** Great-circle distance in metres. */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
