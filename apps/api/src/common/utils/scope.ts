import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '@kormo/shared';
import type { Prisma } from '@prisma/client';

import type { ScopeLevel, SessionPrincipal } from '../types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves how wide a view the caller is entitled to for a given family
 * of read permissions.
 *
 * This is the single place visibility is decided. Every list endpoint
 * funnels through it, so "who can see whom" cannot drift between modules —
 * which is exactly how row-level leaks happen in HR systems.
 */
export function resolveScope(
  user: SessionPrincipal,
  permissions: { all: string; team?: string },
): ScopeLevel {
  if (user.permissions.has(permissions.all)) return 'all';
  if (permissions.team && user.permissions.has(permissions.team)) return 'team';
  return 'self';
}

/**
 * Builds an `Employee` where-clause matching the caller's scope.
 *
 * `team` means the caller's whole reporting sub-tree (not just direct
 * reports) plus anyone they are a dotted-line or department head for —
 * a manager reviewing leave needs to see a report's report.
 */
export async function employeeScopeWhere(
  prisma: PrismaService,
  user: SessionPrincipal,
  scope: ScopeLevel,
): Promise<Prisma.EmployeeWhereInput> {
  if (scope === 'all') {
    // Still tenant-bounded: "all" never means across companies the caller
    // has no grant for.
    return { companyId: { in: user.accessibleCompanyIds } };
  }

  if (scope === 'self') {
    return { id: user.id };
  }

  const subtree = await collectSubordinateIds(prisma, user.id);
  return {
    companyId: { in: user.accessibleCompanyIds },
    OR: [
      { id: user.id },
      { id: { in: subtree } },
      { dottedManager1Id: user.id },
      { dottedManager2Id: user.id },
      ...(user.isHeadOfDepartment && user.departmentId
        ? [{ departmentId: user.departmentId }]
        : []),
    ],
  };
}

/**
 * Walks the reporting tree downwards, breadth first.
 *
 * Iterative rather than recursive per-node: one query per level instead of
 * one per employee, and a visited set so a bad data cycle (A reports to B
 * reports to A) terminates instead of hanging the request.
 */
export async function collectSubordinateIds(
  prisma: PrismaService,
  rootId: bigint,
  maxDepth = 12,
): Promise<bigint[]> {
  const collected = new Set<string>();
  let frontier = [rootId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const children = await prisma.employee.findMany({
      where: { lineManagerId: { in: frontier } },
      select: { id: true },
    });
    const next: bigint[] = [];
    for (const child of children) {
      const key = String(child.id);
      if (collected.has(key) || key === String(rootId)) continue;
      collected.add(key);
      next.push(child.id);
    }
    frontier = next;
  }

  return [...collected].map((x) => BigInt(x));
}

/** Walks upwards to the top of the reporting chain. */
export async function collectManagerChain(
  prisma: PrismaService,
  employeeId: bigint,
  maxDepth = 12,
): Promise<bigint[]> {
  const chain: bigint[] = [];
  const seen = new Set<string>([String(employeeId)]);
  let cursor: bigint | null = employeeId;

  for (let depth = 0; depth < maxDepth && cursor !== null; depth++) {
    const row: { lineManagerId: bigint | null } | null = await prisma.employee.findUnique({
      where: { id: cursor },
      select: { lineManagerId: true },
    });
    const managerId = row?.lineManagerId ?? null;
    if (managerId === null || seen.has(String(managerId))) break;
    seen.add(String(managerId));
    chain.push(managerId);
    cursor = managerId;
  }

  return chain;
}

/**
 * Asserts the caller may read the target employee, and returns the scope
 * that granted it. Throws rather than silently narrowing, so a UI bug
 * surfaces as a 403 instead of a confusingly empty page.
 */
export async function assertCanViewEmployee(
  prisma: PrismaService,
  user: SessionPrincipal,
  targetId: bigint,
): Promise<ScopeLevel> {
  if (targetId === user.id) return 'self';

  if (user.permissions.has(PERMISSIONS.EMPLOYEE_READ_ALL)) {
    const target = await prisma.employee.findUnique({
      where: { id: targetId },
      select: { companyId: true },
    });
    if (target && user.accessibleCompanyIds.includes(target.companyId)) return 'all';
    throw new ForbiddenException('That employee belongs to a company you do not have access to.');
  }

  if (user.permissions.has(PERMISSIONS.EMPLOYEE_READ_TEAM)) {
    const subtree = await collectSubordinateIds(prisma, user.id);
    if (subtree.some((id) => id === targetId)) return 'team';
    const dotted = await prisma.employee.findFirst({
      where: {
        id: targetId,
        OR: [
          { dottedManager1Id: user.id },
          { dottedManager2Id: user.id },
          ...(user.isHeadOfDepartment && user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
      },
      select: { id: true },
    });
    if (dotted) return 'team';
  }

  throw new ForbiddenException('You do not have access to this employee record.');
}

/** Company ids the caller may query, intersected with an optional filter. */
export function companyFilter(user: SessionPrincipal, requested?: number): number[] {
  if (requested === undefined) return user.accessibleCompanyIds;
  if (!user.accessibleCompanyIds.includes(requested)) {
    throw new ForbiddenException('You do not have access to that company.');
  }
  return [requested];
}
