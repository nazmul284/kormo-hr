import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import {
  PERMISSIONS, bradfordBand, bradfordFactor, computeLeaveDays, initials, proRateEntitlement,
} from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { SessionPrincipal } from '../../common/types';
import { addDays, currentYear, dateOnly, toIsoDate } from '../../common/utils/dates';
import { assertCanViewEmployee, collectSubordinateIds, companyFilter } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';
import type {
  ApplyLeaveDto, BalanceQuery, BradfordQuery, ColleaguesOnLeaveQuery, LeaveDecisionDto,
  LeaveListQuery, PreviewLeaveDto,
} from './dto';

/** Bradford Factor definition, shown alongside the score in the UI. */
const BRADFORD_FORMULA =
  'S\u00b2 \u00d7 D \u2014 S = number of absence spells, D = total days absent';

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  // ── reference data ─────────────────────────────────────────────────

  /**
   * Leave types the caller is actually eligible for. Gender-restricted
   * types are filtered out server-side rather than merely hidden by the
   * UI, so a crafted request cannot book maternity leave for anyone.
   */
  async myLeaveTypes(user: SessionPrincipal) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { gender: true, companyId: true },
    });

    const types = await this.prisma.leaveType.findMany({
      where: { companyId: employee.companyId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return types.filter((type) => {
      if (type.genderRestriction === 'FEMALE_ONLY') return employee.gender === 'FEMALE';
      if (type.genderRestriction === 'MALE_ONLY') return employee.gender === 'MALE';
      return true;
    });
  }

  async balances(user: SessionPrincipal, query: BalanceQuery) {
    const targetId = query.employeeId ? toBigInt(query.employeeId, 'employeeId') : user.id;
    if (targetId !== user.id) {
      await assertCanViewEmployee(this.prisma, user, targetId);
    }
    const year = query.year ?? currentYear();

    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: targetId, year },
      include: { leaveType: true },
      orderBy: { leaveType: { sortOrder: 'asc' } },
    });

    return {
      year,
      balances: balances.map((balance) => ({
        leaveTypeId: balance.leaveTypeId,
        key: balance.leaveType.key,
        label: balance.leaveType.label,
        colorHex: balance.leaveType.colorHex,
        entitled: Number(balance.actualLeaveCount),
        remaining: Number(balance.remainingLeaveCount),
        consumed: Number(balance.consumedCount),
        pending: Number(balance.pendingCount),
        carriedForward: Number(balance.carriedForward),
        isPaid: balance.leaveType.isPaid,
        // Available = remaining minus what is already held by pending
        // requests, which is what an employee can actually still book.
        available: Math.max(0, Number(balance.remainingLeaveCount) - Number(balance.pendingCount)),
      })),
    };
  }

  // ── applying ───────────────────────────────────────────────────────

  /**
   * Dry-run the day maths so the form can show "Leave Days" against
   * "Calendar Days" live. Shares the exact implementation the server
   * uses on submit, so the two can never disagree.
   */
  async preview(user: SessionPrincipal, dto: PreviewLeaveDto) {
    const { leaveType, math } = await this.computeRequest(user, dto);
    const year = dateOnly(dto.startDate).getUTCFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId: user.id, leaveTypeId: leaveType.id, year },
      },
    });

    const available = balance
      ? Math.max(0, Number(balance.remainingLeaveCount) - Number(balance.pendingCount))
      : 0;

    return {
      leaveType: { id: leaveType.id, key: leaveType.key, label: leaveType.label },
      calendarDays: math.calendarDays,
      leaveDays: math.leaveDays,
      weekendCount: math.weekendCount,
      holidayCount: math.holidayCount,
      days: math.days,
      balance: { available, remaining: balance ? Number(balance.remainingLeaveCount) : 0 },
      sufficientBalance: leaveType.isPaid ? math.leaveDays <= available : true,
      warnings: this.collectWarnings(leaveType, math, available, dto.startDate),
    };
  }

  private collectWarnings(
    leaveType: { key: string; isPaid: boolean; minNoticeDays: number; maxConsecutiveDays: number; requiresDocument: boolean },
    math: { leaveDays: number; calendarDays: number },
    available: number,
    startDate: string,
  ): string[] {
    const warnings: string[] = [];
    const noticeDays = Math.floor((dateOnly(startDate).getTime() - Date.now()) / 86_400_000);

    if (leaveType.isPaid && math.leaveDays > available) {
      warnings.push(
        `This exceeds your available balance by ${(math.leaveDays - available).toFixed(2)} day(s); the excess will be unpaid.`,
      );
    }
    if (leaveType.minNoticeDays > 0 && noticeDays < leaveType.minNoticeDays) {
      warnings.push(
        `This leave type normally needs ${leaveType.minNoticeDays} days' notice; you are giving ${Math.max(0, noticeDays)}.`,
      );
    }
    if (leaveType.maxConsecutiveDays > 0 && math.leaveDays > leaveType.maxConsecutiveDays) {
      warnings.push(
        `This type allows at most ${leaveType.maxConsecutiveDays} consecutive days per request.`,
      );
    }
    if (leaveType.requiresDocument) {
      warnings.push('A supporting document is required for this leave type.');
    }
    return warnings;
  }

  /** Shared validation + day maths for preview and submit. */
  private async computeRequest(user: SessionPrincipal, dto: PreviewLeaveDto | ApplyLeaveDto) {
    const start = dateOnly(dto.startDate);
    const end = dateOnly(dto.endDate);
    if (end < start) {
      throw new BadRequestException('The end date cannot be before the start date.');
    }
    // A year-long request is always a mistake, and it would generate a
    // vast number of attendance rows downstream.
    if ((end.getTime() - start.getTime()) / 86_400_000 > 365) {
      throw new BadRequestException('A single leave request cannot span more than a year.');
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { gender: true, companyId: true, locationId: true, joiningDate: true, lineManagerId: true, firstName: true, lastName: true },
    });

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId, companyId: employee.companyId, isActive: true },
    });
    if (!leaveType) throw new NotFoundException('That leave type is not available.');

    if (leaveType.genderRestriction === 'FEMALE_ONLY' && employee.gender !== 'FEMALE') {
      throw new ForbiddenException('You are not eligible for this leave type.');
    }
    if (leaveType.genderRestriction === 'MALE_ONLY' && employee.gender !== 'MALE') {
      throw new ForbiddenException('You are not eligible for this leave type.');
    }

    const holidays = await this.prisma.holiday.findMany({
      where: {
        companyId: employee.companyId,
        isOptional: false,
        startDate: { lte: end },
        endDate: { gte: start },
        OR: [{ locationId: null }, ...(employee.locationId ? [{ locationId: employee.locationId }] : [])],
      },
      select: { name: true, startDate: true, endDate: true },
    });

    const { weekendDays } = await this.tenant.get(employee.companyId);

    // Roster off-days override the default weekend for shift workers.
    const rosterOff = await this.prisma.rosterAssignment.findMany({
      where: { employeeId: user.id, date: { gte: start, lte: end }, isWeekend: true },
      select: { date: true },
    });

    const math = computeLeaveDays(toIsoDate(start), toIsoDate(end), {
      holidays: holidays.map((h) => ({
        startDate: toIsoDate(h.startDate),
        endDate: toIsoDate(h.endDate),
        name: h.name,
      })),
      countsHolidays: leaveType.countsHolidays,
      dayPart: dto.dayPart ?? 'FULL_DAY',
      rosterOffDates: rosterOff.map((r) => toIsoDate(r.date)),
      // An employee on a shift roster has their own off-days, which
      // override the company weekend entirely; everyone else gets the
      // tenant's, which the country pack sets.
      weekendDays: rosterOff.length > 0 ? [] : weekendDays,
    });

    return { leaveType, math, employee, start, end };
  }

  async apply(user: SessionPrincipal, dto: ApplyLeaveDto) {
    const { leaveType, math, employee, start, end } = await this.computeRequest(user, dto);

    if (math.leaveDays <= 0) {
      throw new BadRequestException(
        'That range contains no working days — it is entirely weekend or holiday.',
      );
    }
    if (start < employee.joiningDate) {
      throw new BadRequestException('You cannot apply for leave before your joining date.');
    }
    if (leaveType.requiresDocument && !dto.documentPath) {
      throw new BadRequestException(`${leaveType.label} requires a supporting document.`);
    }
    if (leaveType.maxConsecutiveDays > 0 && math.leaveDays > leaveType.maxConsecutiveDays) {
      throw new BadRequestException(
        `${leaveType.label} allows at most ${leaveType.maxConsecutiveDays} consecutive days per request.`,
      );
    }
    if (!employee.lineManagerId) {
      throw new BadRequestException(
        'You have no line manager assigned, so there is nobody to approve this. Contact HR.',
      );
    }

    // Overlap check against anything live or already approved.
    const overlap = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId: user.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { leaveType: { select: { label: true } } },
    });
    if (overlap) {
      throw new BadRequestException(
        `This overlaps your ${overlap.leaveType.label} from ${toIsoDate(overlap.startDate)} to ${toIsoDate(overlap.endDate)}.`,
      );
    }

    const year = start.getUTCFullYear();

    /*
     * Balance is held inside the same transaction that creates the
     * request. Doing it in one atomic step is what stops two requests
     * submitted at the same moment from both passing the balance check
     * and overdrawing the entitlement.
     */
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: { employeeId: user.id, leaveTypeId: leaveType.id, year },
        },
      });

      if (leaveType.isPaid) {
        const available = balance
          ? Number(balance.remainingLeaveCount) - Number(balance.pendingCount)
          : 0;
        if (math.leaveDays > available) {
          throw new BadRequestException(
            `You only have ${available.toFixed(2)} day(s) of ${leaveType.label} available, but requested ${math.leaveDays}.`,
          );
        }
      }

      const request = await tx.leaveRequest.create({
        data: {
          employeeId: user.id,
          leaveTypeId: leaveType.id,
          startDate: start,
          endDate: end,
          leaveDays: math.leaveDays,
          calendarDays: math.calendarDays,
          dayPart: dto.dayPart ?? 'FULL_DAY',
          isHalfDay: (dto.dayPart ?? 'FULL_DAY') !== 'FULL_DAY',
          reason: dto.reason,
          approverId: employee.lineManagerId,
          documentPath: dto.documentPath,
          contactWhileAway: dto.contactWhileAway,
          handoverToId: dto.handoverToId ? toBigInt(dto.handoverToId, 'handoverToId') : null,
        },
        include: { leaveType: { select: { label: true, key: true, colorHex: true } } },
      });

      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pendingCount: { increment: math.leaveDays } },
        });
      }

      await tx.notification.create({
        data: {
          employeeId: employee.lineManagerId!,
          kind: 'LEAVE',
          title: `${employee.firstName} ${employee.lastName} requested ${leaveType.label}`,
          body: `${toIsoDate(start)} to ${toIsoDate(end)} (${math.leaveDays} day(s)) — ${dto.reason}`,
          link: '/leave/approval',
          entityType: 'leave_request',
          entityId: String(request.id),
        },
      });

      return request;
    });
  }

  async cancel(user: SessionPrincipal, requestId: bigint) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveType: { select: { isPaid: true, label: true } } },
    });
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.employeeId !== user.id) {
      throw new ForbiddenException('You can only cancel your own leave request.');
    }
    if (!['PENDING', 'APPROVED'].includes(request.status)) {
      throw new BadRequestException('That request cannot be cancelled.');
    }
    if (request.status === 'APPROVED' && request.startDate <= new Date()) {
      throw new BadRequestException(
        'Approved leave that has already started cannot be cancelled. Speak to HR.',
      );
    }

    const year = request.startDate.getUTCFullYear();
    const days = Number(request.leaveDays);

    return this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      // Release whichever bucket the days were sitting in.
      const balanceUpdate =
        request.status === 'PENDING'
          ? { pendingCount: { decrement: days } }
          : { consumedCount: { decrement: days }, remainingLeaveCount: { increment: days } };

      await tx.leaveBalance.updateMany({
        where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year },
        data: balanceUpdate,
      });

      // Approved leave had already been written onto the attendance rows.
      if (request.status === 'APPROVED') {
        await tx.attendance.updateMany({
          where: {
            employeeId: request.employeeId,
            date: { gte: request.startDate, lte: request.endDate },
            status: { in: ['LEAVE', 'HALF_DAY'] },
          },
          data: { status: 'ABSENT' },
        });
      }

      if (request.approverId) {
        await tx.notification.create({
          data: {
            employeeId: request.approverId,
            kind: 'LEAVE',
            title: 'A leave request was withdrawn',
            body: `${request.leaveType.label}, ${toIsoDate(request.startDate)} to ${toIsoDate(request.endDate)}.`,
            link: '/leave/approval',
            entityType: 'leave_request',
            entityId: String(requestId),
          },
        });
      }

      return cancelled;
    });
  }

  // ── listings ───────────────────────────────────────────────────────

  async myRequests(user: SessionPrincipal, query: LeaveListQuery) {
    const year = query.year;
    const where: Prisma.LeaveRequestWhereInput = {
      employeeId: user.id,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(year
        ? { startDate: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { appliedDate: query.sortDir },
        skip: query.skip,
        take: query.pageSize,
        include: {
          leaveType: { select: { id: true, key: true, label: true, colorHex: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        canCancel:
          row.status === 'PENDING' ||
          (row.status === 'APPROVED' && row.startDate > new Date()),
      })),
      total,
      query,
    );
  }

  /** My Leave Report — consumption per type, plus the monthly pattern. */
  async myReport(user: SessionPrincipal, year?: number) {
    const targetYear = year ?? currentYear();
    const start = dateOnly(`${targetYear}-01-01`);
    const end = dateOnly(`${targetYear}-12-31`);

    const [requests, balances] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: user.id,
          status: 'APPROVED',
          startDate: { gte: start, lte: end },
        },
        include: { leaveType: { select: { id: true, key: true, label: true, colorHex: true } } },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.leaveBalance.findMany({
        where: { employeeId: user.id, year: targetYear },
        include: { leaveType: true },
      }),
    ]);

    const byType = new Map<number, { label: string; key: string; colorHex: string; days: number; requests: number }>();
    const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, days: 0, requests: 0 }));

    for (const request of requests) {
      const entry = byType.get(request.leaveTypeId) ?? {
        label: request.leaveType.label,
        key: request.leaveType.key,
        colorHex: request.leaveType.colorHex,
        days: 0,
        requests: 0,
      };
      entry.days += Number(request.leaveDays);
      entry.requests += 1;
      byType.set(request.leaveTypeId, entry);

      const monthIndex = request.startDate.getUTCMonth();
      byMonth[monthIndex].days += Number(request.leaveDays);
      byMonth[monthIndex].requests += 1;
    }

    return {
      year: targetYear,
      totalDaysTaken: requests.reduce((sum, r) => sum + Number(r.leaveDays), 0),
      totalRequests: requests.length,
      byType: [...byType.entries()].map(([leaveTypeId, value]) => ({ leaveTypeId, ...value })),
      byMonth,
      balances: balances.map((b) => ({
        leaveTypeId: b.leaveTypeId,
        key: b.leaveType.key,
        label: b.leaveType.label,
        colorHex: b.leaveType.colorHex,
        entitled: Number(b.actualLeaveCount),
        consumed: Number(b.consumedCount),
        remaining: Number(b.remainingLeaveCount),
      })),
      requests,
    };
  }

  async myCarryForward(user: SessionPrincipal) {
    const rows = await this.prisma.leaveCarryForward.findMany({
      where: { employeeId: user.id },
      include: { leaveType: { select: { key: true, label: true, colorHex: true, maxCarryForward: true } } },
      orderBy: { fromYear: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      isExpired: row.expiresAt !== null && row.expiresAt < new Date(),
    }));
  }

  // ── approvals ──────────────────────────────────────────────────────

  private async approverWhere(
    user: SessionPrincipal,
    status: string,
  ): Promise<Prisma.LeaveRequestWhereInput> {
    if (user.permissions.has(PERMISSIONS.LEAVE_READ_ALL)) {
      return {
        status: status as never,
        employee: { companyId: { in: user.accessibleCompanyIds } },
      };
    }
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    return {
      status: status as never,
      OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }],
    };
  }

  async approvalQueue(user: SessionPrincipal, query: LeaveListQuery) {
    const where = await this.approverWhere(user, query.status ?? 'PENDING');

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { appliedDate: 'asc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          leaveType: { select: { id: true, key: true, label: true, colorHex: true } },
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              thumbnailsPath01: true,
              designation: { select: { name: true } },
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        // Column abbreviations as printed in the approval grid.
        sn: 0,
        id: row.id,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
        sd: row.startDate,
        ed: row.endDate,
        ld: Number(row.leaveDays),
        lt: row.leaveType.label,
        ad: row.appliedDate,
        reason: row.reason,
        status: row.status,
        documentPath: row.documentPath,
        contactWhileAway: row.contactWhileAway,
        leaveType: row.leaveType,
        employee: {
          ...row.employee,
          fullName: `${row.employee.firstName} ${row.employee.lastName}`,
          initials: initials(row.employee.firstName, row.employee.lastName),
        },
      })).map((row, index) => ({ ...row, sn: query.skip + index + 1 })),
      total,
      query,
    );
  }

  /**
   * Approving leave both moves the balance from pending to consumed and
   * stamps the attendance rows, so the monthly grid and payroll agree
   * with the decision immediately.
   */
  async decide(user: SessionPrincipal, requestId: bigint, dto: LeaveDecisionDto) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        leaveType: { select: { label: true, isPaid: true } },
        employee: { select: { companyId: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }

    const isApprover = request.approverId === user.id;
    const isAdmin = user.permissions.has(PERMISSIONS.LEAVE_READ_ALL) &&
      user.permissions.has(PERMISSIONS.LEAVE_APPROVE);
    if (!isApprover) {
      if (!isAdmin) {
        const subordinates = await collectSubordinateIds(this.prisma, user.id);
        if (!subordinates.some((id) => id === request.employeeId)) {
          throw new ForbiddenException('You are not the approver for this request.');
        }
      } else if (!user.accessibleCompanyIds.includes(request.employee.companyId)) {
        throw new ForbiddenException('That request belongs to a company you do not have access to.');
      }
    }
    if (request.employeeId === user.id) {
      throw new ForbiddenException('You cannot approve your own leave request.');
    }

    const approved = dto.decision === 'APPROVED';
    const days = Number(request.leaveDays);
    const year = request.startDate.getUTCFullYear();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: dto.decision,
          approverId: user.id,
          approvedAt: approved ? new Date() : null,
          decisionNote: dto.note,
        },
      });

      await tx.leaveBalance.updateMany({
        where: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year },
        data: approved
          ? {
              pendingCount: { decrement: days },
              consumedCount: { increment: days },
              remainingLeaveCount: { decrement: days },
            }
          : { pendingCount: { decrement: days } },
      });

      if (approved) {
        // Stamp the days onto attendance. Weekends and holidays inside
        // the range keep their own status — only chargeable days change.
        const chargeableDates = await tx.attendance.findMany({
          where: {
            employeeId: request.employeeId,
            date: { gte: request.startDate, lte: request.endDate },
            status: { notIn: ['WEEKEND', 'HOLIDAY', 'CONDITIONAL_WEEKEND'] },
          },
          select: { id: true },
        });
        if (chargeableDates.length > 0) {
          await tx.attendance.updateMany({
            where: { id: { in: chargeableDates.map((x) => x.id) } },
            data: {
              status: request.isHalfDay ? 'HALF_DAY' : 'LEAVE',
              attendanceAdditionalInfo: { leaveRequestId: Number(requestId), leaveTypeId: request.leaveTypeId },
            },
          });
        }
      }

      await tx.notification.create({
        data: {
          employeeId: request.employeeId,
          kind: 'LEAVE',
          title: `Your ${request.leaveType.label} request was ${dto.decision.toLowerCase()}`,
          body: `${toIsoDate(request.startDate)} to ${toIsoDate(request.endDate)}${dto.note ? ` — ${dto.note}` : ''}`,
          link: '/leave',
          entityType: 'leave_request',
          entityId: String(requestId),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          companyId: request.employee.companyId,
          action: `leave.${dto.decision.toLowerCase()}`,
          entityType: 'leave_request',
          entityId: String(requestId),
          before: { status: 'PENDING' },
          after: { status: dto.decision, note: dto.note ?? null, days },
        },
      });

      return updated;
    });
  }

  /** Leave Request Archive — everything already decided. */
  async archive(user: SessionPrincipal, query: LeaveListQuery) {
    // approverWhere pins a single status; the archive wants the whole
    // decided set unless the caller narrowed it, so build the scope
    // separately from the status filter.
    const scoped = await this.approverWhere(user, 'APPROVED');
    const { status: _ignored, ...scope } = scoped;

    const where: Prisma.LeaveRequestWhereInput = {
      ...scope,
      status: query.status
        ? (query.status as never)
        : { in: ['APPROVED', 'REJECTED', 'CANCELLED'] },
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(query.year
        ? {
            startDate: {
              gte: dateOnly(`${query.year}-01-01`),
              lte: dateOnly(`${query.year}-12-31`),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { appliedDate: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          leaveType: { select: { id: true, label: true, colorHex: true } },
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              designation: { select: { name: true } },
            },
          },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        employee: {
          ...row.employee,
          fullName: `${row.employee.firstName} ${row.employee.lastName}`,
          initials: initials(row.employee.firstName, row.employee.lastName),
        },
      })),
      total,
      query,
    );
  }

  // ── Bradford factor ────────────────────────────────────────────────

  /**
   * Bradford scores sickness-absence *frequency*, not volume: S² × D.
   * Only unplanned absence counts, so annual leave is excluded — scoring
   * planned holiday would make the metric meaningless.
   */
  async bradford(user: SessionPrincipal, query: BradfordQuery) {
    const year = query.year ?? currentYear();
    const start = dateOnly(`${year}-01-01`);
    const end = dateOnly(`${year}-12-31`);

    const employeeIds = query.team
      ? await collectSubordinateIds(this.prisma, user.id)
      : [user.id];

    if (query.team && employeeIds.length === 0) {
      // Same shape as the populated response: a caller reading `.self`
      // should not have to narrow a union.
      return { year, formula: BRADFORD_FORMULA, employees: [], self: null };
    }
    if (query.team && !user.permissions.has(PERMISSIONS.LEAVE_BRADFORD)) {
      throw new ForbiddenException('You do not have permission to view team Bradford scores.');
    }

    const [requests, employees] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          startDate: { gte: start, lte: end },
          // Unplanned absence only.
          leaveType: { key: { in: ['sick', 'casual', 'lwp'] } },
        },
        select: { employeeId: true, startDate: true, endDate: true, leaveDays: true, leaveType: { select: { key: true, label: true } } },
      }),
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true, employeeVisibleId: true, firstName: true, lastName: true,
          designation: { select: { name: true } }, department: { select: { name: true } },
        },
      }),
    ]);

    const byEmployee = new Map<string, typeof requests>();
    for (const request of requests) {
      const key = String(request.employeeId);
      byEmployee.set(key, [...(byEmployee.get(key) ?? []), request]);
    }

    const scored = employees.map((employee) => {
      const spells = byEmployee.get(String(employee.id)) ?? [];
      const result = bradfordFactor(
        spells.map((s) => ({
          startDate: toIsoDate(s.startDate),
          endDate: toIsoDate(s.endDate),
          days: Number(s.leaveDays),
        })),
      );
      return {
        employee: {
          ...employee,
          fullName: `${employee.firstName} ${employee.lastName}`,
          initials: initials(employee.firstName, employee.lastName),
        },
        score: result.score,
        band: bradfordBand(result.score),
        spellCount: result.spellCount,
        totalDays: result.totalDays,
        spells: spells.map((s) => ({
          startDate: s.startDate,
          endDate: s.endDate,
          days: Number(s.leaveDays),
          leaveType: s.leaveType.label,
        })),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
      year,
      formula: BRADFORD_FORMULA,
      employees: scored,
      ...(query.team ? {} : { self: scored[0] ?? null }),
    };
  }

  // ── colleagues on leave ────────────────────────────────────────────

  async colleaguesOnLeave(user: SessionPrincipal, query: ColleaguesOnLeaveQuery) {
    const date = query.date ? dateOnly(query.date) : dateOnly(new Date());
    const companyIds = companyFilter(user, query.companyId);

    const where: Prisma.LeaveRequestWhereInput = {
      status: 'APPROVED',
      startDate: { lte: date },
      endDate: { gte: date },
      employee: {
        active: true,
        companyId: { in: companyIds },
        ...(query.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        orderBy: { employee: { firstName: 'asc' } },
        skip: query.skip,
        take: query.pageSize,
        include: {
          leaveType: { select: { key: true, label: true, colorHex: true } },
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              thumbnailsPath01: true, officialContact: true, officialEmail: true,
              designation: { select: { name: true } },
              department: { select: { id: true, name: true } },
              company: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      date: toIsoDate(date),
      ...paginate(
        rows.map((row) => ({
          employee: {
            ...row.employee,
            fullName: `${row.employee.firstName} ${row.employee.lastName}`,
            initials: initials(row.employee.firstName, row.employee.lastName),
          },
          department: row.employee.department?.name ?? null,
          designation: row.employee.designation?.name ?? null,
          company: row.employee.company.name,
          // The status column shows the type, plus whether they are back soon.
          status: row.leaveType.label,
          leaveType: row.leaveType,
          startDate: row.startDate,
          endDate: row.endDate,
          returnsOn: addDays(row.endDate, 1),
          isLastDay: toIsoDate(row.endDate) === toIsoDate(date),
        })),
        total,
        query,
      ),
    };
  }
}
