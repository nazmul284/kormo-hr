import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { JOB_CONFIRMATION_CRITERIA, PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { collectSubordinateIds, companyFilter } from '../../common/utils/scope';
import { toBigInt } from '../../common/utils/serialize';

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── goal cycles ────────────────────────────────────────────────────

  /**
   * Cycles the caller is enrolled in.
   *
   * Goals only exist inside a cycle, and an employee has to be enrolled
   * before they can author one — which is why a brand-new joiner sees an
   * empty state rather than a create button that would fail.
   */
  async myCycles(user: SessionPrincipal) {
    const memberships = await this.prisma.goalCycleMember.findMany({
      where: { employeeId: user.id },
      include: { cycle: true },
      orderBy: { cycle: { startDate: 'desc' } },
    });

    const now = new Date();
    return memberships.map(({ cycle }) => ({
      ...cycle,
      isGoalWindowOpen: cycle.startDate <= now && cycle.endDate >= now,
      isFeedbackWindowOpen: cycle.feedbackStartDate <= now && cycle.feedbackEndDate >= now,
      phase:
        now < cycle.startDate ? 'upcoming'
        : now <= cycle.endDate ? 'goal-setting'
        : now < cycle.feedbackStartDate ? 'in-progress'
        : now <= cycle.feedbackEndDate ? 'review'
        : 'closed',
    }));
  }

  async myGoals(user: SessionPrincipal, goalCycleId?: number) {
    const cycles = await this.myCycles(user);
    if (cycles.length === 0) {
      return {
        enrolled: false,
        message:
          'You are not enrolled in a goal cycle yet. Goals can be created once HR adds '
          + 'you to the current cycle.',
        cycles: [],
        goals: [],
      };
    }

    const targetCycle = goalCycleId ?? cycles.find((c) => c.isActive)?.id ?? cycles[0].id;

    const goals = await this.prisma.goal.findMany({
      where: { employeeId: user.id, goalCycleId: targetCycle },
      include: {
        cycle: { select: { id: true, name: true, endDate: true } },
        reviews: {
          include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        parent: { select: { id: true, title: true, employee: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalWeight = goals.reduce((sum, goal) => sum + goal.weight, 0);
    const weighted = goals.reduce((sum, goal) => sum + (goal.progressPct * goal.weight) / 100, 0);

    return {
      enrolled: true,
      cycles,
      selectedCycleId: targetCycle,
      goals,
      summary: {
        count: goals.length,
        totalWeight,
        // The cycle requires weights to total 100; flag it rather than
        // silently scoring against a wrong denominator.
        weightBalanced: totalWeight === 100,
        weightedProgress: Math.round(weighted),
        completed: goals.filter((g) => g.status === 'COMPLETED').length,
      },
    };
  }

  /** My Team Goal — the reports' goals, for a manager. */
  async teamGoals(user: SessionPrincipal, goalCycleId?: number) {
    if (!user.permissions.has(PERMISSIONS.GOAL_READ_TEAM)) {
      throw new ForbiddenException("You do not have permission to view your team's goals.");
    }

    const subordinates = await collectSubordinateIds(this.prisma, user.id);
    if (subordinates.length === 0) {
      return { employees: [], message: 'You have no direct or indirect reports.' };
    }

    const activeCycle = goalCycleId
      ? await this.prisma.goalCycle.findUnique({ where: { id: goalCycleId } })
      : await this.prisma.goalCycle.findFirst({
          where: { companyId: user.companyId, isActive: true },
          orderBy: { startDate: 'desc' },
        });

    if (!activeCycle) return { employees: [], message: 'No goal cycle is currently open.' };

    const [employees, goals] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: subordinates }, active: true },
        select: {
          id: true, employeeVisibleId: true, firstName: true, lastName: true,
          thumbnailsPath01: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
        },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.goal.findMany({
        where: { employeeId: { in: subordinates }, goalCycleId: activeCycle.id },
        include: { reviews: { select: { stage: true, rating: true, submittedAt: true } } },
      }),
    ]);

    const byEmployee = new Map<string, typeof goals>();
    for (const goal of goals) {
      const key = String(goal.employeeId);
      byEmployee.set(key, [...(byEmployee.get(key) ?? []), goal]);
    }

    return {
      cycle: activeCycle,
      employees: employees.map((employee) => {
        const theirGoals = byEmployee.get(String(employee.id)) ?? [];
        const totalWeight = theirGoals.reduce((sum, g) => sum + g.weight, 0);
        const weighted = theirGoals.reduce((sum, g) => sum + (g.progressPct * g.weight) / 100, 0);
        return {
          employee: {
            ...employee,
            fullName: `${employee.firstName} ${employee.lastName}`,
            initials: initials(employee.firstName, employee.lastName),
          },
          goals: theirGoals,
          goalCount: theirGoals.length,
          totalWeight,
          weightedProgress: Math.round(weighted),
          awaitingMyReview: theirGoals.filter(
            (g) => g.status === 'SUBMITTED' &&
              !g.reviews.some((r) => r.stage === 'MANAGER_REVIEW' && r.submittedAt !== null),
          ).length,
        };
      }),
    };
  }

  async createGoal(
    user: SessionPrincipal,
    dto: { goalCycleId: number; title: string; description?: string; metric?: string; target?: string; weight: number; dueDate?: string; parentGoalId?: number },
  ) {
    const membership = await this.prisma.goalCycleMember.findUnique({
      where: { goalCycleId_employeeId: { goalCycleId: dto.goalCycleId, employeeId: user.id } },
      include: { cycle: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not enrolled in that goal cycle.');
    }

    const now = new Date();
    if (now > membership.cycle.endDate) {
      throw new BadRequestException('The goal-setting window for that cycle has closed.');
    }

    // Weights must total 100 across the cycle; reject the goal that would
    // breach it rather than accepting an unscoreable set.
    const existing = await this.prisma.goal.aggregate({
      where: { employeeId: user.id, goalCycleId: dto.goalCycleId },
      _sum: { weight: true },
    });
    const usedWeight = existing._sum.weight ?? 0;
    if (usedWeight + dto.weight > membership.cycle.weightMustTotal) {
      throw new BadRequestException(
        `Your goal weights would total ${usedWeight + dto.weight}%, above the ${membership.cycle.weightMustTotal}% limit. `
        + `You have ${membership.cycle.weightMustTotal - usedWeight}% left to allocate.`,
      );
    }

    return this.prisma.goal.create({
      data: {
        goalCycleId: dto.goalCycleId,
        employeeId: user.id,
        title: dto.title,
        description: dto.description,
        metric: dto.metric,
        target: dto.target,
        weight: dto.weight,
        parentGoalId: dto.parentGoalId,
        dueDate: dto.dueDate ? new Date(`${dto.dueDate}T12:00:00Z`) : membership.cycle.endDate,
        status: 'ACTIVE',
      },
    });
  }

  async updateGoalProgress(
    user: SessionPrincipal,
    goalId: number,
    dto: { progressPct?: number; status?: string; title?: string; description?: string },
  ) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: { cycle: true },
    });
    if (!goal) throw new NotFoundException('Goal not found.');
    if (goal.employeeId !== user.id) {
      throw new ForbiddenException('You can only update your own goals.');
    }
    if (goal.status === 'COMPLETED') {
      throw new BadRequestException('A completed goal can no longer be edited.');
    }
    if (dto.progressPct !== undefined && (dto.progressPct < 0 || dto.progressPct > 100)) {
      throw new BadRequestException('Progress must be between 0 and 100.');
    }

    return this.prisma.goal.update({
      where: { id: goalId },
      data: {
        progressPct: dto.progressPct,
        status: dto.status as never,
        title: dto.title,
        description: dto.description,
      },
    });
  }

  async submitReview(
    user: SessionPrincipal,
    goalId: number,
    dto: { stage: string; rating?: number; comment?: string },
  ) {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        cycle: true,
        employee: { select: { id: true, lineManagerId: true, firstName: true, lastName: true } },
      },
    });
    if (!goal) throw new NotFoundException('Goal not found.');

    const isOwner = goal.employeeId === user.id;
    const isManager = goal.employee.lineManagerId === user.id;
    const isHr = user.permissions.has(PERMISSIONS.GOAL_CYCLE_WRITE);

    if (dto.stage === 'SELF_ASSESSMENT' && !isOwner) {
      throw new ForbiddenException('Only the goal owner can submit a self-assessment.');
    }
    if (dto.stage === 'MANAGER_REVIEW' && !isManager && !isHr) {
      throw new ForbiddenException('Only the line manager can submit a manager review.');
    }
    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new BadRequestException('Rating must be between 1 and 5.');
    }

    const now = new Date();
    if (now < goal.cycle.feedbackStartDate || now > goal.cycle.feedbackEndDate) {
      throw new BadRequestException(
        `The feedback window for ${goal.cycle.name} is not open.`,
      );
    }

    const review = await this.prisma.goalReview.create({
      data: {
        goalId,
        reviewerId: user.id,
        stage: dto.stage as never,
        rating: dto.rating,
        comment: dto.comment,
        submittedAt: now,
      },
    });

    // A manager review closes the goal out.
    await this.prisma.goal.update({
      where: { id: goalId },
      data: {
        status: dto.stage === 'MANAGER_REVIEW' ? 'COMPLETED' : 'IN_REVIEW',
      },
    });

    if (dto.stage === 'MANAGER_REVIEW') {
      await this.prisma.notification.create({
        data: {
          employeeId: goal.employeeId,
          kind: 'PERFORMANCE',
          title: 'Your goal has been reviewed',
          body: `${goal.title}${dto.rating ? ` — rated ${dto.rating}/5` : ''}`,
          link: '/performance',
          entityType: 'goal',
          entityId: String(goalId),
        },
      });
    }

    return review;
  }

  // ── job confirmation ───────────────────────────────────────────────

  /** Probation reviews the caller owns, plus the completion counters. */
  async confirmationReviews(user: SessionPrincipal, scope: 'mine' | 'all' = 'mine') {
    const canSeeAll = user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL);
    const where: Prisma.JobConfirmationReviewWhereInput =
      scope === 'all' && canSeeAll
        ? { employee: { companyId: { in: user.accessibleCompanyIds } } }
        : { reviewerId: user.id };

    const reviews = await this.prisma.jobConfirmationReview.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            joiningDate: true, employmentStatus: true, thumbnailsPath01: true,
            designation: { select: { name: true, grade: true } },
            department: { select: { name: true } },
          },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const decorated = reviews.map((review) => ({
      ...review,
      employee: {
        ...review.employee,
        fullName: `${review.employee.firstName} ${review.employee.lastName}`,
        initials: initials(review.employee.firstName, review.employee.lastName),
      },
      isOverdue: review.decision === 'PENDING' && review.dueDate < now,
      daysUntilDue: Math.ceil((review.dueDate.getTime() - now.getTime()) / 86_400_000),
    }));

    return {
      reviews: decorated,
      counters: {
        // The two counters the reference UI shows alongside the list.
        reviewCompleted: decorated.filter((r) => r.decision !== 'PENDING').length,
        reviewRemaining: decorated.filter((r) => r.decision === 'PENDING').length,
        overdue: decorated.filter((r) => r.isOverdue).length,
      },
      criteria: JOB_CONFIRMATION_CRITERIA,
    };
  }

  /**
   * Records a confirmation decision. Confirming flips the employee to
   * PERMANENT and stamps the confirmation date, which in turn changes
   * their leave and benefit eligibility.
   */
  async decideConfirmation(
    user: SessionPrincipal,
    reviewId: number,
    dto: {
      decision: 'CONFIRMED' | 'EXTENDED' | 'TERMINATED';
      scorecard?: { criterion: string; score: number }[];
      strengths?: string;
      improvements?: string;
      extendedToDate?: string;
    },
  ) {
    const review = await this.prisma.jobConfirmationReview.findUnique({
      where: { id: reviewId },
      include: { employee: { select: { id: true, companyId: true, firstName: true, lastName: true } } },
    });
    if (!review) throw new NotFoundException('Confirmation review not found.');
    if (review.decision !== 'PENDING') {
      throw new BadRequestException('That review has already been decided.');
    }

    const isReviewer = review.reviewerId === user.id;
    const isHr = user.permissions.has(PERMISSIONS.CONFIRMATION_REVIEW) &&
      user.permissions.has(PERMISSIONS.EMPLOYEE_WRITE);
    if (!isReviewer && !isHr) {
      throw new ForbiddenException('You are not the reviewer for this confirmation.');
    }
    if (dto.decision === 'EXTENDED' && !dto.extendedToDate) {
      throw new BadRequestException('An extended probation needs a new end date.');
    }

    const overallScore = dto.scorecard?.length
      ? Math.round((dto.scorecard.reduce((sum, c) => sum + c.score, 0) / dto.scorecard.length) * 100) / 100
      : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.jobConfirmationReview.update({
        where: { id: reviewId },
        data: {
          decision: dto.decision,
          stage: 'COMPLETED',
          scorecard: dto.scorecard ?? undefined,
          overallScore,
          strengths: dto.strengths,
          improvements: dto.improvements,
          extendedToDate: dto.extendedToDate ? new Date(`${dto.extendedToDate}T12:00:00Z`) : null,
          completedAt: new Date(),
          reviewerId: user.id,
        },
      });

      if (dto.decision === 'CONFIRMED') {
        await tx.employee.update({
          where: { id: review.employeeId },
          data: { employmentStatus: 'PERMANENT', confirmationDate: new Date() },
        });
      } else if (dto.decision === 'TERMINATED') {
        await tx.employee.update({
          where: { id: review.employeeId },
          data: { employmentStatus: 'SEPARATED', active: false, separationDate: new Date() },
        });
      }

      await tx.notification.create({
        data: {
          employeeId: review.employeeId,
          kind: 'PERFORMANCE',
          title:
            dto.decision === 'CONFIRMED' ? 'Your employment has been confirmed'
            : dto.decision === 'EXTENDED' ? 'Your probation has been extended'
            : 'Your probation review has concluded',
          body: dto.strengths ?? undefined,
          link: '/performance/job-confirmation',
          entityType: 'job_confirmation_review',
          entityId: String(reviewId),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          companyId: review.employee.companyId,
          action: `confirmation.${dto.decision.toLowerCase()}`,
          entityType: 'job_confirmation_review',
          entityId: String(reviewId),
          after: { decision: dto.decision, overallScore },
        },
      });

      return updated;
    });
  }

  /** Cycles an HR admin can manage. */
  async listCycles(user: SessionPrincipal, companyId?: number) {
    const companyIds = companyFilter(user, companyId);
    const cycles = await this.prisma.goalCycle.findMany({
      where: { companyId: { in: companyIds } },
      include: { _count: { select: { participants: true, goals: true } } },
      orderBy: { startDate: 'desc' },
    });
    return cycles.map((cycle) => ({
      ...cycle,
      participantCount: cycle._count.participants,
      goalCount: cycle._count.goals,
    }));
  }
}
