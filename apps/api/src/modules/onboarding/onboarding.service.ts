import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { addDays, toIsoDate } from '../../common/utils/dates';
import { collectSubordinateIds, companyFilter } from '../../common/utils/scope';

const LANES = ['EMPLOYEE', 'HR', 'IT', 'MANAGER'] as const;
type Lane = (typeof LANES)[number];

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pending-joiner card grid.
   *
   * Each card carries the four-lane checklist status, which is what makes
   * a stalled onboarding visible: "IT Task Pending" on someone who
   * started a week ago is an actionable signal, not a footnote.
   */
  async pendingEmployees(user: SessionPrincipal, companyId?: number) {
    const canSeeAll = user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL) ||
      user.permissions.has(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE);
    const companyIds = companyFilter(user, companyId);

    // A line manager sees their own joiners; HR/IT see everyone's.
    const subordinates = canSeeAll ? null : await collectSubordinateIds(this.prisma, user.id);

    const where: Prisma.EmployeeWhereInput = {
      companyId: { in: companyIds },
      onboardingTasks: { some: {} },
      ...(canSeeAll
        ? {}
        : {
            OR: [
              { id: user.id },
              ...(subordinates && subordinates.length > 0 ? [{ id: { in: subordinates } }] : []),
              { onboardingTasks: { some: { assigneeId: user.id } } },
            ],
          }),
    };

    const employees = await this.prisma.employee.findMany({
      where,
      select: {
        id: true, employeeVisibleId: true, firstName: true, lastName: true,
        joiningDate: true, employmentStatus: true, thumbnailsPath01: true, officialEmail: true,
        designation: { select: { name: true } },
        department: { select: { name: true } },
        lineManager: { select: { id: true, firstName: true, lastName: true } },
        onboardingTasks: {
          select: {
            id: true, lane: true, status: true, title: true, dueDate: true,
            assigneeId: true, completedAt: true,
          },
        },
      },
      orderBy: { joiningDate: 'desc' },
    });

    const now = new Date();

    const cards = employees.map((employee) => {
      const tasks = employee.onboardingTasks;
      const laneStatus = LANES.map((lane) => {
        const laneTasks = tasks.filter((t) => t.lane === lane);
        const done = laneTasks.filter((t) => t.status === 'DONE').length;
        const blocked = laneTasks.filter((t) => t.status === 'BLOCKED').length;
        const overdue = laneTasks.filter(
          (t) => t.status !== 'DONE' && t.dueDate !== null && t.dueDate < now,
        ).length;
        return {
          lane,
          label: `${LANE_LABELS[lane]} Task ${done === laneTasks.length && laneTasks.length > 0 ? 'Complete' : 'Pending'}`,
          total: laneTasks.length,
          done,
          pending: laneTasks.length - done,
          blocked,
          overdue,
          isComplete: laneTasks.length > 0 && done === laneTasks.length,
        };
      });

      const totalDone = tasks.filter((t) => t.status === 'DONE').length;

      return {
        employee: {
          id: employee.id,
          employeeVisibleId: employee.employeeVisibleId,
          fullName: `${employee.firstName} ${employee.lastName}`,
          initials: initials(employee.firstName, employee.lastName),
          avatarUrl: employee.thumbnailsPath01,
          officialEmail: employee.officialEmail,
          designation: employee.designation?.name ?? null,
          department: employee.department?.name ?? null,
          joiningDate: employee.joiningDate,
          employmentStatus: employee.employmentStatus,
          lineManager: employee.lineManager
            ? {
                id: employee.lineManager.id,
                fullName: `${employee.lineManager.firstName} ${employee.lineManager.lastName}`,
              }
            : null,
        },
        lanes: laneStatus,
        progressPct: tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0,
        taskCount: tasks.length,
        doneCount: totalDone,
        overdueCount: tasks.filter(
          (t) => t.status !== 'DONE' && t.dueDate !== null && t.dueDate < now,
        ).length,
        blockedCount: tasks.filter((t) => t.status === 'BLOCKED').length,
        // Negative = not started yet; the grid sorts on this.
        daysSinceJoining: Math.floor((now.getTime() - employee.joiningDate.getTime()) / 86_400_000),
        isComplete: tasks.length > 0 && totalDone === tasks.length,
        myOpenTasks: tasks.filter((t) => t.assigneeId === user.id && t.status !== 'DONE').length,
      };
    });

    return {
      cards: cards.filter((card) => !card.isComplete || card.daysSinceJoining < 30),
      summary: {
        totalJoiners: cards.length,
        inProgress: cards.filter((c) => !c.isComplete).length,
        completed: cards.filter((c) => c.isComplete).length,
        overdue: cards.filter((c) => c.overdueCount > 0).length,
        blocked: cards.filter((c) => c.blockedCount > 0).length,
        assignedToMe: cards.reduce((sum, c) => sum + c.myOpenTasks, 0),
      },
    };
  }

  /** One joiner's full checklist, grouped by lane. */
  async employeeChecklist(user: SessionPrincipal, employeeId: bigint) {
    const tasks = await this.prisma.onboardingTask.findMany({
      where: { employeeId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        employee: { select: { id: true, companyId: true, firstName: true, lastName: true, joiningDate: true } },
      },
      orderBy: [{ lane: 'asc' }, { sortOrder: 'asc' }],
    });

    if (tasks.length === 0) {
      throw new NotFoundException('No onboarding checklist exists for that employee.');
    }
    if (!user.accessibleCompanyIds.includes(tasks[0].employee.companyId)) {
      throw new ForbiddenException('That employee belongs to a company you do not have access to.');
    }

    const now = new Date();
    return {
      employee: {
        id: tasks[0].employee.id,
        fullName: `${tasks[0].employee.firstName} ${tasks[0].employee.lastName}`,
        joiningDate: tasks[0].employee.joiningDate,
      },
      lanes: LANES.map((lane) => ({
        lane,
        label: LANE_LABELS[lane],
        tasks: tasks
          .filter((task) => task.lane === lane)
          .map((task) => ({
            ...task,
            isOverdue: task.status !== 'DONE' && task.dueDate !== null && task.dueDate < now,
            canAction:
              task.assigneeId === user.id ||
              user.permissions.has(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE),
            assignee: task.assignee
              ? {
                  id: task.assignee.id,
                  fullName: `${task.assignee.firstName} ${task.assignee.lastName}`,
                }
              : null,
          })),
      })),
    };
  }

  /** Tasks assigned to the caller, across every joiner. */
  async myTasks(user: SessionPrincipal) {
    const tasks = await this.prisma.onboardingTask.findMany({
      where: { assigneeId: user.id, status: { not: 'DONE' } },
      include: {
        employee: {
          select: {
            id: true, employeeVisibleId: true, firstName: true, lastName: true,
            joiningDate: true, designation: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    const now = new Date();
    return tasks.map((task) => ({
      ...task,
      employee: {
        ...task.employee,
        fullName: `${task.employee.firstName} ${task.employee.lastName}`,
        initials: initials(task.employee.firstName, task.employee.lastName),
      },
      isOverdue: task.dueDate !== null && task.dueDate < now,
    }));
  }

  /**
   * Advances a task.
   *
   * Only the assignee (or an onboarding administrator) can move it, and
   * a task whose blockers are unfinished cannot be marked done — the
   * dependency exists precisely to stop, say, an access card being
   * issued before the ID check is filed.
   */
  async updateTask(
    user: SessionPrincipal,
    taskId: bigint,
    dto: { status: string; note?: string; attachmentPath?: string },
  ) {
    const task = await this.prisma.onboardingTask.findUnique({
      where: { id: taskId },
      include: {
        templateItem: { select: { blockedBy: true } },
        employee: { select: { id: true, companyId: true } },
      },
    });
    if (!task) throw new NotFoundException('Onboarding task not found.');

    const isAssignee = task.assigneeId === user.id;
    const isAdmin = user.permissions.has(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE);
    if (!isAssignee && !isAdmin) {
      throw new ForbiddenException('This task is not assigned to you.');
    }
    if (isAdmin && !user.accessibleCompanyIds.includes(task.employee.companyId)) {
      throw new ForbiddenException('That task belongs to a company you do not have access to.');
    }

    if (dto.status === 'DONE' && (task.templateItem?.blockedBy?.length ?? 0) > 0) {
      const blockers = await this.prisma.onboardingTask.findMany({
        where: {
          employeeId: task.employeeId,
          templateItemId: { in: task.templateItem!.blockedBy },
          status: { not: 'DONE' },
        },
        select: { title: true },
      });
      if (blockers.length > 0) {
        throw new BadRequestException(
          `This task is blocked by: ${blockers.map((b) => b.title).join(', ')}.`,
        );
      }
    }

    const updated = await this.prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        status: dto.status as never,
        note: dto.note,
        attachmentPath: dto.attachmentPath,
        completedAt: dto.status === 'DONE' ? new Date() : null,
      },
    });

    // When the last task closes, tell HR the joiner is fully onboarded.
    if (dto.status === 'DONE') {
      const remaining = await this.prisma.onboardingTask.count({
        where: { employeeId: task.employeeId, status: { not: 'DONE' } },
      });
      if (remaining === 0) {
        const hrAdmins = await this.prisma.employee.findMany({
          where: {
            companyId: task.employee.companyId,
            roles: { some: { role: { key: 'HR_ADMIN' } } },
          },
          select: { id: true },
        });
        const joiner = await this.prisma.employee.findUniqueOrThrow({
          where: { id: task.employeeId },
          select: { firstName: true, lastName: true },
        });
        if (hrAdmins.length > 0) {
          await this.prisma.notification.createMany({
            data: hrAdmins.map((admin) => ({
              employeeId: admin.id,
              kind: 'ONBOARDING' as const,
              title: `Onboarding complete: ${joiner.firstName} ${joiner.lastName}`,
              body: 'Every task across all four lanes is done.',
              link: '/onboarding',
              entityType: 'employee',
              entityId: String(task.employeeId),
            })),
          });
        }
      }
    }

    return updated;
  }

  /** Templates an administrator can manage. */
  async templates(user: SessionPrincipal, companyId?: number) {
    const companyIds = companyFilter(user, companyId);
    return this.prisma.onboardingTemplate.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Provisions a checklist for a joiner from a template.
   *
   * Lane owners are resolved at provisioning time: HR and IT tasks route
   * to the respective role holders, manager tasks to the line manager,
   * and employee tasks to the joiner themselves.
   */
  async provision(user: SessionPrincipal, employeeId: bigint, templateId?: number) {
    if (!user.permissions.has(PERMISSIONS.ONBOARDING_TEMPLATE_WRITE)) {
      throw new ForbiddenException('You do not have permission to provision onboarding.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, joiningDate: true, lineManagerId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (!user.accessibleCompanyIds.includes(employee.companyId)) {
      throw new ForbiddenException('That employee belongs to a company you do not have access to.');
    }

    const existing = await this.prisma.onboardingTask.count({ where: { employeeId } });
    if (existing > 0) {
      throw new BadRequestException('That employee already has an onboarding checklist.');
    }

    const template = templateId
      ? await this.prisma.onboardingTemplate.findUnique({
          where: { id: templateId },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        })
      : await this.prisma.onboardingTemplate.findFirst({
          where: { companyId: employee.companyId, isDefault: true, isActive: true },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        });

    if (!template) throw new NotFoundException('No onboarding template is available.');

    const [hrOwner, itOwner] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { companyId: employee.companyId, active: true, roles: { some: { role: { key: 'HR_ADMIN' } } } },
        select: { id: true },
      }),
      this.prisma.employee.findFirst({
        where: { companyId: employee.companyId, active: true, roles: { some: { role: { key: 'IT_ADMIN' } } } },
        select: { id: true },
      }),
    ]);

    const resolveAssignee = (lane: Lane): bigint | null => {
      switch (lane) {
        case 'HR': return hrOwner?.id ?? null;
        case 'IT': return itOwner?.id ?? null;
        case 'MANAGER': return employee.lineManagerId;
        case 'EMPLOYEE': return employee.id;
      }
    };

    await this.prisma.onboardingTask.createMany({
      data: template.items.map((item) => ({
        employeeId,
        templateItemId: item.id,
        lane: item.lane,
        title: item.title,
        description: item.description,
        assigneeId: resolveAssignee(item.lane as Lane),
        dueDate: addDays(employee.joiningDate, item.dueOffsetDays),
        sortOrder: item.sortOrder,
      })),
    });

    return {
      provisioned: true,
      employeeId,
      taskCount: template.items.length,
      template: template.name,
    };
  }
}

const LANE_LABELS: Record<Lane, string> = {
  EMPLOYEE: 'Employee',
  HR: 'HR',
  IT: 'IT',
  MANAGER: 'Manager',
};
