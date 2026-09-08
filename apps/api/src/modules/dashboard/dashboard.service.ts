import { Injectable } from '@nestjs/common';
import { PERMISSIONS, bradfordBand, minutesToHm } from '@kormo/shared';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { AttendanceService } from '../attendance/attendance.service';
import { AuthService } from '../auth/auth.service';
import { EmployeesService } from '../employees/employees.service';
import { LeaveService } from '../leave/leave.service';
import { collectSubordinateIds } from '../../common/utils/scope';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
    private readonly employees: EmployeesService,
  ) {}

  /**
   * Everything the home screen needs, in one round trip.
   *
   * The nine widgets would otherwise be nine separate requests on first
   * paint. Each piece is independently permissioned, so a plain employee
   * simply gets zeroed approval counters rather than a 403.
   */
  async summary(user: SessionPrincipal) {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();

    const [
      identity,
      attendanceStats,
      currentWeek,
      calendar,
      balances,
      bradford,
      notices,
      birthdays,
      anniversaries,
      policies,
      pendingApprovals,
      unread,
      upcomingHoliday,
      pendingOnboarding,
    ] = await Promise.all([
      this.auth.buildSessionUser(user),
      this.attendance.monthlyStats(user, { month, year }),
      this.attendance.currentWeek(user),
      this.attendance.calendar(user, { month, year }),
      this.leave.balances(user, { year }),
      this.leave.bradford(user, { year }).catch(() => null),
      this.prisma.notice.findMany({
        where: {
          companyId: { in: user.accessibleCompanyIds },
          publishAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
        take: 5,
        select: { id: true, title: true, body: true, publishAt: true, isPinned: true },
      }),
      this.employees.birthdays(user, 'today'),
      this.employees.anniversaries(user, 'month'),
      this.prisma.officePolicy.findMany({
        where: { companyId: { in: user.accessibleCompanyIds }, isLatest: true },
        orderBy: { effectiveFrom: 'desc' },
        take: 5,
        select: { id: true, title: true, version: true, effectiveFrom: true, isLatest: true, category: true },
      }),
      this.pendingApprovalCounts(user),
      this.prisma.notification.count({ where: { employeeId: user.id, readAt: null } }),
      this.prisma.holiday.findFirst({
        where: {
          companyId: user.companyId,
          isOptional: false,
          endDate: { gte: now },
        },
        orderBy: { startDate: 'asc' },
        select: { name: true, startDate: true, endDate: true, duration: true },
      }),
      this.prisma.onboardingTask.count({
        where: { assigneeId: user.id, status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] } },
      }),
    ]);

    return {
      // 1 ── identity card
      identity: {
        ...identity,
        employeeSince: identity.joiningDate,
      },

      // 2 ── attendance donut + sparkline
      attendance: attendanceStats,

      // 3 ── notice board
      notices,

      // 4 ── remaining leave bars
      leaveBalances: balances.balances.filter((b) => b.entitled > 0),

      // 5 ── Bradford factor footer
      bradford: bradford?.self
        ? {
            score: bradford.self.score,
            band: bradford.self.band,
            spellCount: bradford.self.spellCount,
            totalDays: bradford.self.totalDays,
          }
        : { score: 0, band: bradfordBand(0), spellCount: 0, totalDays: 0 },

      // 6 ── mini-calendar
      calendar: calendar.days,

      // 7 ── current week stats
      currentWeek: {
        ...currentWeek,
        totalWorkHourLabel: minutesToHm(currentWeek.totalWorkMinutes),
        averageWorkHourLabel: minutesToHm(currentWeek.averageWorkMinutes),
        averageLateTimeLabel: minutesToHm(currentWeek.averageLateMinutes),
      },

      // 8 ── birthdays & anniversaries
      birthdaysToday: birthdays,
      anniversaries,

      // 9 ── office policy
      policies,

      // chrome
      pendingApprovals,
      unreadNotifications: unread,
      upcomingHoliday,
      myOnboardingTasks: pendingOnboarding,
    };
  }

  /**
   * Approval-inbox badges across every module. Each count is gated on
   * the matching permission, so a plain employee sees zeroes rather than
   * a failed request.
   */
  private async pendingApprovalCounts(user: SessionPrincipal) {
    const canApproveLeave = user.permissions.has(PERMISSIONS.LEAVE_APPROVE);
    const canApproveAttendance = user.permissions.has(PERMISSIONS.ATTENDANCE_EDIT_APPROVE);
    const canApproveOvertime = user.permissions.has(PERMISSIONS.OVERTIME_APPROVE);
    const canApproveComp = user.permissions.has(PERMISSIONS.COMPENSATION_APPROVE);
    const canApproveShift = user.permissions.has(PERMISSIONS.SHIFT_EXCHANGE_APPROVE);
    const canApproveResignation = user.permissions.has(PERMISSIONS.RESIGNATION_APPROVE);
    const canActionClearance = user.permissions.has(PERMISSIONS.CLEARANCE_ACTION);
    const canApproveProfile = user.permissions.has(PERMISSIONS.PROFILE_CHANGE_APPROVE);
    const canReviewConfirmation = user.permissions.has(PERMISSIONS.CONFIRMATION_REVIEW);

    const anyApprover =
      canApproveLeave || canApproveAttendance || canApproveOvertime || canApproveComp ||
      canApproveShift || canApproveResignation || canActionClearance;

    // Only pay for the subtree walk when the caller actually approves things.
    const subordinates = anyApprover ? await collectSubordinateIds(this.prisma, user.id) : [];
    const mine = { OR: [{ approverId: user.id }, { employeeId: { in: subordinates } }] };

    const [leave, attendance, overtime, compensation, shiftExchange, resignation, clearance, profile, confirmation] =
      await Promise.all([
        canApproveLeave
          ? this.prisma.leaveRequest.count({ where: { status: 'PENDING', ...mine } })
          : 0,
        canApproveAttendance
          ? this.prisma.attendanceEditRequest.count({ where: { status: 'PENDING', ...mine } })
          : 0,
        canApproveOvertime
          ? this.prisma.overtimeRequest.count({ where: { status: 'PENDING', ...mine } })
          : 0,
        canApproveComp
          ? this.prisma.compensationRequest.count({ where: { status: 'PENDING', ...mine } })
          : 0,
        canApproveShift
          ? this.prisma.shiftExchangeRequest.count({
              where: {
                status: 'PENDING',
                OR: [
                  { approverId: user.id, counterpartyAccepted: true },
                  { counterpartyId: user.id, counterpartyAccepted: false },
                ],
              },
            })
          : 0,
        canApproveResignation
          ? this.prisma.resignationApproval.count({ where: { approverId: user.id, status: 'PENDING' } })
          : 0,
        canActionClearance
          ? this.prisma.clearanceItem.count({ where: { ownerId: user.id, status: 'PENDING' } })
          : 0,
        canApproveProfile
          ? this.prisma.profileChangeRequest.count({
              where: { status: 'PENDING', employee: { companyId: { in: user.accessibleCompanyIds } } },
            })
          : 0,
        canReviewConfirmation
          ? this.prisma.jobConfirmationReview.count({ where: { reviewerId: user.id, decision: 'PENDING' } })
          : 0,
      ]);

    return {
      leave,
      attendance,
      overtime,
      compensation,
      shiftExchange,
      resignation,
      clearance,
      profileChange: profile,
      jobConfirmation: confirmation,
      total:
        leave + attendance + overtime + compensation + shiftExchange +
        resignation + clearance + profile + confirmation,
    };
  }

  /**
   * Organisation-level KPIs for HR and leadership. Separate from the
   * personal dashboard so an ordinary employee never pays for it.
   */
  async companyOverview(user: SessionPrincipal) {
    if (!user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL)) {
      return { available: false };
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
    const companyIds = user.accessibleCompanyIds;

    const [
      headcount, byDepartment, byStatus, joinersThisMonth, leaversThisMonth,
      onProbation, todayAttendance, openTickets, pendingResignations,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { companyId: { in: companyIds }, active: true } }),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { companyId: { in: companyIds }, active: true },
        _count: { _all: true },
      }),
      this.prisma.employee.groupBy({
        by: ['employmentStatus'],
        where: { companyId: { in: companyIds }, active: true },
        _count: { _all: true },
      }),
      this.prisma.employee.count({
        where: { companyId: { in: companyIds }, joiningDate: { gte: monthStart } },
      }),
      this.prisma.employee.count({
        where: { companyId: { in: companyIds }, separationDate: { gte: monthStart } },
      }),
      this.prisma.employee.count({
        where: { companyId: { in: companyIds }, active: true, employmentStatus: 'PROBATION' },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: {
          companyId: { in: companyIds },
          date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)),
        },
        _count: { _all: true },
      }),
      this.prisma.helpdeskTicket.count({
        where: { companyId: { in: companyIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      this.prisma.resignation.count({
        where: {
          employee: { companyId: { in: companyIds } },
          stage: { in: ['SUBMITTED', 'LM_APPROVAL', 'HR_APPROVAL', 'CLEARANCE'] },
        },
      }),
    ]);

    const departments = await this.prisma.department.findMany({
      where: { id: { in: byDepartment.map((d) => d.departmentId).filter((x): x is number => x !== null) } },
      select: { id: true, name: true },
    });
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    return {
      available: true,
      headcount,
      joinersThisMonth,
      leaversThisMonth,
      onProbation,
      openTickets,
      pendingResignations,
      // Annualised from this month's leavers — a rough but useful signal.
      attritionRateAnnualised:
        headcount > 0 ? Math.round((leaversThisMonth * 12 * 1000) / headcount) / 10 : 0,
      byDepartment: byDepartment
        .map((row) => ({
          departmentId: row.departmentId,
          department: row.departmentId ? deptName.get(row.departmentId) ?? 'Unassigned' : 'Unassigned',
          headcount: row._count._all,
        }))
        .sort((a, b) => b.headcount - a.headcount),
      byEmploymentStatus: byStatus.map((row) => ({
        status: row.employmentStatus,
        count: row._count._all,
      })),
      todayAttendance: todayAttendance.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
    };
  }
}
