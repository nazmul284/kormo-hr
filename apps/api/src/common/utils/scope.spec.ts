import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from '@kormo/shared';

import type { SessionPrincipal } from '../types';
import { collectManagerChain, collectSubordinateIds, companyFilter, resolveScope } from './scope';
import type { PrismaService } from '../prisma/prisma.service';

function principal(overrides: Partial<SessionPrincipal> = {}): SessionPrincipal {
  return {
    id: 1n,
    employeeVisibleId: '101',
    username: 'test',
    companyId: 1,
    departmentId: 2,
    locationId: 1,
    isLineManager: false,
    isHeadOfDepartment: false,
    roles: ['EMPLOYEE'],
    permissions: new Set<string>(),
    accessibleCompanyIds: [1],
    features: {},
    ...overrides,
  };
}

describe('resolveScope', () => {
  const keys = { all: PERMISSIONS.EMPLOYEE_READ_ALL, team: PERMISSIONS.EMPLOYEE_READ_TEAM };

  it('defaults to self when the caller holds neither permission', () => {
    expect(resolveScope(principal(), keys)).toBe('self');
  });

  it('returns team for a line manager', () => {
    const user = principal({ permissions: new Set([PERMISSIONS.EMPLOYEE_READ_TEAM]) });
    expect(resolveScope(user, keys)).toBe('team');
  });

  it('prefers all over team when both are held', () => {
    const user = principal({
      permissions: new Set([PERMISSIONS.EMPLOYEE_READ_TEAM, PERMISSIONS.EMPLOYEE_READ_ALL]),
    });
    expect(resolveScope(user, keys)).toBe('all');
  });
});

describe('companyFilter', () => {
  it('returns every accessible company when none is requested', () => {
    expect(companyFilter(principal({ accessibleCompanyIds: [1, 2] }))).toEqual([1, 2]);
  });

  it('narrows to the requested company when it is accessible', () => {
    expect(companyFilter(principal({ accessibleCompanyIds: [1, 2] }), 2)).toEqual([2]);
  });

  it('refuses a company the caller has no grant for', () => {
    expect(() => companyFilter(principal({ accessibleCompanyIds: [1] }), 99)).toThrow(
      ForbiddenException,
    );
  });
});

describe('collectSubordinateIds', () => {
  /** Minimal stub that walks a manager → reports adjacency map. */
  function stubPrisma(tree: Record<string, string[]>): PrismaService {
    return {
      employee: {
        findMany: jest.fn(async ({ where }: never) => {
          const parents: bigint[] = (where as { lineManagerId: { in: bigint[] } }).lineManagerId.in;
          return parents.flatMap((parent) =>
            (tree[String(parent)] ?? []).map((child) => ({ id: BigInt(child) })),
          );
        }),
      },
    } as unknown as PrismaService;
  }

  it('walks the whole sub-tree, not just direct reports', async () => {
    // 1 → 2,3 ; 2 → 4 ; 4 → 5
    const prisma = stubPrisma({ '1': ['2', '3'], '2': ['4'], '4': ['5'] });
    const ids = await collectSubordinateIds(prisma, 1n);
    expect(ids.map(Number).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });

  it('issues one query per level rather than one per employee', async () => {
    const prisma = stubPrisma({ '1': ['2', '3'], '2': ['4'], '3': ['5'], '4': ['6'] });
    await collectSubordinateIds(prisma, 1n);
    // levels: {2,3} → {4,5} → {6} → {} = 4 calls
    expect((prisma.employee.findMany as jest.Mock).mock.calls).toHaveLength(4);
  });

  it('terminates on a reporting cycle instead of hanging', async () => {
    // Bad data: 1 → 2 → 3 → 1
    const prisma = stubPrisma({ '1': ['2'], '2': ['3'], '3': ['1'] });
    const ids = await collectSubordinateIds(prisma, 1n);
    expect(ids.map(Number).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('returns nothing for someone with no reports', async () => {
    expect(await collectSubordinateIds(stubPrisma({}), 1n)).toEqual([]);
  });

  it('honours the depth limit', async () => {
    const prisma = stubPrisma({ '1': ['2'], '2': ['3'], '3': ['4'], '4': ['5'] });
    const ids = await collectSubordinateIds(prisma, 1n, 2);
    expect(ids.map(Number)).toEqual([2, 3]);
  });
});

describe('collectManagerChain', () => {
  function stubPrisma(parents: Record<string, string | null>): PrismaService {
    return {
      employee: {
        findUnique: jest.fn(async ({ where }: never) => {
          const id = String((where as { id: bigint }).id);
          const parent = parents[id];
          return { lineManagerId: parent ? BigInt(parent) : null };
        }),
      },
    } as unknown as PrismaService;
  }

  it('walks upwards, nearest manager first', async () => {
    const prisma = stubPrisma({ '5': '4', '4': '2', '2': '1', '1': null });
    const chain = await collectManagerChain(prisma, 5n);
    expect(chain.map(Number)).toEqual([4, 2, 1]);
  });

  it('terminates on a cycle', async () => {
    const prisma = stubPrisma({ '1': '2', '2': '1' });
    const chain = await collectManagerChain(prisma, 1n);
    expect(chain.map(Number)).toEqual([2]);
  });

  it('returns nothing for someone at the top', async () => {
    expect(await collectManagerChain(stubPrisma({ '1': null }), 1n)).toEqual([]);
  });
});
