import { LEAVE_TYPE_COLORS, computeLeaveDays, proRateEntitlement } from '@kormo/shared';

import type { CalendarResult } from './calendar';
import { WINDOW_START } from './calendar';
import type { OrgResult, SeededEmployee } from './org';
import {
  TODAY, addDays, chance, d, iso, log, pick, prisma, randInt, rng, round2, section,
} from './lib';

export interface LeaveResult {
  /** employeeId → (date ISO → { leaveTypeId, isHalfDay }) for APPROVED leave. */
  approvedByEmployee: Map<string, Map<string, { leaveTypeId: number; isHalfDay: boolean }>>;
  leaveTypes: { id: number; key: string; label: string; companyId: number }[];
}

const LEAVE_TYPE_SPEC = [
  {
    key: 'casual', label: 'Casual Leave', defaultCount: 10,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: false,
    genderRestriction: 'NONE', maxConsecutiveDays: 3, minNoticeDays: 1,
    countsHolidays: false, sortOrder: 1,
  },
  {
    key: 'sick', label: 'Sick Leave', defaultCount: 14,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: true,
    genderRestriction: 'NONE', maxConsecutiveDays: 0, minNoticeDays: 0,
    countsHolidays: false, sortOrder: 2,
  },
  {
    key: 'annual', label: 'Annual Leave', defaultCount: 18,
    isCarryForwardable: true, maxCarryForward: 20, requiresDocument: false,
    genderRestriction: 'NONE', maxConsecutiveDays: 0, minNoticeDays: 7,
    countsHolidays: false, sortOrder: 3,
  },
  {
    // Bangladesh Labour Act: 16 weeks, counted in calendar days.
    key: 'maternity', label: 'Maternity Leave', defaultCount: 112,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: true,
    genderRestriction: 'FEMALE_ONLY', maxConsecutiveDays: 0, minNoticeDays: 30,
    countsHolidays: true, sortOrder: 4,
  },
  {
    key: 'paternity', label: 'Paternity Leave', defaultCount: 5,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: false,
    genderRestriction: 'MALE_ONLY', maxConsecutiveDays: 5, minNoticeDays: 7,
    countsHolidays: false, sortOrder: 5,
  },
  {
    key: 'comp_off', label: 'Compensatory Off', defaultCount: 0,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: false,
    genderRestriction: 'NONE', maxConsecutiveDays: 2, minNoticeDays: 0,
    countsHolidays: false, sortOrder: 6,
  },
  {
    key: 'lwp', label: 'Leave Without Pay', defaultCount: 0,
    isCarryForwardable: false, maxCarryForward: 0, requiresDocument: false,
    genderRestriction: 'NONE', maxConsecutiveDays: 0, minNoticeDays: 15,
    countsHolidays: false, sortOrder: 7, isPaid: false,
  },
];

const REASONS: Record<string, string[]> = {
  casual: [
    'Personal errand that cannot be scheduled outside working hours.',
    'Family commitment at home.',
    'Attending a relative\'s wedding ceremony.',
    'Need to visit the passport office in person.',
  ],
  sick: [
    'Down with fever and body ache; advised rest by the physician.',
    'Severe migraine, unable to work at a screen.',
    'Food poisoning — under medication.',
    'Follow-up appointment with the consultant after last week\'s tests.',
    'Seasonal flu with persistent cough.',
  ],
  annual: [
    'Family holiday planned in Cox\'s Bazar.',
    'Annual leave to visit my home district.',
    'Taking planned leave to spend time with family.',
    'Pre-booked trip abroad with family.',
  ],
  maternity: ['Statutory maternity leave as per the Bangladesh Labour Act.'],
  paternity: ['Paternity leave following the birth of my child.'],
  comp_off: [
    'Compensatory off against working the Eid holiday.',
    'Comp-off for the weekend spent on the release.',
  ],
  lwp: ['Extended personal leave; salary deduction acknowledged.'],
};

export async function seedLeave(org: OrgResult, calendar: CalendarResult): Promise<LeaveResult> {
  section('Leave types, policies, balances & requests');

  const year = TODAY.getUTCFullYear();

  // ── leave types & policies ─────────────────────────────────────────
  const leaveTypes: { id: number; key: string; label: string; companyId: number; countsHolidays: boolean; defaultCount: number; isCarryForwardable: boolean; maxCarryForward: number; genderRestriction: string; requiresDocument: boolean }[] = [];
  const policyByCompany = new Map<number, number>();

  for (const company of org.companies) {
    const created: { id: number; key: string; spec: (typeof LEAVE_TYPE_SPEC)[number] }[] = [];
    for (const spec of LEAVE_TYPE_SPEC) {
      const type = await prisma.leaveType.create({
        data: {
          companyId: company.id,
          key: spec.key,
          label: spec.label,
          colorHex: LEAVE_TYPE_COLORS[spec.key] ?? '#64748B',
          defaultCount: spec.defaultCount,
          isProRated: true,
          isCarryForwardable: spec.isCarryForwardable,
          maxCarryForward: spec.maxCarryForward,
          requiresDocument: spec.requiresDocument,
          genderRestriction: spec.genderRestriction as never,
          maxConsecutiveDays: spec.maxConsecutiveDays,
          minNoticeDays: spec.minNoticeDays,
          countsHolidays: spec.countsHolidays,
          isPaid: spec.isPaid !== false,
          sortOrder: spec.sortOrder,
        },
      });
      created.push({ ...type, spec });
      leaveTypes.push({
        id: type.id, key: type.key, label: type.label, companyId: company.id,
        countsHolidays: spec.countsHolidays, defaultCount: spec.defaultCount,
        isCarryForwardable: spec.isCarryForwardable, maxCarryForward: spec.maxCarryForward,
        genderRestriction: spec.genderRestriction, requiresDocument: spec.requiresDocument,
      });
    }

    const policy = await prisma.leavePolicy.create({
      data: {
        companyId: company.id,
        name: 'Standard Leave Policy',
        effectiveYear: year,
        description: 'Applies to all confirmed employees. Pro-rated in the year of joining.',
        isDefault: true,
        lines: {
          create: created.map((t) => ({ leaveTypeId: t.id, entitledCount: t.spec.defaultCount })),
        },
      },
    });
    policyByCompany.set(company.id, policy.id);
  }
  log('created leave types', `${LEAVE_TYPE_SPEC.length} x ${org.companies.length} tenants`);
  log('created leave policies', 'Standard Leave Policy (default)');

  // Bind every employee to their company's default policy.
  for (const company of org.companies) {
    await prisma.employee.updateMany({
      where: { companyId: company.id },
      data: { leavePolicyId: policyByCompany.get(company.id)! },
    });
  }

  // ── balances ───────────────────────────────────────────────────────
  const typesByCompany = new Map<number, typeof leaveTypes>();
  for (const t of leaveTypes) {
    const list = typesByCompany.get(t.companyId) ?? [];
    list.push(t);
    typesByCompany.set(t.companyId, list);
  }

  const balanceRows: any[] = [];
  const entitlementByEmp = new Map<string, Map<number, number>>();

  for (const emp of org.employees) {
    const types = typesByCompany.get(emp.companyId)!;
    const perType = new Map<number, number>();
    for (const type of types) {
      // Gender-restricted types get no entitlement for the other gender.
      if (type.genderRestriction === 'FEMALE_ONLY' && emp.gender !== 'FEMALE') continue;
      if (type.genderRestriction === 'MALE_ONLY' && emp.gender !== 'MALE') continue;
      // Comp-off and LWP accrue on grant, not on policy.
      if (['comp_off', 'lwp'].includes(type.key)) {
        perType.set(type.id, 0);
        balanceRows.push({
          employeeId: emp.id, leaveTypeId: type.id, year,
          actualLeaveCount: 0, remainingLeaveCount: 0, consumedCount: 0,
          pendingCount: 0, carriedForward: 0,
        });
        continue;
      }

      // Pro-rating a mid-year joiner is what produces the fractional
      // balances the dashboard shows (e.g. 8.56 / 8.56).
      const entitled = proRateEntitlement(type.defaultCount, iso(emp.joiningDate), year);
      perType.set(type.id, entitled);
      balanceRows.push({
        employeeId: emp.id, leaveTypeId: type.id, year,
        actualLeaveCount: entitled, remainingLeaveCount: entitled,
        consumedCount: 0, pendingCount: 0, carriedForward: 0,
      });
    }
    entitlementByEmp.set(String(emp.id), perType);
  }
  await prisma.leaveBalance.createMany({ data: balanceRows });
  log('created leave balances', `${balanceRows.length} rows for ${year}`);

  // ── carry forward from last year ───────────────────────────────────
  const carryRows: any[] = [];
  for (const emp of org.employees) {
    if (emp.joiningDate >= d(`${year}-01-01`)) continue; // not employed last year
    const annual = typesByCompany.get(emp.companyId)!.find((t) => t.key === 'annual');
    if (!annual || !chance(55)) continue;

    const eligible = round2(randInt(0, 12) + randInt(0, 100) / 100);
    const carried = Math.min(eligible, annual.maxCarryForward);
    carryRows.push({
      employeeId: emp.id,
      leaveTypeId: annual.id,
      fromYear: year - 1,
      toYear: year,
      eligibleDays: eligible,
      carriedDays: round2(carried),
      lapsedDays: round2(eligible - carried),
      expiresAt: d(`${year}-06-30`),
    });
  }
  await prisma.leaveCarryForward.createMany({ data: carryRows });
  // Fold the carried days into this year's opening balance.
  for (const row of carryRows) {
    await prisma.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, year,
        },
      },
      data: {
        carriedForward: row.carriedDays,
        actualLeaveCount: { increment: row.carriedDays },
        remainingLeaveCount: { increment: row.carriedDays },
      },
    });
  }
  log('created carry-forward records', carryRows.length);

  // ── requests ───────────────────────────────────────────────────────
  const holidaySpans = [...calendar.holidayMap.keys()].map((k) => ({ startDate: k, endDate: k }));
  const approvedByEmployee = new Map<string, Map<string, { leaveTypeId: number; isHalfDay: boolean }>>();
  const requestRows: any[] = [];
  const consumed = new Map<string, Map<number, { consumed: number; pending: number }>>();

  function bump(empId: string, typeId: number, field: 'consumed' | 'pending', days: number) {
    const perEmp = consumed.get(empId) ?? new Map();
    const cur = perEmp.get(typeId) ?? { consumed: 0, pending: 0 };
    cur[field] = round2(cur[field] + days);
    perEmp.set(typeId, cur);
    consumed.set(empId, perEmp);
  }

  for (const emp of org.employees) {
    const empKey = String(emp.id);
    const types = typesByCompany.get(emp.companyId)!.filter((t) => {
      if (t.genderRestriction === 'FEMALE_ONLY') return emp.gender === 'FEMALE';
      if (t.genderRestriction === 'MALE_ONLY') return emp.gender === 'MALE';
      return !['lwp'].includes(t.key);
    });
    const usedDates = new Set<string>();
    const approved = new Map<string, { leaveTypeId: number; isHalfDay: boolean }>();

    const requestCount = randInt(3, 9);
    for (let i = 0; i < requestCount; i++) {
      const type = pick(types.filter((t) => t.key !== 'maternity' || chance(8)));
      if (!type) continue;

      const isMaternity = type.key === 'maternity';
      const span = isMaternity ? 112 : type.key === 'annual' ? randInt(2, 7) : randInt(1, 3);

      // Spread requests across the window; a few land in the future so the
      // approval inbox is not empty.
      const earliest = Math.max(WINDOW_START.getTime(), emp.joiningDate.getTime());
      const latest = TODAY.getTime() + 25 * 86_400_000;
      if (latest <= earliest) continue;
      const startDate = new Date(earliest + Math.floor((latest - earliest) * rng()));
      startDate.setUTCHours(12, 0, 0, 0);
      const endDate = addDays(startDate, span - 1);

      // Skip anything that collides with leave this employee already has.
      const spanDates: string[] = [];
      for (let t = startDate.getTime(); t <= endDate.getTime(); t += 86_400_000) {
        spanDates.push(iso(new Date(t)));
      }
      if (spanDates.some((x) => usedDates.has(x))) continue;

      const isHalfDay = span === 1 && chance(18);
      const math = computeLeaveDays(iso(startDate), iso(endDate), {
        holidays: holidaySpans,
        countsHolidays: type.countsHolidays,
        dayPart: isHalfDay ? 'FIRST_HALF' : 'FULL_DAY',
      });
      if (math.leaveDays <= 0) continue;

      // Decide the outcome: future requests are pending, past ones mostly
      // approved, with a realistic sprinkling of rejections and withdrawals.
      const isFuture = startDate > TODAY;
      const status = isFuture
        ? chance(65) ? 'PENDING' : 'APPROVED'
        : chance(84) ? 'APPROVED' : chance(60) ? 'REJECTED' : 'CANCELLED';

      const appliedDate = addDays(startDate, -randInt(1, 14));
      requestRows.push({
        employeeId: emp.id,
        leaveTypeId: type.id,
        startDate,
        endDate,
        leaveDays: math.leaveDays,
        calendarDays: math.calendarDays,
        dayPart: isHalfDay ? 'FIRST_HALF' : 'FULL_DAY',
        isHalfDay,
        reason: pick(REASONS[type.key] ?? ['Personal reasons.']),
        appliedDate,
        status,
        approverId: emp.lineManagerId,
        approvedAt: status === 'APPROVED' ? addDays(appliedDate, randInt(0, 2)) : null,
        decisionNote:
          status === 'REJECTED'
            ? pick([
                'Team is short-handed that week — please re-plan.',
                'Overlaps with the quarter-end close.',
                'Insufficient notice for the requested span.',
              ])
            : status === 'APPROVED' && chance(25)
              ? 'Approved. Please complete the handover before you leave.'
              : null,
        documentPath: type.requiresDocument && chance(70)
          ? `leave/${emp.visibleId}/${iso(startDate)}-medical-certificate.pdf`
          : null,
        cancelledAt: status === 'CANCELLED' ? addDays(appliedDate, randInt(1, 4)) : null,
        contactWhileAway: span > 3 ? `Reachable on ${emp.username}@personal.example` : null,
      });

      spanDates.forEach((x) => usedDates.add(x));
      if (status === 'APPROVED') {
        for (const day of math.days) {
          if (day.chargeable) approved.set(day.date, { leaveTypeId: type.id, isHalfDay });
        }
        bump(empKey, type.id, 'consumed', math.leaveDays);
      } else if (status === 'PENDING') {
        bump(empKey, type.id, 'pending', math.leaveDays);
      }
    }
    approvedByEmployee.set(empKey, approved);
  }

  for (let i = 0; i < requestRows.length; i += 2_000) {
    await prisma.leaveRequest.createMany({ data: requestRows.slice(i, i + 2_000) });
  }
  log('created leave requests', requestRows.length);

  // ── reconcile balances against what was actually consumed ──────────
  let reconciled = 0;
  for (const [empId, perType] of consumed) {
    for (const [typeId, counts] of perType) {
      const entitled = entitlementByEmp.get(empId)?.get(typeId) ?? 0;
      const carried = carryRows.find((r) => String(r.employeeId) === empId && r.leaveTypeId === typeId)?.carriedDays ?? 0;
      const total = round2(entitled + carried);
      await prisma.leaveBalance.updateMany({
        where: { employeeId: BigInt(empId), leaveTypeId: typeId, year },
        data: {
          consumedCount: counts.consumed,
          pendingCount: counts.pending,
          // Never publish a negative balance; overdrawn days surface as
          // LWP in payroll instead.
          remainingLeaveCount: Math.max(0, round2(total - counts.consumed)),
        },
      });
      reconciled += 1;
    }
  }
  log('reconciled leave balances', `${reconciled} employee/type pairs`);

  const statusCounts = requestRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  log('request status mix', Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(' '));

  return {
    approvedByEmployee,
    leaveTypes: leaveTypes.map((t) => ({ id: t.id, key: t.key, label: t.label, companyId: t.companyId })),
  };
}
