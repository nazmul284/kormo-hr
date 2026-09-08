import { computeLeaveDays } from '@kormo/shared';

import type { CalendarResult } from './calendar';
import type { LeaveResult } from './leave';
import type { OrgResult } from './org';
import {
  TODAY, addDays, atTime, chance, iso, log, pick, pickN, prisma, randInt, round2, section,
} from './lib';

/**
 * Makes the demo accounts actually demonstrable.
 *
 * Random distribution leaves the hand-placed accounts with whatever they
 * happen to get — and the `manager` login exists specifically to show
 * the approval inbox, so an empty inbox makes it useless. This step runs
 * last and guarantees each role has representative work waiting, without
 * touching the statistical shape of the rest of the data.
 */
export async function seedDemoGuarantees(
  org: OrgResult,
  calendar: CalendarResult,
  leave: LeaveResult,
): Promise<void> {
  section('Demo account guarantees');

  const manager = org.employees.find((e) => e.username === 'manager');
  const hrAdmin = org.employees.find((e) => e.username === 'hr.admin');
  if (!manager || !hrAdmin) {
    log('demo accounts missing — skipping guarantees');
    return;
  }

  // ── 1. give the manager a real team ────────────────────────────────
  const currentReports = await prisma.employee.findMany({
    where: { lineManagerId: manager.id, active: true },
    select: { id: true },
  });

  const TARGET_TEAM = 6;
  if (currentReports.length < TARGET_TEAM) {
    // Pull individual contributors from the same department who are not
    // themselves managers or hand-placed demo accounts.
    const candidates = org.employees.filter(
      (e) =>
        e.departmentId === manager.departmentId &&
        e.id !== manager.id &&
        !e.isLineManager &&
        e.employmentStatus !== 'SEPARATED' &&
        !['md', 'admin', 'hr.admin', 'payroll', 'manager', 'field'].includes(e.username) &&
        !currentReports.some((r) => r.id === e.id),
    );
    const moving = pickN(candidates, TARGET_TEAM - currentReports.length);
    if (moving.length > 0) {
      await prisma.employee.updateMany({
        where: { id: { in: moving.map((e) => e.id) } },
        data: { lineManagerId: manager.id },
      });
      // Their existing pending requests should follow the new manager.
      for (const model of ['leaveRequest', 'attendanceEditRequest', 'overtimeRequest', 'compensationRequest'] as const) {
        await (prisma[model] as { updateMany: Function }).updateMany({
          where: { employeeId: { in: moving.map((e) => e.id) }, status: 'PENDING' },
          data: { approverId: manager.id },
        });
      }
    }
    await prisma.employee.update({
      where: { id: manager.id },
      data: { isLineManager: true },
    });
  }

  const team = await prisma.employee.findMany({
    where: { lineManagerId: manager.id, active: true },
    select: { id: true, employeeVisibleId: true, firstName: true, lastName: true, gender: true, companyId: true },
  });
  log('manager team size', team.length);

  if (team.length === 0) return;

  // ── 2. pending leave requests routed to the manager ────────────────
  const existingPendingLeave = await prisma.leaveRequest.count({
    where: { approverId: manager.id, status: 'PENDING' },
  });

  const holidaySpans = [...calendar.holidayMap.keys()].map((k) => ({ startDate: k, endDate: k }));
  const leaveTypes = leave.leaveTypes.filter((t) => t.companyId === org.primaryCompanyId);

  const REASONS = [
    'Family wedding in my home district; travelling the day before.',
    'Medical appointment I could not schedule outside working hours.',
    'Pre-booked family trip — flights already paid for.',
    'Need to attend to a personal matter at the bank and passport office.',
    'Feeling unwell since last night; will get a certificate if needed.',
  ];

  const wanted = Math.max(0, 4 - existingPendingLeave);
  let createdLeave = 0;
  for (const member of pickN(team, Math.min(wanted, team.length))) {
    const type = pick(
      leaveTypes.filter((t) => !['maternity', 'paternity', 'lwp'].includes(t.key)),
    );
    if (!type) continue;

    // Future-dated so they are legitimately still pending.
    const startDate = addDays(TODAY, randInt(4, 30));
    const span = randInt(1, 3);
    const endDate = addDays(startDate, span - 1);

    // Skip anything overlapping a request this employee already has.
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: member.id,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (clash) continue;

    const math = computeLeaveDays(iso(startDate), iso(endDate), { holidays: holidaySpans });
    if (math.leaveDays <= 0) continue;

    await prisma.leaveRequest.create({
      data: {
        employeeId: member.id,
        leaveTypeId: type.id,
        startDate,
        endDate,
        leaveDays: math.leaveDays,
        calendarDays: math.calendarDays,
        reason: pick(REASONS),
        appliedDate: addDays(TODAY, -randInt(0, 3)),
        status: 'PENDING',
        approverId: manager.id,
      },
    });
    await prisma.leaveBalance.updateMany({
      where: { employeeId: member.id, leaveTypeId: type.id, year: TODAY.getUTCFullYear() },
      data: { pendingCount: { increment: math.leaveDays } },
    });
    await prisma.notification.create({
      data: {
        employeeId: manager.id,
        kind: 'LEAVE',
        title: `${member.firstName} ${member.lastName} requested ${type.label}`,
        body: `${iso(startDate)} to ${iso(endDate)} (${math.leaveDays} day(s))`,
        link: '/leave/approval',
        entityType: 'leave_request',
        entityId: '0',
      },
    });
    createdLeave += 1;
  }
  log('pending leave routed to manager', existingPendingLeave + createdLeave);

  // ── 3. pending attendance corrections ──────────────────────────────
  const existingEdits = await prisma.attendanceEditRequest.count({
    where: { approverId: manager.id, status: 'PENDING' },
  });
  let createdEdits = 0;
  if (existingEdits < 3) {
    for (const member of pickN(team, Math.min(3 - existingEdits, team.length))) {
      // A recent working day with a punch on it.
      const candidate = await prisma.attendance.findFirst({
        where: {
          employeeId: member.id,
          date: { gte: addDays(TODAY, -12), lte: addDays(TODAY, -1) },
          status: { in: ['PRESENT', 'LATE'] },
          editRequests: { none: {} },
        },
        orderBy: { date: 'desc' },
      });
      if (!candidate) continue;

      // Derive the corrected out-time from the shift that day actually
      // ran on — hardcoding an evening time produces a nonsense request
      // for anyone on the night shift.
      const shiftEnd = candidate.attendanceRosterEndTime ?? '19:00';
      const requestedOut = atTime(
        candidate.date,
        shiftEnd,
        randInt(5, 45),
        // A night shift ends the following morning.
      );
      const correctedOut =
        candidate.inTime && requestedOut <= candidate.inTime
          ? addDays(requestedOut, 1)
          : requestedOut;
      await prisma.attendanceEditRequest.create({
        data: {
          attendanceId: candidate.id,
          employeeId: member.id,
          requestedInTime: candidate.inTime,
          requestedOutTime: correctedOut,
          requestedStatus: 'PRESENT',
          reason: pick([
            'Biometric device was down when I left; security can confirm.',
            'Was at the client site until late and could not punch out.',
            'Access card failed on the way out of the building.',
          ]),
          status: 'PENDING',
          approverId: manager.id,
          createdAt: addDays(TODAY, -randInt(0, 2)),
        },
      });
      await prisma.attendance.update({
        where: { id: candidate.id },
        data: {
          sendEditRequest: true,
          editReason: 'Missing / incorrect out-punch',
          sendingDate: addDays(TODAY, -1),
        },
      });
      createdEdits += 1;
    }
  }
  log('pending attendance corrections', existingEdits + createdEdits);

  // ── 4. pending overtime & comp-off ─────────────────────────────────
  const existingOt = await prisma.overtimeRequest.count({
    where: { approverId: manager.id, status: 'PENDING' },
  });
  let createdOt = 0;
  if (existingOt < 3) {
    for (const member of pickN(team, Math.min(3 - existingOt, team.length))) {
      const date = addDays(TODAY, -randInt(1, 5));
      const clash = await prisma.overtimeRequest.findFirst({
        where: { employeeId: member.id, date },
      });
      if (clash) continue;
      const hours = round2(randInt(2, 4) + (chance(50) ? 0.5 : 0));
      await prisma.overtimeRequest.create({
        data: {
          employeeId: member.id,
          date,
          fromTime: '19:00',
          toTime: `${String(19 + Math.floor(hours)).padStart(2, '0')}:${hours % 1 ? '30' : '00'}`,
          hours,
          reason: pick([
            'Production release window ran past the scheduled slot.',
            'Urgent customer escalation after hours.',
            'Month-end reconciliation with Finance.',
          ]),
          status: 'PENDING',
          approverId: manager.id,
          createdAt: addDays(date, -1),
        },
      });
      createdOt += 1;
    }
  }
  log('pending overtime requests', existingOt + createdOt);

  const existingComp = await prisma.compensationRequest.count({
    where: { approverId: manager.id, status: 'PENDING' },
  });
  let createdComp = 0;
  if (existingComp < 2) {
    for (const member of pickN(team, Math.min(2 - existingComp, team.length))) {
      // Find a weekend the member actually worked and has not yet
      // claimed, or promote a rostered weekend into a worked one.
      const alreadyClaimed = await prisma.compensationRequest.findMany({
        where: { employeeId: member.id },
        select: { workedDate: true },
      });
      let worked = await prisma.attendance.findFirst({
        where: {
          employeeId: member.id,
          compensationLeaveApplicable: true,
          date: {
            gte: addDays(TODAY, -45),
            notIn: alreadyClaimed.map((claim) => claim.workedDate),
          },
        },
        orderBy: { date: 'desc' },
      });

      if (!worked) {
        const weekend = await prisma.attendance.findFirst({
          where: {
            employeeId: member.id,
            status: 'WEEKEND',
            date: { gte: addDays(TODAY, -30), lte: addDays(TODAY, -3) },
          },
          orderBy: { date: 'desc' },
        });
        if (!weekend) continue;
        // Mark it as genuinely worked so the claim is legitimate.
        worked = await prisma.attendance.update({
          where: { id: weekend.id },
          data: {
            status: 'PRESENT',
            inTime: atTime(weekend.date, '10:00', randInt(0, 20)),
            outTime: atTime(weekend.date, '17:30', randInt(0, 40)),
            totalWorkMinutes: 390,
            compensationLeaveApplicable: true,
            attendanceAdditionalInfo: { workedOn: 'weekend' },
          },
        });
      }

      const already = await prisma.compensationRequest.findFirst({
        where: { employeeId: member.id, workedDate: worked.date },
      });
      if (already) continue;

      await prisma.compensationRequest.create({
        data: {
          employeeId: member.id,
          workedDate: worked.date,
          requestedOffDate: addDays(TODAY, randInt(10, 30)),
          reason: 'Worked the full weekend shift to clear the release backlog.',
          status: 'PENDING',
          approverId: manager.id,
          expiresAt: addDays(worked.date, 90),
          createdAt: addDays(TODAY, -randInt(0, 3)),
        },
      });
      createdComp += 1;
    }
  }
  log('pending compensatory-off claims', existingComp + createdComp);

  // ── 5. manager's own goals, so the PMS page is not empty ───────────
  const activeCycle = await prisma.goalCycle.findFirst({
    where: { companyId: org.primaryCompanyId, isActive: true },
  });
  if (activeCycle) {
    for (const employeeId of [manager.id, ...team.map((t) => t.id)]) {
      await prisma.goalCycleMember.upsert({
        where: { goalCycleId_employeeId: { goalCycleId: activeCycle.id, employeeId } },
        create: { goalCycleId: activeCycle.id, employeeId },
        update: {},
      });
    }

    const managerGoals = await prisma.goal.count({
      where: { employeeId: manager.id, goalCycleId: activeCycle.id },
    });
    if (managerGoals === 0) {
      const GOALS = [
        { title: 'Ship the warehouse stock-sync service', metric: 'delivery', target: 'live by Q4', weight: 40, progress: 55 },
        { title: 'Cut p95 API latency on the order path', metric: 'p95 latency', target: '< 400 ms', weight: 35, progress: 70 },
        { title: 'Raise automated test coverage on billing', metric: 'line coverage', target: '>= 80%', weight: 25, progress: 30 },
      ];
      for (const goal of GOALS) {
        await prisma.goal.create({
          data: {
            goalCycleId: activeCycle.id,
            employeeId: manager.id,
            title: goal.title,
            description: `${goal.title}. Measured on ${goal.metric}; target ${goal.target}.`,
            metric: goal.metric,
            target: goal.target,
            weight: goal.weight,
            progressPct: goal.progress,
            status: 'ACTIVE',
            dueDate: activeCycle.endDate,
          },
        });
      }
      log('created goals for the manager account', GOALS.length);
    }
  }

  // ── 6. HR: profile change requests + a resignation awaiting HR ─────
  const pendingChanges = await prisma.profileChangeRequest.count({ where: { status: 'PENDING' } });
  log('pending profile change requests (HR inbox)', pendingChanges);

  const hrResignation = await prisma.resignation.findFirst({
    where: { stage: 'HR_APPROVAL', approvals: { some: { approverId: hrAdmin.id, status: 'PENDING' } } },
  });
  if (!hrResignation) {
    // Advance one resignation to the HR step so the HR queue is populated.
    const candidate = await prisma.resignation.findFirst({
      where: { stage: 'LM_APPROVAL' },
      include: { approvals: { orderBy: { seq: 'asc' } } },
    });
    if (candidate) {
      const lmApproval = candidate.approvals.find((a) => a.role === 'LINE_MANAGER');
      if (lmApproval) {
        await prisma.resignationApproval.update({
          where: { id: lmApproval.id },
          data: {
            status: 'APPROVED',
            comment: 'Approved. Handover plan agreed with the team.',
            decidedAt: addDays(TODAY, -2),
          },
        });
      }
      const hrApproval = candidate.approvals.find((a) => a.role === 'HR');
      if (hrApproval) {
        await prisma.resignationApproval.update({
          where: { id: hrApproval.id },
          data: { approverId: hrAdmin.id, status: 'PENDING' },
        });
      }
      await prisma.resignation.update({
        where: { id: candidate.id },
        data: { stage: 'HR_APPROVAL' },
      });
      log('advanced a resignation to HR approval', `resignation #${candidate.id}`);
    }
  }

  // ── 7. clearance lines owned by HR and IT ──────────────────────────
  const itAdmin = org.employees.find((e) => e.username === 'admin');
  const unownedClearances = await prisma.clearanceItem.findMany({
    where: { status: 'PENDING', ownerId: null },
    include: { department: { select: { name: true } } },
    take: 20,
  });
  for (const item of unownedClearances) {
    const ownerId = item.department.name.startsWith('IT')
      ? itAdmin?.id ?? hrAdmin.id
      : hrAdmin.id;
    await prisma.clearanceItem.update({ where: { id: item.id }, data: { ownerId } });
  }
  const hrClearances = await prisma.clearanceItem.count({
    where: { status: 'PENDING', ownerId: hrAdmin.id },
  });
  log('clearance lines awaiting HR', hrClearances);

  // ── 8. summary of what each demo login will actually see ───────────
  const summaries: { username: string; label: string; pending: number }[] = [];
  for (const account of [manager, hrAdmin, itAdmin].filter(Boolean)) {
    const employee = account!;
    const [leaveCount, editCount, otCount, compCount, resignCount, clearCount] = await Promise.all([
      prisma.leaveRequest.count({ where: { approverId: employee.id, status: 'PENDING' } }),
      prisma.attendanceEditRequest.count({ where: { approverId: employee.id, status: 'PENDING' } }),
      prisma.overtimeRequest.count({ where: { approverId: employee.id, status: 'PENDING' } }),
      prisma.compensationRequest.count({ where: { approverId: employee.id, status: 'PENDING' } }),
      prisma.resignationApproval.count({ where: { approverId: employee.id, status: 'PENDING' } }),
      prisma.clearanceItem.count({ where: { ownerId: employee.id, status: 'PENDING' } }),
    ]);
    summaries.push({
      username: employee.username,
      label: `leave ${leaveCount} · attendance ${editCount} · overtime ${otCount} · comp-off ${compCount} · resignation ${resignCount} · clearance ${clearCount}`,
      pending: leaveCount + editCount + otCount + compCount + resignCount + clearCount,
    });
  }
  for (const summary of summaries) {
    log(`approval inbox — ${summary.username}`, summary.label);
  }
}
