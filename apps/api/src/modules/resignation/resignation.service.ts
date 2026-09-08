import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { EXIT_INTERVIEW_QUESTIONS, PERMISSIONS, initials, serviceLength } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { dateOnly, toIsoDate } from '../../common/utils/dates';
import { collectSubordinateIds } from '../../common/utils/scope';

@Injectable()
export class ResignationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The read-only header on the Send e-Resignation form, plus a live
   * preview of the notice-period arithmetic for a candidate last working
   * day. The employee sees the recovery consequence *before* submitting.
   */
  async resignationContext(user: SessionPrincipal, lastWorkingDay?: string) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true, employeeVisibleId: true, firstName: true, lastName: true,
        officialEmail: true, officialContact: true, joiningDate: true,
        employmentStatus: true, noticePeriodDays: true,
        designation: { select: { name: true, grade: true } },
        department: { select: { name: true } },
        lineManager: { select: { id: true, firstName: true, lastName: true } },
        salaryHistory: { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { gross: true } },
      },
    });

    const existing = await this.prisma.resignation.findFirst({
      where: {
        employeeId: user.id,
        stage: { notIn: ['WITHDRAWN', 'REJECTED', 'COMPLETED'] },
      },
    });

    const gross = Number(employee.salaryHistory[0]?.gross ?? 0);
    const preview = lastWorkingDay
      ? this.computeNoticePeriod(employee.noticePeriodDays, dateOnly(lastWorkingDay), gross)
      : null;

    return {
      employee: {
        id: employee.id,
        employeeVisibleId: employee.employeeVisibleId,
        fullName: `${employee.firstName} ${employee.lastName}`,
        initials: initials(employee.firstName, employee.lastName),
        officialEmail: employee.officialEmail,
        officialContact: employee.officialContact,
        joiningDate: employee.joiningDate,
        serviceLength: serviceLength(employee.joiningDate).label,
        employmentStatus: employee.employmentStatus,
        designation: employee.designation?.name ?? null,
        grade: employee.designation?.grade ?? null,
        department: employee.department?.name ?? null,
        lineManager: employee.lineManager
          ? {
              id: employee.lineManager.id,
              fullName: `${employee.lineManager.firstName} ${employee.lineManager.lastName}`,
            }
          : null,
      },
      noticePeriodToBeServed: employee.noticePeriodDays,
      hasActiveResignation: existing !== null,
      activeResignationId: existing?.id ?? null,
      preview,
      advisory:
        'Please speak to your line manager before submitting. A resignation can only be '
        + 'withdrawn before it is approved.',
      requiresSignedLetter: true,
    };
  }

  /**
   * Notice-period arithmetic.
   *
   * Served = days between submission and the chosen last working day.
   * Recovery = the shortfall against the contractual period, charged at
   * the daily gross rate and deducted from the final settlement.
   */
  private computeNoticePeriod(requiredDays: number, lastWorkingDay: Date, gross: number) {
    const submittedAt = new Date();
    const servedDays = Math.max(
      0,
      Math.ceil((lastWorkingDay.getTime() - submittedAt.getTime()) / 86_400_000),
    );
    const recoveryDays = Math.max(0, requiredDays - servedDays);
    // Notice recovery is conventionally computed on a 30-day month.
    const recoveryAmount = recoveryDays > 0 ? Math.round((gross / 30) * recoveryDays * 100) / 100 : 0;

    return {
      noticePeriodRequiredDays: requiredDays,
      noticePeriodServedDays: servedDays,
      noticePeriodRecoveryDays: recoveryDays,
      dateOfSeparation: toIsoDate(lastWorkingDay),
      recoveryAmount,
      shortfall: recoveryDays > 0,
    };
  }

  async submit(
    user: SessionPrincipal,
    dto: { lastWorkingDay: string; reason: string; letterPath: string },
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true, companyId: true, noticePeriodDays: true, lineManagerId: true,
        firstName: true, lastName: true, employmentStatus: true,
        salaryHistory: { orderBy: { effectiveFrom: 'desc' }, take: 1, select: { gross: true } },
      },
    });

    if (employee.employmentStatus === 'SEPARATED') {
      throw new BadRequestException('Your employment has already ended.');
    }

    const active = await this.prisma.resignation.findFirst({
      where: { employeeId: user.id, stage: { notIn: ['WITHDRAWN', 'REJECTED', 'COMPLETED'] } },
    });
    if (active) {
      throw new BadRequestException('You already have a resignation in progress.');
    }

    const lastWorkingDay = dateOnly(dto.lastWorkingDay);
    if (lastWorkingDay <= new Date()) {
      throw new BadRequestException('Your last working day must be in the future.');
    }
    // The signed letter is mandatory — the workflow has no meaning without it.
    if (!dto.letterPath?.trim()) {
      throw new BadRequestException('A signed resignation letter must be uploaded.');
    }
    if (!employee.lineManagerId) {
      throw new BadRequestException(
        'You have no line manager assigned, so this cannot be routed. Contact HR.',
      );
    }

    const gross = Number(employee.salaryHistory[0]?.gross ?? 0);
    const notice = this.computeNoticePeriod(employee.noticePeriodDays, lastWorkingDay, gross);

    const hrAdmin = await this.prisma.employee.findFirst({
      where: {
        companyId: employee.companyId,
        active: true,
        roles: { some: { role: { key: 'HR_ADMIN' } } },
      },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const resignation = await tx.resignation.create({
        data: {
          employeeId: user.id,
          noticePeriodRequiredDays: notice.noticePeriodRequiredDays,
          lastWorkingDay,
          noticePeriodServedDays: notice.noticePeriodServedDays,
          noticePeriodRecoveryDays: notice.noticePeriodRecoveryDays,
          dateOfSeparation: lastWorkingDay,
          reason: dto.reason,
          letterPath: dto.letterPath,
          stage: 'LM_APPROVAL',
          recoveryAmount: notice.recoveryAmount > 0 ? notice.recoveryAmount : null,
        },
      });

      // Sequential chain: line manager, then HR.
      const chain: { approverId: bigint; role: string }[] = [
        { approverId: employee.lineManagerId!, role: 'LINE_MANAGER' },
      ];
      if (hrAdmin) chain.push({ approverId: hrAdmin.id, role: 'HR' });

      await tx.resignationApproval.createMany({
        data: chain.map((link, seq) => ({
          resignationId: resignation.id,
          approverId: link.approverId,
          role: link.role,
          seq,
        })),
      });

      await tx.notification.create({
        data: {
          employeeId: employee.lineManagerId!,
          kind: 'RESIGNATION',
          title: `${employee.firstName} ${employee.lastName} has submitted a resignation`,
          body: `Last working day ${dto.lastWorkingDay} — ${dto.reason}`,
          link: '/resignation/approval',
          entityType: 'resignation',
          entityId: String(resignation.id),
        },
      });

      return { ...resignation, notice };
    });
  }

  async myResignations(user: SessionPrincipal) {
    const rows = await this.prisma.resignation.findMany({
      where: { employeeId: user.id },
      include: {
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { seq: 'asc' },
        },
        clearances: {
          include: {
            department: { select: { name: true, checklist: true } },
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        exitInterview: true,
      },
      orderBy: { submittedAt: 'desc' },
    });

    return rows.map((row) => ({
      ...row,
      recoveryAmount: row.recoveryAmount === null ? null : Number(row.recoveryAmount),
      finalSettlementAmount:
        row.finalSettlementAmount === null ? null : Number(row.finalSettlementAmount),
      canWithdraw: ['SUBMITTED', 'LM_APPROVAL'].includes(row.stage),
      clearanceProgress: {
        total: row.clearances.length,
        cleared: row.clearances.filter((c) => c.status === 'APPROVED').length,
      },
    }));
  }

  async withdraw(user: SessionPrincipal, resignationId: bigint) {
    const resignation = await this.prisma.resignation.findUnique({
      where: { id: resignationId },
    });
    if (!resignation) throw new NotFoundException('Resignation not found.');
    if (resignation.employeeId !== user.id) {
      throw new ForbiddenException('You can only withdraw your own resignation.');
    }
    // Once HR has signed off, withdrawal is a conversation, not a click.
    if (!['SUBMITTED', 'LM_APPROVAL'].includes(resignation.stage)) {
      throw new BadRequestException(
        'This resignation has progressed too far to withdraw. Please speak to HR.',
      );
    }

    return this.prisma.resignation.update({
      where: { id: resignationId },
      data: { stage: 'WITHDRAWN', withdrawnAt: new Date() },
    });
  }

  // ── approvals ──────────────────────────────────────────────────────

  async approvalQueue(user: SessionPrincipal) {
    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    const canSeeAll = user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL);

    const rows = await this.prisma.resignation.findMany({
      where: {
        stage: { in: ['SUBMITTED', 'LM_APPROVAL', 'HR_APPROVAL'] },
        ...(canSeeAll
          ? { employee: { companyId: { in: user.accessibleCompanyIds } } }
          : {
              OR: [
                { employeeId: { in: subordinates } },
                { approvals: { some: { approverId: user.id, status: 'PENDING' } } },
              ],
            }),
      },
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            joiningDate: true, noticePeriodDays: true,
            designation: { select: { name: true, grade: true } },
            department: { select: { name: true } },
          },
        },
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { seq: 'asc' },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return rows.map((row) => {
      // The chain is sequential: the first pending link is the live one.
      const nextApproval = row.approvals.find((a) => a.status === 'PENDING');
      return {
        ...row,
        recoveryAmount: row.recoveryAmount === null ? null : Number(row.recoveryAmount),
        employee: {
          ...row.employee,
          fullName: `${row.employee.firstName} ${row.employee.lastName}`,
          initials: initials(row.employee.firstName, row.employee.lastName),
          serviceLength: serviceLength(row.employee.joiningDate).label,
        },
        currentApprover: nextApproval
          ? {
              approvalId: nextApproval.id,
              role: nextApproval.role,
              approver: nextApproval.approver
                ? {
                    id: nextApproval.approver.id,
                    fullName: `${nextApproval.approver.firstName} ${nextApproval.approver.lastName}`,
                  }
                : null,
            }
          : null,
        awaitingMyDecision: nextApproval?.approverId === user.id,
      };
    });
  }

  /**
   * Records one link in the approval chain. Only the *current* link can
   * act, so HR cannot sign off before the line manager has.
   */
  async decide(
    user: SessionPrincipal,
    resignationId: bigint,
    dto: { decision: 'APPROVED' | 'REJECTED'; comment?: string },
  ) {
    const resignation = await this.prisma.resignation.findUnique({
      where: { id: resignationId },
      include: {
        approvals: { orderBy: { seq: 'asc' } },
        employee: { select: { id: true, companyId: true, firstName: true, lastName: true } },
      },
    });
    if (!resignation) throw new NotFoundException('Resignation not found.');
    if (['COMPLETED', 'WITHDRAWN', 'REJECTED'].includes(resignation.stage)) {
      throw new BadRequestException('This resignation is already closed.');
    }

    const next = resignation.approvals.find((a) => a.status === 'PENDING');
    if (!next) throw new BadRequestException('There is no pending approval on this resignation.');
    if (next.approverId !== user.id) {
      throw new ForbiddenException('It is not your turn to decide on this resignation.');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.resignationApproval.update({
        where: { id: next.id },
        data: { status: dto.decision, comment: dto.comment, decidedAt: now },
      });

      if (dto.decision === 'REJECTED') {
        const rejected = await tx.resignation.update({
          where: { id: resignationId },
          data: { stage: 'REJECTED' },
        });
        await tx.notification.create({
          data: {
            employeeId: resignation.employeeId,
            kind: 'RESIGNATION',
            title: 'Your resignation was not accepted',
            body: dto.comment ?? 'Please speak to your line manager or HR.',
            link: '/resignation',
            entityType: 'resignation',
            entityId: String(resignationId),
          },
        });
        return rejected;
      }

      const remaining = resignation.approvals.filter(
        (a) => a.id !== next.id && a.status === 'PENDING',
      );

      // Last approval in the chain opens the clearance stage.
      if (remaining.length === 0) {
        const departments = await tx.clearanceDepartment.findMany({
          where: { companyId: resignation.employee.companyId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        });

        const existingClearances = await tx.clearanceItem.count({
          where: { resignationId },
        });
        if (existingClearances === 0 && departments.length > 0) {
          await tx.clearanceItem.createMany({
            data: departments.map((department) => ({
              resignationId,
              clearanceDepartmentId: department.id,
              checklistState: department.checklist.map((item) => ({ item, returned: false })),
            })),
          });
        }

        const advanced = await tx.resignation.update({
          where: { id: resignationId },
          data: { stage: 'CLEARANCE' },
        });

        await tx.notification.create({
          data: {
            employeeId: resignation.employeeId,
            kind: 'RESIGNATION',
            title: 'Your resignation has been approved',
            body: `Clearance has started across ${departments.length} department(s).`,
            link: '/resignation',
            entityType: 'resignation',
            entityId: String(resignationId),
          },
        });

        return advanced;
      }

      // Hand over to the next link.
      const advanced = await tx.resignation.update({
        where: { id: resignationId },
        data: { stage: 'HR_APPROVAL' },
      });

      await tx.notification.create({
        data: {
          employeeId: remaining[0].approverId,
          kind: 'RESIGNATION',
          title: `A resignation needs your approval`,
          body: `${resignation.employee.firstName} ${resignation.employee.lastName} — approved by the line manager.`,
          link: '/resignation/approval',
          entityType: 'resignation',
          entityId: String(resignationId),
        },
      });

      return advanced;
    });
  }

  // ── clearance ──────────────────────────────────────────────────────

  async clearanceQueue(user: SessionPrincipal) {
    const canSeeAll = user.permissions.has(PERMISSIONS.CLEARANCE_ACTION) &&
      user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL);

    const items = await this.prisma.clearanceItem.findMany({
      where: {
        // Company scope for an administrator; otherwise only the lines the
        // caller personally owns.
        resignation: {
          stage: 'CLEARANCE',
          ...(canSeeAll ? { employee: { companyId: { in: user.accessibleCompanyIds } } } : {}),
        },
        ...(canSeeAll ? {} : { ownerId: user.id }),
      },
      include: {
        department: { select: { id: true, name: true, checklist: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        resignation: {
          include: {
            employee: {
              select: {
                id: true, employeeVisibleId: true, firstName: true, lastName: true,
                designation: { select: { name: true } },
                department: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ resignation: { lastWorkingDay: 'asc' } }, { department: { sortOrder: 'asc' } }],
    });

    return items.map((item) => ({
      ...item,
      duesAmount: item.duesAmount === null ? null : Number(item.duesAmount),
      employee: {
        ...item.resignation.employee,
        fullName: `${item.resignation.employee.firstName} ${item.resignation.employee.lastName}`,
        initials: initials(item.resignation.employee.firstName, item.resignation.employee.lastName),
      },
      lastWorkingDay: item.resignation.lastWorkingDay,
      awaitingMyAction: item.ownerId === user.id && item.status === 'PENDING',
    }));
  }

  /**
   * Signs off one clearance line. When the last department clears, the
   * exit completes: the employee is deactivated and the settlement,
   * net of any notice recovery, is recorded.
   */
  async clearItem(
    user: SessionPrincipal,
    itemId: bigint,
    dto: {
      status: 'APPROVED' | 'REJECTED';
      remarks?: string;
      duesAmount?: number;
      checklistState?: { item: string; returned: boolean }[];
    },
  ) {
    const item = await this.prisma.clearanceItem.findUnique({
      where: { id: itemId },
      include: {
        resignation: {
          include: { employee: { select: { id: true, companyId: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Clearance item not found.');

    const isOwner = item.ownerId === user.id;
    const isAdmin = user.permissions.has(PERMISSIONS.CLEARANCE_ACTION) &&
      user.permissions.has(PERMISSIONS.EMPLOYEE_WRITE);
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You are not responsible for this clearance line.');
    }
    if (item.status !== 'PENDING') {
      throw new BadRequestException('That clearance line has already been actioned.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clearanceItem.update({
        where: { id: itemId },
        data: {
          status: dto.status,
          remarks: dto.remarks,
          duesAmount: dto.duesAmount,
          checklistState: dto.checklistState ?? undefined,
          clearedAt: dto.status === 'APPROVED' ? new Date() : null,
        },
      });

      const outstanding = await tx.clearanceItem.count({
        where: { resignationId: item.resignationId, status: 'PENDING' },
      });

      if (outstanding === 0) {
        const allItems = await tx.clearanceItem.findMany({
          where: { resignationId: item.resignationId },
          select: { duesAmount: true, status: true },
        });
        const totalDues = allItems.reduce((sum, x) => sum + Number(x.duesAmount ?? 0), 0);

        const resignation = await tx.resignation.findUniqueOrThrow({
          where: { id: item.resignationId },
          select: { recoveryAmount: true, lastWorkingDay: true, employeeId: true },
        });

        // Final settlement is reduced by outstanding dues and by any
        // un-served notice period.
        const recovery = Number(resignation.recoveryAmount ?? 0);

        await tx.resignation.update({
          where: { id: item.resignationId },
          data: {
            stage: 'COMPLETED',
            completedAt: new Date(),
            finalSettlementAmount: -(totalDues + recovery),
          },
        });

        await tx.employee.update({
          where: { id: resignation.employeeId },
          data: {
            employmentStatus: 'SEPARATED',
            active: false,
            separationDate: resignation.lastWorkingDay,
          },
        });

        await tx.notification.create({
          data: {
            employeeId: resignation.employeeId,
            kind: 'RESIGNATION',
            title: 'Your clearance is complete',
            body: 'All departments have signed off. HR will share your final settlement.',
            link: '/resignation',
            entityType: 'resignation',
            entityId: String(item.resignationId),
          },
        });
      }

      return updated;
    });
  }

  // ── exit interview ─────────────────────────────────────────────────

  async exitInterviewQuestions() {
    return { questions: EXIT_INTERVIEW_QUESTIONS };
  }

  async submitExitInterview(
    user: SessionPrincipal,
    resignationId: bigint,
    dto: {
      responses: { question: string; answer: string; rating?: number }[];
      primaryReason?: string;
      wouldRejoin?: boolean;
      npsScore?: number;
    },
  ) {
    const resignation = await this.prisma.resignation.findUnique({
      where: { id: resignationId },
      include: { exitInterview: true, employee: { select: { companyId: true } } },
    });
    if (!resignation) throw new NotFoundException('Resignation not found.');
    if (resignation.exitInterview) {
      throw new BadRequestException('An exit interview has already been recorded.');
    }

    const isSubject = resignation.employeeId === user.id;
    const isHr = user.permissions.has(PERMISSIONS.EXIT_INTERVIEW);
    if (!isSubject && !isHr) {
      throw new ForbiddenException('You cannot record this exit interview.');
    }

    return this.prisma.exitInterview.create({
      data: {
        resignationId,
        responses: dto.responses,
        primaryReason: dto.primaryReason,
        wouldRejoin: dto.wouldRejoin,
        npsScore: dto.npsScore,
        conductedById: isHr ? user.id : null,
        conductedAt: new Date(),
      },
    });
  }
}
