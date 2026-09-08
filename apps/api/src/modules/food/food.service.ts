import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import {
  addDays, dateOnly, endOfMonth, localMinutes, monthWindow, startOfMonth, toIsoDate,
} from '../../common/utils/dates';
import { companyFilter } from '../../common/utils/scope';

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  async programs(user: SessionPrincipal) {
    const programs = await this.prisma.foodProgram.findMany({
      where: { companyId: { in: user.accessibleCompanyIds }, isActive: true },
      include: {
        menus: { orderBy: [{ dayOfWeek: 'asc' }, { effectiveFrom: 'desc' }] },
        subscriptions: { where: { employeeId: user.id }, select: { id: true, isActive: true, subscribedAt: true, unsubscribedAt: true } },
      },
      orderBy: { name: 'asc' },
    });

    return programs.map((program) => ({
      ...program,
      selfCost: Number(program.selfCost),
      guestCost: Number(program.guestCost),
      mySubscription: program.subscriptions[0] ?? null,
      isSubscribed: program.subscriptions[0]?.isActive === true,
      // Only the current version of each day's menu.
      weeklyMenu: this.latestMenuPerDay(program.menus),
    }));
  }

  /** Menus are effective-dated; take the newest one in force per weekday. */
  private latestMenuPerDay(
    menus: { dayOfWeek: number; effectiveFrom: Date; items: Prisma.JsonValue }[],
  ) {
    const now = new Date();
    const byDay = new Map<number, { dayOfWeek: number; effectiveFrom: Date; items: Prisma.JsonValue }>();
    for (const menu of menus) {
      if (menu.effectiveFrom > now) continue;
      const existing = byDay.get(menu.dayOfWeek);
      if (!existing || menu.effectiveFrom > existing.effectiveFrom) {
        byDay.set(menu.dayOfWeek, menu);
      }
    }
    return [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  /** The Monthly tab: one row per meal day with cost and menu. */
  async monthly(user: SessionPrincipal, programId?: number, month?: number, year?: number) {
    const now = new Date();
    const targetMonth = month ?? now.getUTCMonth() + 1;
    const targetYear = year ?? now.getUTCFullYear();
    const { start, end } = monthWindow(targetMonth, targetYear);

    const program = programId
      ? await this.prisma.foodProgram.findUnique({ where: { id: programId } })
      : await this.prisma.foodProgram.findFirst({
          where: { companyId: user.companyId, isActive: true },
        });
    if (!program) {
      return {
        program: null,
        message: 'No meal programme is configured for your company.',
        meals: [],
      };
    }
    if (!user.accessibleCompanyIds.includes(program.companyId)) {
      throw new ForbiddenException('That programme belongs to a company you do not have access to.');
    }

    const [meals, subscription] = await Promise.all([
      this.prisma.meal.findMany({
        where: { employeeId: user.id, foodProgramId: program.id, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.mealSubscription.findUnique({
        where: { employeeId_foodProgramId: { employeeId: user.id, foodProgramId: program.id } },
      }),
    ]);

    const cutoffMinutes = this.parseCutoff(program.cancelCutoff);
    const todayIso = toIsoDate(new Date());
    const nowMinutes = localMinutes(new Date());

    return {
      program: {
        ...program,
        selfCost: Number(program.selfCost),
        guestCost: Number(program.guestCost),
      },
      subscription,
      isSubscribed: subscription?.isActive === true,
      month: targetMonth,
      year: targetYear,
      meals: meals.map((meal, index) => {
        const iso = toIsoDate(meal.date);
        const isFuture = iso > todayIso;
        const isToday = iso === todayIso;
        return {
          sn: index + 1,
          id: meal.id,
          date: meal.date,
          day: meal.date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
          // Actual collection timestamp, or the "Not taken Yet" state.
          time: meal.takenAt ? meal.takenAt.toISOString() : null,
          timeLabel: meal.takenAt
            ? meal.takenAt.toISOString().slice(11, 16)
            : meal.status === 'CANCELLED' ? 'Cancelled' : 'Not taken Yet',
          menu: meal.menuSnapshot,
          guestMealCost: Number(meal.guestMealCost),
          selfCost: Number(meal.selfCost),
          guestCount: meal.guestCount,
          status: meal.status,
          cancelReason: meal.cancelReason,
          // A meal can only be cancelled before the morning cut-off.
          canCancel:
            meal.status === 'SCHEDULED' &&
            (isFuture || (isToday && nowMinutes < cutoffMinutes)),
        };
      }),
      totals: {
        mealsTaken: meals.filter((m) => m.status === 'TAKEN').length,
        mealsCancelled: meals.filter((m) => m.status === 'CANCELLED').length,
        mealsNotTaken: meals.filter((m) => m.status === 'NOT_TAKEN').length,
        selfCost: meals.reduce((sum, m) => sum + Number(m.selfCost), 0),
        guestCost: meals.reduce((sum, m) => sum + Number(m.guestMealCost), 0),
        payable: meals.reduce((sum, m) => sum + Number(m.selfCost) + Number(m.guestMealCost), 0),
      },
      cancelCutoff: program.cancelCutoff,
    };
  }

  private parseCutoff(cutoff: string): number {
    const [h, m] = cutoff.split(':').map(Number);
    return (h ?? 9) * 60 + (m ?? 30);
  }

  /** The Report tab: monthly consumption and cost, with a 6-month trend. */
  async report(user: SessionPrincipal, programId?: number, year?: number) {
    const targetYear = year ?? new Date().getUTCFullYear();
    const program = programId
      ? await this.prisma.foodProgram.findUnique({ where: { id: programId } })
      : await this.prisma.foodProgram.findFirst({
          where: { companyId: user.companyId, isActive: true },
        });
    if (!program) return { program: null, months: [] };

    const meals = await this.prisma.meal.findMany({
      where: {
        employeeId: user.id,
        foodProgramId: program.id,
        date: { gte: dateOnly(`${targetYear}-01-01`), lte: dateOnly(`${targetYear}-12-31`) },
      },
      select: { date: true, status: true, selfCost: true, guestMealCost: true, guestCount: true },
    });

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: new Date(Date.UTC(targetYear, i, 1))
        .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      taken: 0,
      cancelled: 0,
      notTaken: 0,
      guestMeals: 0,
      selfCost: 0,
      guestCost: 0,
      total: 0,
    }));

    for (const meal of meals) {
      const bucket = months[meal.date.getUTCMonth()];
      if (meal.status === 'TAKEN') bucket.taken += 1;
      else if (meal.status === 'CANCELLED') bucket.cancelled += 1;
      else if (meal.status === 'NOT_TAKEN') bucket.notTaken += 1;
      bucket.guestMeals += meal.guestCount;
      bucket.selfCost += Number(meal.selfCost);
      bucket.guestCost += Number(meal.guestMealCost);
      bucket.total += Number(meal.selfCost) + Number(meal.guestMealCost);
    }

    return {
      program: { id: program.id, name: program.name },
      year: targetYear,
      months,
      yearTotals: {
        taken: months.reduce((s, m) => s + m.taken, 0),
        cancelled: months.reduce((s, m) => s + m.cancelled, 0),
        notTaken: months.reduce((s, m) => s + m.notTaken, 0),
        guestMeals: months.reduce((s, m) => s + m.guestMeals, 0),
        selfCost: months.reduce((s, m) => s + m.selfCost, 0),
        guestCost: months.reduce((s, m) => s + m.guestCost, 0),
        total: months.reduce((s, m) => s + m.total, 0),
      },
    };
  }

  async subscribe(user: SessionPrincipal, programId: number) {
    const program = await this.prisma.foodProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Meal programme not found.');
    if (program.companyId !== user.companyId) {
      throw new ForbiddenException('That programme belongs to another company.');
    }
    if (!program.isActive) throw new BadRequestException('That programme is not active.');

    return this.prisma.mealSubscription.upsert({
      where: { employeeId_foodProgramId: { employeeId: user.id, foodProgramId: programId } },
      create: { employeeId: user.id, foodProgramId: programId, isActive: true },
      update: { isActive: true, unsubscribedAt: null, subscribedAt: new Date() },
    });
  }

  /**
   * Unsubscribing stops future meals but leaves history intact, so the
   * month's cost is still billable and auditable.
   */
  async unsubscribe(user: SessionPrincipal, programId: number) {
    const subscription = await this.prisma.mealSubscription.findUnique({
      where: { employeeId_foodProgramId: { employeeId: user.id, foodProgramId: programId } },
    });
    if (!subscription || !subscription.isActive) {
      throw new BadRequestException('You are not subscribed to that programme.');
    }

    const [updated, cancelled] = await this.prisma.$transaction([
      this.prisma.mealSubscription.update({
        where: { id: subscription.id },
        data: { isActive: false, unsubscribedAt: new Date() },
      }),
      // Only scheduled future meals are dropped.
      this.prisma.meal.updateMany({
        where: {
          employeeId: user.id,
          foodProgramId: programId,
          status: 'SCHEDULED',
          date: { gt: new Date() },
        },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Unsubscribed from programme', selfCost: 0 },
      }),
    ]);

    return { subscription: updated, futureMealsCancelled: cancelled.count };
  }

  async cancelMeal(user: SessionPrincipal, mealId: bigint, reason?: string) {
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      include: { program: { select: { cancelCutoff: true } } },
    });
    if (!meal) throw new NotFoundException('Meal not found.');
    if (meal.employeeId !== user.id) {
      throw new ForbiddenException('You can only cancel your own meal.');
    }
    if (meal.status !== 'SCHEDULED') {
      throw new BadRequestException(
        meal.status === 'TAKEN'
          ? 'That meal has already been collected.'
          : 'That meal is not scheduled.',
      );
    }

    const iso = toIsoDate(meal.date);
    const todayIso = toIsoDate(new Date());
    if (iso < todayIso) {
      throw new BadRequestException('You cannot cancel a meal in the past.');
    }
    if (iso === todayIso && localMinutes(new Date()) >= this.parseCutoff(meal.program.cancelCutoff)) {
      throw new BadRequestException(
        `Today's meal can no longer be cancelled — the cut-off was ${meal.program.cancelCutoff}. `
        + 'The kitchen has already been given the headcount.',
      );
    }

    return this.prisma.meal.update({
      where: { id: mealId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason ?? 'Cancelled by employee',
        // A cancelled meal is not charged.
        selfCost: 0,
      },
    });
  }

  async addGuestMeal(user: SessionPrincipal, mealId: bigint, guestCount: number) {
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      include: { program: { select: { guestCost: true, cancelCutoff: true } } },
    });
    if (!meal) throw new NotFoundException('Meal not found.');
    if (meal.employeeId !== user.id) throw new ForbiddenException('That is not your meal.');
    if (meal.status === 'CANCELLED') throw new BadRequestException('That meal is cancelled.');
    if (guestCount < 0 || guestCount > 5) {
      throw new BadRequestException('You can add between 0 and 5 guest meals.');
    }

    return this.prisma.meal.update({
      where: { id: mealId },
      data: {
        guestCount,
        guestMealCost: Number(meal.program.guestCost) * guestCount,
      },
    });
  }

  /** Company-wide consumption, for the kitchen and for finance. */
  async consumptionSummary(user: SessionPrincipal, month?: number, year?: number, companyId?: number) {
    if (!user.permissions.has(PERMISSIONS.FOOD_MANAGE)) {
      throw new ForbiddenException('You do not have permission to view programme-wide consumption.');
    }
    const now = new Date();
    const { start, end } = monthWindow(month ?? now.getUTCMonth() + 1, year ?? now.getUTCFullYear());
    const companyIds = companyFilter(user, companyId);

    const [byStatus, byDate, totals, subscriberCount] = await Promise.all([
      this.prisma.meal.groupBy({
        by: ['status'],
        where: { date: { gte: start, lte: end }, program: { companyId: { in: companyIds } } },
        _count: { _all: true },
      }),
      this.prisma.meal.groupBy({
        by: ['date'],
        where: {
          date: { gte: start, lte: end },
          status: { in: ['TAKEN', 'SCHEDULED'] },
          program: { companyId: { in: companyIds } },
        },
        _count: { _all: true },
        _sum: { guestCount: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.meal.aggregate({
        where: { date: { gte: start, lte: end }, program: { companyId: { in: companyIds } } },
        _sum: { selfCost: true, guestMealCost: true, guestCount: true },
      }),
      this.prisma.mealSubscription.count({
        where: { isActive: true, program: { companyId: { in: companyIds } } },
      }),
    ]);

    return {
      month: month ?? now.getUTCMonth() + 1,
      year: year ?? now.getUTCFullYear(),
      activeSubscribers: subscriberCount,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      dailyHeadcount: byDate.map((row) => ({
        date: toIsoDate(row.date),
        meals: row._count._all,
        guests: row._sum.guestCount ?? 0,
      })),
      totals: {
        employeeContribution: Number(totals._sum.selfCost ?? 0),
        guestRevenue: Number(totals._sum.guestMealCost ?? 0),
        guestMeals: totals._sum.guestCount ?? 0,
      },
    };
  }
}
