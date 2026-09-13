import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, initials, minutesToHm, shiftLabel, timeOfDay } from '@kormo/shared';
import type { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { SessionPrincipal } from '../../common/types';
import {
  addDays, atLocalTime, dateOnly, endOfMonth, monthWindow, startOfMonth, startOfWeek, toIsoDate,
} from '../../common/utils/dates';
import { assertCanViewEmployee, collectSubordinateIds } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';
import type {
  ApprovalQueueQuery, AttendanceEditRequestDto, AttendanceQuery, CompensationRequestDto,
  DecisionDto, MonthQuery, OvertimeRequestDto, RosterQuery, ShiftExchangeRequestDto,
} from './dto';

/** Statuses that represent a day the employee was expected at work. */
const WORKING_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'AFL', 'LEAVE', 'HALF_DAY'] as const;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /** Resolves an optional employeeId param, defaulting to the caller. */
  private async resolveTarget(user: SessionPrincipal, employeeId?: string): Promise<bigint> {
    if (!employeeId) return user.id;
    const target = toBigInt(employeeId, 'employeeId');
    if (target !== user.id) {
      if (!user.permissions.has(PERMISSIONS.ATTENDANCE_READ_TEAM) &&
          !user.permissions.has(PERMISSIONS.ATTENDANCE_READ_ALL)) {
        throw new ForbiddenException("You cannot view another employee's attendance.");
      }
      await assertCanViewEmployee(this.prisma, user, target);
    }
    return target;
  }

  // ── monthly grid ───────────────────────────────────────────────────

  /**
   * The My Attendance grid: one row per calendar day with the
   * IT / OT / LT / BT / TH / OTH columns, plus the summary chips.
   */
  async monthly(user: SessionPrincipal, query: AttendanceQuery) {
    const targetId = await this.resolveTarget(user, query.employeeId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(month, year);

    const canViewBreak =
      targetId === user.id ||
      user.permissions.has(PERMISSIONS.ATTENDANCE_VIEW_BREAKTIME) ||
      user.features['canViewBreaktime'] === true;

    const [rows, editRequests] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          employeeId: targetId,
          date: { gte: start, lte: end },
          ...(query.status ? { status: query.status as never } : {}),
        },
        orderBy: { date: 'asc' },
        include: canViewBreak ? { breaks: true } : undefined,
      }),
      this.prisma.attendanceEditRequest.findMany({
        where: { employeeId: targetId, createdAt: { gte: addDays(start, -30) } },
        select: { id: true, attendanceId: true, status: true, reason: true, createdAt: true },
      }),
    ]);

    const editByAttendance = new Map(editRequests.map((r) => [String(r.attendanceId), r]));

    const days = rows.map((row, index) => {
      const editRequest = editByAttendance.get(String(row.id));
      return {
        sn: index + 1,
        id: row.id,
        date: row.date,
        day: row.date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        shiftName:
          row.attendanceRosterShiftName && row.attendanceRosterStartTime && row.attendanceRosterEndTime
            ? shiftLabel(
                row.attendanceRosterShiftName,
                row.attendanceRosterStartTime,
                row.attendanceRosterEndTime,
              )
            : row.attendanceRosterShiftName,
        // Column abbreviations as printed in the grid.
        inTime: timeOfDay(row.inTime),
        outTime: timeOfDay(row.outTime),
        lateTime: minutesToHm(row.lateTimeMinutes),
        breakTime: canViewBreak ? minutesToHm(row.breakTimeMinutes) : null,
        totalHours: minutesToHm(row.totalWorkMinutes),
        overtimeHours: minutesToHm(Math.round(row.otTimeInSeconds / 60)),
        status: row.status,
        rawInTime: row.inTime,
        rawOutTime: row.outTime,
        lateTimeMinutes: row.lateTimeMinutes,
        totalWorkMinutes: row.totalWorkMinutes,
        isEdited: row.isEdited,
        editRequest: editRequest ?? null,
        compensationLeaveApplicable: row.compensationLeaveApplicable,
        additionalInfo: row.attendanceAdditionalInfo,
        breaks: canViewBreak ? (row as { breaks?: unknown[] }).breaks ?? [] : undefined,
        // A missing punch is what the employee needs to act on.
        needsCorrection:
          ['PRESENT', 'LATE'].includes(row.status) && (row.inTime === null || row.outTime === null),
      };
    });

    const count = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;

    return {
      month,
      year,
      days,
      summary: {
        total: rows.length,
        present: count(['PRESENT']),
        late: count(['LATE']),
        halfDayLeave: count(['HALF_DAY']),
        absent: count(['ABSENT']),
        leave: count(['LEAVE']),
        afl: count(['AFL']),
        holiday: count(['HOLIDAY']),
        weekend: count(['WEEKEND']),
        conditionalWeekend: count(['CONDITIONAL_WEEKEND']),
        workingDays: rows.filter((r) => WORKING_STATUSES.includes(r.status as never)).length,
        totalWorkMinutes: rows.reduce((sum, r) => sum + r.totalWorkMinutes, 0),
        totalLateMinutes: rows.reduce((sum, r) => sum + r.lateTimeMinutes, 0),
        totalOvertimeMinutes: rows.reduce((sum, r) => sum + Math.round(r.otTimeInSeconds / 60), 0),
      },
      capabilities: { canViewBreaktime: canViewBreak, canRequestEdit: targetId === user.id },
    };
  }

  /** Donut + sparkline data for the dashboard attendance widget. */
  async monthlyStats(user: SessionPrincipal, query: MonthQuery, employeeId?: bigint) {
    const targetId = employeeId ?? user.id;
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(month, year);

    const rows = await this.prisma.attendance.findMany({
      where: { employeeId: targetId, date: { gte: start, lte: end } },
      select: { date: true, status: true, totalWorkMinutes: true, lateTimeMinutes: true },
      orderBy: { date: 'asc' },
    });

    const working = rows.filter((r) => WORKING_STATUSES.includes(r.status as never));
    const presentDays = rows.filter((r) => r.status === 'PRESENT').length;
    const lateDays = rows.filter((r) => r.status === 'LATE').length;
    const absentDays = rows.filter((r) => ['ABSENT', 'AFL'].includes(r.status)).length;
    // Percentages are against expected working days, not calendar days —
    // otherwise a month with a long Eid holiday looks like mass absence.
    const denominator = Math.max(1, working.length);

    const pct = (value: number) => Math.round((value / denominator) * 1000) / 10;

    return {
      month,
      year,
      onTimePct: pct(presentDays),
      latePct: pct(lateDays),
      absentPct: pct(absentDays),
      presentDays,
      lateDays,
      absentDays,
      leaveDays: rows.filter((r) => ['LEAVE', 'HALF_DAY'].includes(r.status)).length,
      workingDays: working.length,
      trend: rows.map((r) => ({
        date: toIsoDate(r.date),
        workMinutes: r.totalWorkMinutes,
        status: r.status,
      })),
    };
  }

  /** Current-week totals for the dashboard stats widget. */
  async currentWeek(user: SessionPrincipal, employeeId?: bigint) {
    const targetId = employeeId ?? user.id;
    const { weekendDays } = await this.tenant.get(user.companyId);
    // Start the week on the day after the last weekend day, so the grid
    // shows a run of working days followed by the weekend rather than
    // splitting the weekend across two rows.
    const weekStartsOn = weekendDays.length > 0
      ? (weekendDays[weekendDays.length - 1] + 1) % 7
      : 0;
    const weekStart = startOfWeek(new Date(), weekStartsOn);
    const weekEnd = addDays(weekStart, 6);

    const rows = await this.prisma.attendance.findMany({
      where: { employeeId: targetId, date: { gte: weekStart, lte: weekEnd } },
      select: { status: true, totalWorkMinutes: true, lateTimeMinutes: true },
    });

    const worked = rows.filter((r) => ['PRESENT', 'LATE'].includes(r.status));
    const totalWorkMinutes = worked.reduce((sum, r) => sum + r.totalWorkMinutes, 0);
    const totalLateMinutes = worked.reduce((sum, r) => sum + r.lateTimeMinutes, 0);
    const divisor = Math.max(1, worked.length);

    return {
      weekStart: toIsoDate(weekStart),
      weekEnd: toIsoDate(weekEnd),
      daysWorked: worked.length,
      totalWorkMinutes,
      averageWorkMinutes: Math.round(totalWorkMinutes / divisor),
      averageLateMinutes: Math.round(totalLateMinutes / divisor),
      totalWorkHours: minutesToHm(totalWorkMinutes),
      averageWorkHours: minutesToHm(Math.round(totalWorkMinutes / divisor)),
      averageLateTime: minutesToHm(Math.round(totalLateMinutes / divisor)),
    };
  }

  /** Mini-calendar dots for the dashboard. */
  async calendar(user: SessionPrincipal, query: MonthQuery, employeeId?: bigint) {
    const targetId = employeeId ?? user.id;
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(month, year);

    const [rows, holidays] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { employeeId: targetId, date: { gte: start, lte: end } },
        select: { date: true, status: true },
      }),
      this.prisma.holiday.findMany({
        where: {
          companyId: user.companyId,
          isOptional: false,
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: { name: true, startDate: true, endDate: true },
      }),
    ]);

    const holidayByDate = new Map<string, string>();
    for (const holiday of holidays) {
      for (let t = holiday.startDate.getTime(); t <= holiday.endDate.getTime(); t += 86_400_000) {
        holidayByDate.set(toIsoDate(new Date(t)), holiday.name);
      }
    }

    const byDate = new Map(rows.map((r) => [toIsoDate(r.date), r.status]));
    const days: {
      date: string;
      status: string | null;
      isWeekend: boolean;
      isHoliday: boolean;
      holidayName?: string;
      isToday: boolean;
      isFuture: boolean;
    }[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      const date = new Date(t);
      const iso = toIsoDate(date);
      const status = byDate.get(iso) ?? null;
      days.push({
        date: iso,
        status,
        isWeekend: [5, 6].includes(date.getUTCDay()),
        isHoliday: holidayByDate.has(iso),
        holidayName: holidayByDate.get(iso),
        isToday: iso === toIsoDate(new Date()),
        isFuture: date > new Date(),
      });
    }

    return { month, year, days };
  }

  // ── edit requests ──────────────────────────────────────────────────

  async createEditRequest(user: SessionPrincipal, dto: AttendanceEditRequestDto) {
    if (!dto.requestedInTime && !dto.requestedOutTime) {
      throw new BadRequestException('Provide a corrected in-time, out-time, or both.');
    }

    const date = dateOnly(dto.date);
    if (date > new Date()) {
      throw new BadRequestException('You cannot request a correction for a future date.');
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: user.id, date } },
    });
    if (!attendance) {
      throw new NotFoundException(`No attendance record exists for ${dto.date}.`);
    }
    if (['WEEKEND', 'HOLIDAY'].includes(attendance.status)) {
      throw new BadRequestException(
        'That day was a weekend or holiday. Raise a compensation request instead.',
      );
    }

    const pending = await this.prisma.attendanceEditRequest.findFirst({
      where: { attendanceId: attendance.id, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestException('A correction request for that day is already awaiting approval.');
    }

    const { timezone } = await this.tenant.get(user.companyId);
    const requestedInTime = dto.requestedInTime ? atLocalTime(date, dto.requestedInTime, timezone) : attendance.inTime;
    const requestedOutTime = dto.requestedOutTime ? atLocalTime(date, dto.requestedOutTime, timezone) : attendance.outTime;

    if (requestedInTime && requestedOutTime && requestedOutTime <= requestedInTime) {
      // Overnight shifts legitimately end "before" they start on the clock;
      // only reject when the shift is not a night shift.
      const isNightShift = attendance.attendanceRosterShiftName?.toLowerCase() === 'night';
      if (!isNightShift) {
        throw new BadRequestException('The out-time must be after the in-time.');
      }
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { lineManagerId: true, firstName: true, lastName: true },
    });
    if (!employee.lineManagerId) {
      throw new BadRequestException(
        'You have no line manager assigned, so there is nobody to approve this. Contact HR.',
      );
    }

    const [request] = await this.prisma.$transaction([
      this.prisma.attendanceEditRequest.create({
        data: {
          attendanceId: attendance.id,
          employeeId: user.id,
          requestedInTime,
          requestedOutTime,
          requestedStatus: 'PRESENT',
          reason: dto.reason,
          approverId: employee.lineManagerId,
        },
      }),
      this.prisma.attendance.update({
        where: { id: attendance.id },
        data: { sendEditRequest: true, editReason: dto.reason, sendingDate: new Date() },
      }),
      this.prisma.notification.create({
        data: {
          employeeId: employee.lineManagerId,
          kind: 'ATTENDANCE',
          title: `${employee.firstName} ${employee.lastName} requested an attendance correction`,
          body: `For ${dto.date} — ${dto.reason}`,
          link: '/attendance/approvals',
          entityType: 'attendance_edit_request',
          entityId: String(attendance.id),
        },
      }),
    ]);

    return request;
  }

  async listMyEditRequests(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const where: Prisma.AttendanceEditRequestWhereInput = {
      employeeId: user.id,
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.attendanceEditRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          attendance: { select: { date: true, inTime: true, outTime: true, status: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.attendanceEditRequest.count({ where }),
    ]);
    return paginate(rows, total, query);
  }

  async editRequestQueue(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const where = await this.approverScope(user, query.status);
    const [rows, total] = await Promise.all([
      this.prisma.attendanceEditRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          attendance: { select: { date: true, inTime: true, outTime: true, status: true, attendanceRosterShiftName: true } },
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
      this.prisma.attendanceEditRequest.count({ where }),
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

  /**
   * Which requests a caller may act on.
   *
   * An admin with the override permission sees everything in their
   * companies; a line manager sees only requests routed to them.
   */
  private async approverScope(
    user: SessionPrincipal,
    status?: string,
  ): Promise<Prisma.AttendanceEditRequestWhereInput> {
    const statusFilter = status ? { status: status as never } : { status: 'PENDING' as never };

    if (user.permissions.has(PERMISSIONS.ATTENDANCE_OVERRIDE)) {
      return {
        ...statusFilter,
        employee: { companyId: { in: user.accessibleCompanyIds } },
      };
    }

    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    return {
      ...statusFilter,
      OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }],
    };
  }

  async decideEditRequest(user: SessionPrincipal, requestId: bigint, dto: DecisionDto) {
    const request = await this.prisma.attendanceEditRequest.findUnique({
      where: { id: requestId },
      include: {
        attendance: true,
        employee: { select: { companyId: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new NotFoundException('Correction request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }

    const isAdmin = user.permissions.has(PERMISSIONS.ATTENDANCE_OVERRIDE);
    const isApprover = request.approverId === user.id;
    if (!isApprover && !isAdmin) {
      throw new ForbiddenException('You are not the approver for this request.');
    }
    if (isAdmin && !user.accessibleCompanyIds.includes(request.employee.companyId)) {
      throw new ForbiddenException('That request belongs to a company you do not have access to.');
    }
    if (isAdmin && !isApprover && !request.attendance.allowedForOverridingRequestAction) {
      throw new ForbiddenException('This request is locked against administrative override.');
    }

    const approved = dto.decision === 'APPROVED';
    const now = new Date();

    // Approving rewrites the attendance row, so the corrected times are
    // what payroll and the monthly grid see from then on.
    const attendanceUpdate: Prisma.AttendanceUpdateInput = approved
      ? {
          inTime: request.requestedInTime ?? request.attendance.inTime,
          outTime: request.requestedOutTime ?? request.attendance.outTime,
          updatedInTime: request.requestedInTime,
          updatedOutTime: request.requestedOutTime,
          updatedStatus: request.requestedStatus,
          status: request.requestedStatus ?? request.attendance.status,
          isEdited: true,
          isInTimeEdited: request.requestedInTime !== null,
          isOutTimeEdited: request.requestedOutTime !== null,
          isAcceptedByLm: true,
          isRejectedByLm: false,
          acceptedDate: now,
          sendEditRequest: false,
          actionOverridenByAdmin: isAdmin && !isApprover,
        }
      : {
          isAcceptedByLm: false,
          isRejectedByLm: true,
          rejectedDate: now,
          sendEditRequest: false,
          actionOverridenByAdmin: isAdmin && !isApprover,
        };

    const [updated] = await this.prisma.$transaction([
      this.prisma.attendanceEditRequest.update({
        where: { id: requestId },
        data: {
          status: dto.decision,
          decisionNote: dto.note,
          decidedAt: now,
          approverId: user.id,
          overriddenByAdmin: isAdmin && !isApprover,
        },
      }),
      this.prisma.attendance.update({ where: { id: request.attendanceId }, data: attendanceUpdate }),
      this.prisma.notification.create({
        data: {
          employeeId: request.employeeId,
          kind: 'ATTENDANCE',
          title: `Your attendance correction was ${dto.decision.toLowerCase()}`,
          body: `${toIsoDate(request.attendance.date)}${dto.note ? ` — ${dto.note}` : ''}`,
          link: '/attendance',
          entityType: 'attendance_edit_request',
          entityId: String(requestId),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          companyId: request.employee.companyId,
          action: `attendance.edit_request.${dto.decision.toLowerCase()}`,
          entityType: 'attendance_edit_request',
          entityId: String(requestId),
          before: { status: 'PENDING' },
          after: { status: dto.decision, note: dto.note ?? null },
        },
      }),
    ]);

    return updated;
  }

  // ── roster / shift calendar ────────────────────────────────────────

  async roster(user: SessionPrincipal, query: RosterQuery) {
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(month, year);

    let employeeIds: bigint[];
    if (query.subordinates) {
      if (!user.permissions.has(PERMISSIONS.ATTENDANCE_READ_TEAM) &&
          !user.permissions.has(PERMISSIONS.ROSTER_WRITE)) {
        throw new ForbiddenException("You cannot view your team's roster.");
      }
      employeeIds = await collectSubordinateIds(this.prisma, user.id);
      if (employeeIds.length === 0) return { month, year, employees: [] };
    } else {
      employeeIds = [await this.resolveTarget(user, query.employeeId)];
    }

    const [assignments, employees] = await Promise.all([
      this.prisma.rosterAssignment.findMany({
        where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } },
        include: { shift: { select: { id: true, name: true, startTime: true, endTime: true, colorHex: true, isNightShift: true } } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true, employeeVisibleId: true, firstName: true, lastName: true,
          thumbnailsPath01: true, designation: { select: { name: true } },
        },
      }),
    ]);

    const byEmployee = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const key = String(assignment.employeeId);
      byEmployee.set(key, [...(byEmployee.get(key) ?? []), assignment]);
    }

    return {
      month,
      year,
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeVisibleId: employee.employeeVisibleId,
        fullName: `${employee.firstName} ${employee.lastName}`,
        initials: initials(employee.firstName, employee.lastName),
        designation: employee.designation?.name ?? null,
        avatarUrl: employee.thumbnailsPath01,
        days: (byEmployee.get(String(employee.id)) ?? []).map((assignment) => ({
          date: toIsoDate(assignment.date),
          shiftId: assignment.shiftId,
          shiftName: assignment.shift?.name ?? null,
          shiftLabel:
            assignment.shift
              ? shiftLabel(assignment.shift.name, assignment.shift.startTime, assignment.shift.endTime)
              : null,
          startTime: assignment.shift?.startTime ?? null,
          endTime: assignment.shift?.endTime ?? null,
          colorHex: assignment.shift?.colorHex ?? null,
          isWeekend: assignment.isWeekend,
          isConditionalWeekend: assignment.isConditionalWeekend,
        })),
      })),
    };
  }

  // ── overtime ───────────────────────────────────────────────────────

  async createOvertimeRequest(user: SessionPrincipal, dto: OvertimeRequestDto) {
    const date = dateOnly(dto.date);
    const { timezone } = await this.tenant.get(user.companyId);
    const from = atLocalTime(date, dto.fromTime, timezone);
    let to = atLocalTime(date, dto.toTime, timezone);
    // Overtime running past midnight is normal for warehouse shifts.
    if (to <= from) to = addDays(to, 1);

    const hours = Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100;
    if (hours <= 0 || hours > 12) {
      throw new BadRequestException('Overtime must be between 0 and 12 hours.');
    }

    const existing = await this.prisma.overtimeRequest.findFirst({
      where: { employeeId: user.id, date, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existing) {
      throw new BadRequestException('You already have an overtime request for that date.');
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { lineManagerId: true, firstName: true, lastName: true },
    });

    const request = await this.prisma.overtimeRequest.create({
      data: {
        employeeId: user.id,
        date,
        fromTime: dto.fromTime,
        toTime: dto.toTime,
        hours,
        reason: dto.reason,
        approverId: employee.lineManagerId,
      },
    });

    if (employee.lineManagerId) {
      await this.prisma.notification.create({
        data: {
          employeeId: employee.lineManagerId,
          kind: 'ATTENDANCE',
          title: `${employee.firstName} ${employee.lastName} requested ${hours}h overtime`,
          body: `${dto.date} — ${dto.reason}`,
          link: '/attendance/overtime',
          entityType: 'overtime_request',
          entityId: String(request.id),
        },
      });
    }

    return request;
  }

  async listMyOvertime(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const where: Prisma.OvertimeRequestWhereInput = {
      employeeId: user.id,
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where, orderBy: { date: 'desc' }, skip: query.skip, take: query.pageSize,
        include: { approver: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    const approvedHours = await this.prisma.overtimeRequest.aggregate({
      where: { employeeId: user.id, status: 'APPROVED' },
      _sum: { hours: true },
    });

    return { ...paginate(rows, total, query), totalApprovedHours: approvedHours._sum.hours ?? 0 };
  }

  async overtimeQueue(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    const where: Prisma.OvertimeRequestWhereInput = {
      status: (query.status ?? 'PENDING') as never,
      ...(user.permissions.has(PERMISSIONS.ATTENDANCE_READ_ALL)
        ? { employee: { companyId: { in: user.accessibleCompanyIds } } }
        : { OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }] }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where, orderBy: { date: 'asc' }, skip: query.skip, take: query.pageSize,
        include: {
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              designation: { select: { name: true } }, department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.overtimeRequest.count({ where }),
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

  async decideOvertime(user: SessionPrincipal, requestId: bigint, dto: DecisionDto) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true, lineManagerId: true } } },
    });
    if (!request) throw new NotFoundException('Overtime request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }
    await this.assertCanApprove(user, request.approverId, request.employeeId, request.employee.companyId);

    const updated = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { status: dto.decision, decisionNote: dto.note, decidedAt: new Date(), approverId: user.id },
    });

    await this.prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        kind: 'ATTENDANCE',
        title: `Your overtime request was ${dto.decision.toLowerCase()}`,
        body: `${toIsoDate(request.date)} — ${request.hours}h${dto.note ? ` — ${dto.note}` : ''}`,
        link: '/attendance/overtime',
        entityType: 'overtime_request',
        entityId: String(requestId),
      },
    });

    return updated;
  }

  // ── compensation (comp-off) ────────────────────────────────────────

  async createCompensationRequest(user: SessionPrincipal, dto: CompensationRequestDto) {
    const workedDate = dateOnly(dto.workedDate);

    // Only a day actually worked outside the roster earns a comp-off, and
    // the attendance record is the evidence.
    const attendance = await this.prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: user.id, date: workedDate } },
      select: { status: true, compensationLeaveApplicable: true, inTime: true },
    });
    if (!attendance) {
      throw new NotFoundException(`No attendance record exists for ${dto.workedDate}.`);
    }
    if (!attendance.compensationLeaveApplicable) {
      throw new BadRequestException(
        'That day does not qualify for compensatory leave. It must be a weekend or holiday you actually worked.',
      );
    }

    const existing = await this.prisma.compensationRequest.findFirst({
      where: { employeeId: user.id, workedDate, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existing) {
      throw new BadRequestException('You have already claimed compensatory leave for that day.');
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { lineManagerId: true, firstName: true, lastName: true },
    });

    const request = await this.prisma.compensationRequest.create({
      data: {
        employeeId: user.id,
        workedDate,
        requestedOffDate: dto.requestedOffDate ? dateOnly(dto.requestedOffDate) : null,
        reason: dto.reason,
        approverId: employee.lineManagerId,
        // Comp-off lapses after 90 days, so it cannot be hoarded.
        expiresAt: addDays(workedDate, 90),
      },
    });

    if (employee.lineManagerId) {
      await this.prisma.notification.create({
        data: {
          employeeId: employee.lineManagerId,
          kind: 'ATTENDANCE',
          title: `${employee.firstName} ${employee.lastName} claimed compensatory leave`,
          body: `Worked ${dto.workedDate} — ${dto.reason}`,
          link: '/attendance/compensation',
          entityType: 'compensation_request',
          entityId: String(request.id),
        },
      });
    }

    return request;
  }

  async listMyCompensation(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const where: Prisma.CompensationRequestWhereInput = {
      employeeId: user.id,
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.compensationRequest.findMany({
        where, orderBy: { workedDate: 'desc' }, skip: query.skip, take: query.pageSize,
        include: { approver: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.compensationRequest.count({ where }),
    ]);
    return paginate(
      rows.map((row) => ({
        ...row,
        isExpired: row.expiresAt !== null && row.expiresAt < new Date() && row.consumedAt === null,
      })),
      total,
      query,
    );
  }

  async compensationQueue(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    const where: Prisma.CompensationRequestWhereInput = {
      status: (query.status ?? 'PENDING') as never,
      ...(user.permissions.has(PERMISSIONS.ATTENDANCE_READ_ALL)
        ? { employee: { companyId: { in: user.accessibleCompanyIds } } }
        : { OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }] }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.compensationRequest.findMany({
        where, orderBy: { workedDate: 'asc' }, skip: query.skip, take: query.pageSize,
        include: {
          employee: {
            select: {
              id: true, employeeVisibleId: true, firstName: true, lastName: true,
              designation: { select: { name: true } }, department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.compensationRequest.count({ where }),
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

  /**
   * Approving a comp-off claim credits the employee's comp_off leave
   * balance, which is what makes it actually spendable.
   */
  async decideCompensation(user: SessionPrincipal, requestId: bigint, dto: DecisionDto) {
    const request = await this.prisma.compensationRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { companyId: true } } },
    });
    if (!request) throw new NotFoundException('Compensation request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }
    await this.assertCanApprove(user, request.approverId, request.employeeId, request.employee.companyId);

    const updated = await this.prisma.compensationRequest.update({
      where: { id: requestId },
      data: { status: dto.decision, decisionNote: dto.note, decidedAt: new Date(), approverId: user.id },
    });

    if (dto.decision === 'APPROVED') {
      const compOffType = await this.prisma.leaveType.findFirst({
        where: { companyId: request.employee.companyId, key: 'comp_off' },
        select: { id: true },
      });
      if (compOffType) {
        const year = new Date().getUTCFullYear();
        const days = Number(request.days);
        await this.prisma.leaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId, leaveTypeId: compOffType.id, year,
            },
          },
          create: {
            employeeId: request.employeeId,
            leaveTypeId: compOffType.id,
            year,
            actualLeaveCount: days,
            remainingLeaveCount: days,
          },
          update: {
            actualLeaveCount: { increment: days },
            remainingLeaveCount: { increment: days },
          },
        });
      }
    }

    await this.prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        kind: 'ATTENDANCE',
        title: `Your compensatory leave claim was ${dto.decision.toLowerCase()}`,
        body: `Worked ${toIsoDate(request.workedDate)}${dto.note ? ` — ${dto.note}` : ''}`,
        link: '/attendance/compensation',
        entityType: 'compensation_request',
        entityId: String(requestId),
      },
    });

    return updated;
  }

  // ── shift exchange ─────────────────────────────────────────────────

  async createShiftExchange(user: SessionPrincipal, dto: ShiftExchangeRequestDto) {
    const counterpartyId = toBigInt(dto.counterpartyId, 'counterpartyId');
    if (counterpartyId === user.id) {
      throw new BadRequestException('You cannot swap a shift with yourself.');
    }

    const date = dateOnly(dto.date);
    const counterpartyDate = dateOnly(dto.counterpartyDate);
    if (date < new Date()) {
      throw new BadRequestException('You can only swap a future shift.');
    }

    const [mine, theirs, counterparty] = await Promise.all([
      this.prisma.rosterAssignment.findUnique({
        where: { employeeId_date: { employeeId: user.id, date } },
      }),
      this.prisma.rosterAssignment.findUnique({
        where: { employeeId_date: { employeeId: counterpartyId, date: counterpartyDate } },
      }),
      this.prisma.employee.findUnique({
        where: { id: counterpartyId },
        select: { id: true, companyId: true, lineManagerId: true, firstName: true, lastName: true },
      }),
    ]);

    if (!counterparty) throw new NotFoundException('That colleague does not exist.');
    if (counterparty.companyId !== user.companyId) {
      throw new BadRequestException('You can only swap shifts with a colleague in your own company.');
    }
    if (!mine) throw new BadRequestException(`You have no roster entry for ${dto.date}.`);
    if (!theirs) throw new BadRequestException(`Your colleague has no roster entry for ${dto.counterpartyDate}.`);
    if (mine.isWeekend || theirs.isWeekend) {
      throw new BadRequestException('Weekend entries cannot be swapped.');
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { lineManagerId: true, firstName: true, lastName: true },
    });

    const request = await this.prisma.shiftExchangeRequest.create({
      data: {
        requesterId: user.id,
        counterpartyId,
        date,
        counterpartyDate,
        fromShiftId: mine.shiftId,
        toShiftId: theirs.shiftId,
        reason: dto.reason,
        approverId: employee.lineManagerId,
      },
    });

    // The counterparty has to agree before the manager is asked.
    await this.prisma.notification.create({
      data: {
        employeeId: counterpartyId,
        kind: 'ATTENDANCE',
        title: `${employee.firstName} ${employee.lastName} wants to swap a shift with you`,
        body: `Their ${dto.date} for your ${dto.counterpartyDate} — ${dto.reason}`,
        link: '/attendance/shift-exchange',
        entityType: 'shift_exchange_request',
        entityId: String(request.id),
      },
    });

    return request;
  }

  async listShiftExchanges(user: SessionPrincipal, query: ApprovalQueueQuery) {
    const where: Prisma.ShiftExchangeRequestWhereInput = {
      OR: [{ requesterId: user.id }, { counterpartyId: user.id }, { approverId: user.id }],
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.shiftExchangeRequest.findMany({
        where, orderBy: { date: 'desc' }, skip: query.skip, take: query.pageSize,
        include: {
          requester: { select: { id: true, firstName: true, lastName: true, employeeVisibleId: true } },
          counterparty: { select: { id: true, firstName: true, lastName: true, employeeVisibleId: true } },
          fromShift: { select: { name: true, startTime: true, endTime: true } },
          toShift: { select: { name: true, startTime: true, endTime: true } },
        },
      }),
      this.prisma.shiftExchangeRequest.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        myRole:
          row.requesterId === user.id ? 'requester'
          : row.counterpartyId === user.id ? 'counterparty'
          : 'approver',
        awaitingMyAction:
          (row.counterpartyId === user.id && !row.counterpartyAccepted && row.status === 'PENDING') ||
          (row.approverId === user.id && row.counterpartyAccepted && row.status === 'PENDING'),
      })),
      total,
      query,
    );
  }

  async respondToShiftExchange(user: SessionPrincipal, requestId: bigint, accept: boolean) {
    const request = await this.prisma.shiftExchangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Shift exchange request not found.');
    if (request.counterpartyId !== user.id) {
      throw new ForbiddenException('Only the colleague being asked can respond to this.');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }

    if (!accept) {
      return this.prisma.shiftExchangeRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', decisionNote: 'Declined by the colleague.', decidedAt: new Date() },
      });
    }

    const updated = await this.prisma.shiftExchangeRequest.update({
      where: { id: requestId },
      data: { counterpartyAccepted: true },
    });

    if (request.approverId) {
      await this.prisma.notification.create({
        data: {
          employeeId: request.approverId,
          kind: 'ATTENDANCE',
          title: 'A shift exchange needs your approval',
          body: 'Both employees have agreed to the swap.',
          link: '/attendance/shift-exchange',
          entityType: 'shift_exchange_request',
          entityId: String(requestId),
        },
      });
    }

    return updated;
  }

  /** Approving a swap actually rewrites both roster rows. */
  async decideShiftExchange(user: SessionPrincipal, requestId: bigint, dto: DecisionDto) {
    const request = await this.prisma.shiftExchangeRequest.findUnique({
      where: { id: requestId },
      include: { requester: { select: { companyId: true } } },
    });
    if (!request) throw new NotFoundException('Shift exchange request not found.');
    if (request.status !== 'PENDING') {
      throw new BadRequestException('That request has already been decided.');
    }
    if (!request.counterpartyAccepted) {
      throw new BadRequestException('The colleague has not agreed to the swap yet.');
    }
    await this.assertCanApprove(user, request.approverId, request.requesterId, request.requester.companyId);

    if (dto.decision === 'REJECTED') {
      return this.prisma.shiftExchangeRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', decisionNote: dto.note, decidedAt: new Date(), approverId: user.id },
      });
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.shiftExchangeRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', decisionNote: dto.note, decidedAt: new Date(), approverId: user.id },
      }),
      this.prisma.rosterAssignment.update({
        where: { employeeId_date: { employeeId: request.requesterId, date: request.date } },
        data: { shiftId: request.toShiftId },
      }),
      this.prisma.rosterAssignment.update({
        where: { employeeId_date: { employeeId: request.counterpartyId, date: request.counterpartyDate } },
        data: { shiftId: request.fromShiftId },
      }),
    ]);

    for (const employeeId of [request.requesterId, request.counterpartyId]) {
      await this.prisma.notification.create({
        data: {
          employeeId,
          kind: 'ATTENDANCE',
          title: 'Your shift exchange was approved',
          body: 'Both rosters have been updated.',
          link: '/attendance/shift-calendar',
          entityType: 'shift_exchange_request',
          entityId: String(requestId),
        },
      });
    }

    return updated;
  }

  /** Shared approval-authority check for every request type here. */
  private async assertCanApprove(
    user: SessionPrincipal,
    approverId: bigint | null,
    subjectId: bigint,
    companyId: number,
  ): Promise<void> {
    if (approverId === user.id) return;

    if (user.permissions.has(PERMISSIONS.ATTENDANCE_OVERRIDE)) {
      if (!user.accessibleCompanyIds.includes(companyId)) {
        throw new ForbiddenException('That request belongs to a company you do not have access to.');
      }
      return;
    }

    // A skip-level manager can act when the direct manager is unavailable.
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    if (subordinates.some((id) => id === subjectId)) return;

    throw new ForbiddenException('You are not the approver for this request.');
  }

  /** Counts for the approval-inbox badges. */
  async pendingCounts(user: SessionPrincipal) {
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    const mine = { OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }] };

    const [edits, overtime, compensation, exchanges] = await Promise.all([
      this.prisma.attendanceEditRequest.count({ where: { status: 'PENDING', ...mine } }),
      this.prisma.overtimeRequest.count({ where: { status: 'PENDING', ...mine } }),
      this.prisma.compensationRequest.count({ where: { status: 'PENDING', ...mine } }),
      this.prisma.shiftExchangeRequest.count({
        where: {
          status: 'PENDING',
          OR: [
            { approverId: user.id, counterpartyAccepted: true },
            { counterpartyId: user.id, counterpartyAccepted: false },
          ],
        },
      }),
    ]);

    return { attendance: edits, overtime, compensation, shiftExchange: exchanges };
  }
}
