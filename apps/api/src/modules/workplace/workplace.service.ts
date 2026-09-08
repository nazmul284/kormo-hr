import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, initials } from '@kormo/shared';
import { Prisma } from '@prisma/client';

import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionPrincipal } from '../../common/types';
import { companyFilter } from '../../common/utils/scope';

@Injectable()
export class WorkplaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── notice board ───────────────────────────────────────────────────

  /**
   * Notices visible to the caller. A notice scoped to specific
   * departments is filtered at the query, not hidden in the UI.
   */
  async notices(
    user: SessionPrincipal,
    query: { page: number; pageSize: number; skip: number; sortDir: 'asc' | 'desc'; search?: string },
  ) {
    const now = new Date();
    const where: Prisma.NoticeWhereInput = {
      companyId: { in: user.accessibleCompanyIds },
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(user.departmentId
        ? { AND: [{ OR: [{ departmentIds: { isEmpty: true } }, { departmentIds: { has: user.departmentId } }] }] }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        // Pinned notices float to the top of the board.
        orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
        include: { author: { select: { id: true, firstName: true, lastName: true, thumbnailsPath01: true } } },
      }),
      this.prisma.notice.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        author: row.author
          ? {
              id: row.author.id,
              fullName: `${row.author.firstName} ${row.author.lastName}`,
              initials: initials(row.author.firstName, row.author.lastName),
              avatarUrl: row.author.thumbnailsPath01,
            }
          : null,
      })),
      total,
      query,
    );
  }

  // ── office policies ────────────────────────────────────────────────

  async policies(user: SessionPrincipal, latestOnly = false) {
    const policies = await this.prisma.officePolicy.findMany({
      where: {
        companyId: { in: user.accessibleCompanyIds },
        ...(latestOnly ? { isLatest: true } : {}),
      },
      orderBy: [{ effectiveFrom: 'desc' }],
    });

    return {
      policies,
      /** The Latest Policy shortcut on the dashboard. */
      latest: policies[0] ?? null,
      requiringAcknowledgement: policies.filter((p) => p.requiresAck),
      byCategory: Object.entries(
        policies.reduce<Record<string, typeof policies>>((acc, policy) => {
          const key = policy.category ?? 'Other';
          acc[key] = [...(acc[key] ?? []), policy];
          return acc;
        }, {}),
      ).map(([category, items]) => ({ category, items })),
    };
  }

  // ── notifications ──────────────────────────────────────────────────

  async notifications(
    user: SessionPrincipal,
    query: { page: number; pageSize: number; skip: number; unreadOnly?: boolean; kind?: string },
  ) {
    const where: Prisma.NotificationWhereInput = {
      employeeId: user.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.kind ? { kind: query.kind as never } : {}),
    };

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { employeeId: user.id, readAt: null } }),
    ]);

    return { ...paginate(rows, total, query), unreadCount };
  }

  async markRead(user: SessionPrincipal, notificationIds?: bigint[]) {
    const result = await this.prisma.notification.updateMany({
      // Always constrained to the caller: an id list from the client can
      // never be used to touch someone else's notifications.
      where: {
        employeeId: user.id,
        readAt: null,
        ...(notificationIds && notificationIds.length > 0 ? { id: { in: notificationIds } } : {}),
      },
      data: { readAt: new Date() },
    });
    return { marked: result.count };
  }

  async unreadCount(user: SessionPrincipal) {
    const [total, byKind] = await Promise.all([
      this.prisma.notification.count({ where: { employeeId: user.id, readAt: null } }),
      this.prisma.notification.groupBy({
        by: ['kind'],
        where: { employeeId: user.id, readAt: null },
        _count: { _all: true },
      }),
    ]);
    return {
      total,
      byKind: byKind.map((row) => ({ kind: row.kind, count: row._count._all })),
    };
  }

  // ── help desk ──────────────────────────────────────────────────────

  async tickets(
    user: SessionPrincipal,
    query: { page: number; pageSize: number; skip: number; status?: string; scope?: 'mine' | 'assigned' | 'all' },
  ) {
    const scope = query.scope ?? 'mine';
    const canSeeAll = user.permissions.has(PERMISSIONS.HELPDESK_RESOLVE);

    const where: Prisma.HelpdeskTicketWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(scope === 'all' && canSeeAll
        ? { companyId: { in: user.accessibleCompanyIds } }
        : scope === 'assigned'
          ? { assigneeId: user.id }
          : { requesterId: user.id }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.helpdeskTicket.findMany({
        where,
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.pageSize,
        include: {
          requester: { select: { id: true, employeeVisibleId: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.helpdeskTicket.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        requester: {
          ...row.requester,
          fullName: `${row.requester.firstName} ${row.requester.lastName}`,
          initials: initials(row.requester.firstName, row.requester.lastName),
        },
        assignee: row.assignee
          ? { id: row.assignee.id, fullName: `${row.assignee.firstName} ${row.assignee.lastName}` }
          : null,
        ageDays: Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000),
      })),
      total,
      query,
    );
  }

  async createTicket(
    user: SessionPrincipal,
    dto: { category: string; subject: string; body: string; priority?: string; attachmentPath?: string },
  ) {
    // Route to whoever owns that category.
    const roleKey = dto.category === 'IT' ? 'IT_ADMIN'
      : dto.category === 'Payroll' ? 'PAYROLL_ADMIN'
      : 'HR_ADMIN';

    const assignee = await this.prisma.employee.findFirst({
      where: {
        companyId: user.companyId,
        active: true,
        roles: { some: { role: { key: roleKey } } },
      },
      select: { id: true },
    });

    const ticket = await this.prisma.helpdeskTicket.create({
      data: {
        companyId: user.companyId,
        requesterId: user.id,
        assigneeId: assignee?.id ?? null,
        category: dto.category,
        subject: dto.subject,
        body: dto.body,
        priority: (dto.priority ?? 'MEDIUM') as never,
        attachmentPath: dto.attachmentPath,
      },
    });

    if (assignee) {
      await this.prisma.notification.create({
        data: {
          employeeId: assignee.id,
          kind: 'SYSTEM',
          title: `New ${dto.category} ticket: ${dto.subject}`,
          body: dto.body.slice(0, 200),
          link: '/helpdesk',
          entityType: 'helpdesk_ticket',
          entityId: String(ticket.id),
        },
      });
    }

    return ticket;
  }

  async updateTicket(
    user: SessionPrincipal,
    ticketId: number,
    dto: { status?: string; resolutionNote?: string; assigneeId?: string; priority?: string },
  ) {
    const ticket = await this.prisma.helpdeskTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const isRequester = ticket.requesterId === user.id;
    const isAssignee = ticket.assigneeId === user.id;
    const canResolve = user.permissions.has(PERMISSIONS.HELPDESK_RESOLVE);
    if (!isRequester && !isAssignee && !canResolve) {
      throw new ForbiddenException('You cannot update this ticket.');
    }
    // A requester may close their own ticket, but not resolve someone
    // else's or reassign it.
    if (isRequester && !isAssignee && !canResolve && dto.status !== 'CLOSED') {
      throw new ForbiddenException('As the requester you can only close this ticket.');
    }

    const resolved = dto.status === 'RESOLVED' || dto.status === 'CLOSED';

    const updated = await this.prisma.helpdeskTicket.update({
      where: { id: ticketId },
      data: {
        status: dto.status as never,
        resolutionNote: dto.resolutionNote,
        priority: dto.priority as never,
        assigneeId: dto.assigneeId ? BigInt(dto.assigneeId) : undefined,
        resolvedAt: resolved ? new Date() : null,
      },
    });

    if (resolved && ticket.requesterId !== user.id) {
      await this.prisma.notification.create({
        data: {
          employeeId: ticket.requesterId,
          kind: 'SYSTEM',
          title: `Your ticket was ${dto.status?.toLowerCase()}`,
          body: dto.resolutionNote ?? ticket.subject,
          link: '/helpdesk',
          entityType: 'helpdesk_ticket',
          entityId: String(ticketId),
        },
      });
    }

    return updated;
  }

  // ── audit trail ────────────────────────────────────────────────────

  async auditLog(
    user: SessionPrincipal,
    query: {
      page: number; pageSize: number; skip: number;
      entityType?: string; entityId?: string; action?: string; actorId?: string;
    },
  ) {
    if (!user.permissions.has(PERMISSIONS.AUDIT_READ)) {
      throw new ForbiddenException('You do not have permission to read the audit trail.');
    }

    const where: Prisma.AuditLogWhereInput = {
      companyId: { in: user.accessibleCompanyIds },
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.actorId ? { actorId: BigInt(query.actorId) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
        include: {
          actor: { select: { id: true, employeeVisibleId: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({
        ...row,
        actor: row.actor
          ? {
              ...row.actor,
              fullName: `${row.actor.firstName} ${row.actor.lastName}`,
              initials: initials(row.actor.firstName, row.actor.lastName),
            }
          : null,
      })),
      total,
      query,
    );
  }
}
