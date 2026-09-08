import { evaluatePunch, hhmmToMinutes } from '@kormo/shared';

import type { CalendarResult } from './calendar';
import { WINDOW_START } from './calendar';
import type { LeaveResult } from './leave';
import type { OrgResult } from './org';
import {
  TODAY, addDays, atTime, chance, eachDay, iso, log, pick, prisma, randInt,
  round2, section,
} from './lib';

export interface AttendanceResult {
  /** employeeId → per-month present/absent/late tallies, reused by payroll. */
  monthlyStats: Map<string, Map<string, { present: number; late: number; absent: number; leave: number; working: number; otMinutes: number }>>;
}

export async function seedAttendance(
  org: OrgResult,
  calendar: CalendarResult,
  leave: LeaveResult,
): Promise<AttendanceResult> {
  section('Attendance history');

  const shiftById = new Map(calendar.shifts.map((s) => [s.id, s]));
  const monthlyStats = new Map<string, Map<string, { present: number; late: number; absent: number; leave: number; working: number; otMinutes: number }>>();

  const attendanceRows: any[] = [];
  const days = eachDay(WINDOW_START, TODAY);

  /** Days an employee actually worked a weekend/holiday → comp-off claims. */
  const compEligible = new Map<string, string[]>();
  /** Days with a broken punch → edit-request candidates. */
  const brokenPunch = new Map<string, { date: Date; inTime: Date | null; outTime: Date | null; shiftName: string }[]>();

  for (const emp of org.employees) {
    const empKey = String(emp.id);
    const roster = calendar.rosterByEmployee.get(empKey);
    if (!roster) continue;
    const approvedLeave = leave.approvedByEmployee.get(empKey) ?? new Map();
    const perMonth = new Map<string, { present: number; late: number; absent: number; leave: number; working: number; otMinutes: number }>();

    // Each employee gets a stable "reliability" so the data reads like
    // people rather than uniform noise: some are habitually punctual,
    // a few are habitually late.
    const punctuality = randInt(60, 99);
    const absenteeism = randInt(0, 6);

    for (const day of days) {
      if (day < emp.joiningDate) continue;
      const key = iso(day);
      const assignment = roster.get(key);
      if (!assignment || assignment.shiftId === null) continue;

      const shift = shiftById.get(assignment.shiftId)!;
      const monthKey = key.slice(0, 7);
      const stats = perMonth.get(monthKey) ?? { present: 0, late: 0, absent: 0, leave: 0, working: 0, otMinutes: 0 };

      const holidayName = calendar.holidayMap.get(key);
      const leaveOnDay = approvedLeave.get(key);

      const base = {
        employeeId: emp.id,
        employeeVisibleId: emp.visibleId,
        companyId: emp.companyId,
        locationId: emp.locationId,
        date: day,
        attendanceRosterShiftName: shift.name,
        attendanceRosterStartTime: shift.startTime,
        attendanceRosterEndTime: shift.endTime,
        attendanceRosterLateTime: shift.startTime,
      };

      // ── non-working days ───────────────────────────────────────────
      if (holidayName) {
        // A skeleton crew works some holidays and earns a comp-off.
        const worked = chance(4);
        if (worked) {
          const inAt = atTime(day, shift.startTime, randInt(-10, 25));
          const outAt = atTime(day, shift.endTime, randInt(-20, 60));
          const punch = evaluatePunch({
            inMinutes: hhmmToMinutes(shift.startTime) + randInt(-10, 25),
            outMinutes: hhmmToMinutes(shift.endTime) + randInt(-20, 60),
            shiftStartMinutes: hhmmToMinutes(shift.startTime),
            shiftEndMinutes: hhmmToMinutes(shift.endTime),
            graceMinutes: shift.graceMinutes,
            breakMinutes: shift.breakMinutes,
            isNightShift: shift.isNightShift,
          });
          attendanceRows.push({
            ...base, inTime: inAt, outTime: outAt, status: 'PRESENT',
            lateTimeMinutes: 0, breakTimeMinutes: shift.breakMinutes,
            totalWorkMinutes: punch.workMinutes,
            otTimeInSeconds: punch.overtimeMinutes * 60,
            compensationLeaveApplicable: true,
            attendanceAdditionalInfo: { workedOn: 'holiday', holidayName },
          });
          compEligible.set(empKey, [...(compEligible.get(empKey) ?? []), key]);
        } else {
          attendanceRows.push({
            ...base, inTime: null, outTime: null, status: 'HOLIDAY',
            attendanceAdditionalInfo: { holidayName },
          });
        }
        perMonth.set(monthKey, stats);
        continue;
      }

      if (assignment.isWeekend) {
        const worked = chance(6);
        if (worked) {
          const punch = evaluatePunch({
            inMinutes: hhmmToMinutes(shift.startTime) + randInt(-5, 30),
            outMinutes: hhmmToMinutes(shift.endTime) + randInt(-30, 90),
            shiftStartMinutes: hhmmToMinutes(shift.startTime),
            shiftEndMinutes: hhmmToMinutes(shift.endTime),
            graceMinutes: shift.graceMinutes,
            breakMinutes: shift.breakMinutes,
            isNightShift: shift.isNightShift,
          });
          attendanceRows.push({
            ...base,
            inTime: atTime(day, shift.startTime, randInt(-5, 30)),
            outTime: atTime(day, shift.endTime, randInt(-30, 90)),
            status: 'PRESENT',
            lateTimeMinutes: 0,
            breakTimeMinutes: shift.breakMinutes,
            totalWorkMinutes: punch.workMinutes,
            otTimeInSeconds: punch.overtimeMinutes * 60,
            compensationLeaveApplicable: true,
            attendanceAdditionalInfo: { workedOn: 'weekend' },
          });
          compEligible.set(empKey, [...(compEligible.get(empKey) ?? []), key]);
        } else {
          attendanceRows.push({
            ...base, inTime: null, outTime: null,
            status: assignment.isConditionalWeekend ? 'CONDITIONAL_WEEKEND' : 'WEEKEND',
          });
        }
        perMonth.set(monthKey, stats);
        continue;
      }

      if (leaveOnDay) {
        stats.leave += 1;
        stats.working += 1;
        attendanceRows.push({
          ...base,
          inTime: null,
          outTime: null,
          status: leaveOnDay.isHalfDay ? 'HALF_DAY' : 'LEAVE',
          attendanceAdditionalInfo: { leaveTypeId: leaveOnDay.leaveTypeId },
        });
        perMonth.set(monthKey, stats);
        continue;
      }

      // ── working day ────────────────────────────────────────────────
      stats.working += 1;

      // Unapproved absence. AFL = absent and charged against leave.
      if (chance(absenteeism)) {
        const isAfl = chance(45);
        stats.absent += 1;
        attendanceRows.push({
          ...base, inTime: null, outTime: null, status: isAfl ? 'AFL' : 'ABSENT',
        });
        perMonth.set(monthKey, stats);
        continue;
      }

      const shiftStart = hhmmToMinutes(shift.startTime);
      const shiftEnd = hhmmToMinutes(shift.endTime);

      // Punctual people cluster just before the shift; the rest drift late.
      const inOffset = chance(punctuality)
        ? randInt(-25, shift.graceMinutes)
        : randInt(shift.graceMinutes + 1, 95);
      // Warehouse/field staff rack up more overtime than office staff.
      const outOffset = randInt(-15, shift.name === 'General' ? 75 : 150);

      const inMinutes = shiftStart + inOffset;
      let outMinutes: number | null = shiftEnd + outOffset;

      // ~1.2% of days have a missing out-punch (badge reader miss / forgot
      // to tap out) — these are what the edit-request workflow exists for.
      const forgotOutPunch = chance(1.2);
      if (forgotOutPunch) outMinutes = null;

      const punch = evaluatePunch({
        inMinutes,
        outMinutes,
        shiftStartMinutes: shiftStart,
        shiftEndMinutes: shiftEnd,
        graceMinutes: shift.graceMinutes,
        breakMinutes: shift.breakMinutes,
        isNightShift: shift.isNightShift,
      });

      const isLate = punch.lateMinutes > 0;
      if (isLate) stats.late += 1;
      else stats.present += 1;
      stats.otMinutes += punch.overtimeMinutes;

      const inAt = atTime(day, shift.startTime, inOffset);
      const outAt = outMinutes === null ? null : atTime(day, shift.endTime, outOffset);
      const breakMinutes = outMinutes === null ? 0 : shift.breakMinutes + randInt(-10, 20);

      attendanceRows.push({
        ...base,
        inTime: inAt,
        outTime: outAt,
        status: isLate ? 'LATE' : 'PRESENT',
        lateTimeMinutes: punch.lateMinutes,
        breakTimeMinutes: Math.max(0, breakMinutes),
        totalWorkMinutes: punch.workMinutes,
        otTimeInSeconds: punch.overtimeMinutes * 60,
        extraOtTimeInSeconds: punch.overtimeMinutes > 120 ? (punch.overtimeMinutes - 120) * 60 : 0,
        sendEditRequest: false,
      });

      if (forgotOutPunch) {
        brokenPunch.set(empKey, [
          ...(brokenPunch.get(empKey) ?? []),
          { date: day, inTime: inAt, outTime: null, shiftName: shift.name },
        ]);
      }

      perMonth.set(monthKey, stats);
    }
    monthlyStats.set(empKey, perMonth);
  }

  for (let i = 0; i < attendanceRows.length; i += 5_000) {
    await prisma.attendance.createMany({ data: attendanceRows.slice(i, i + 5_000) });
  }
  const statusMix = attendanceRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  log('created attendance rows', `${attendanceRows.length} (${iso(WINDOW_START)} → ${iso(TODAY)})`);
  log('status mix', Object.entries(statusMix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));

  // ── break time detail ──────────────────────────────────────────────
  // Only the most recent month, to keep the table representative but small.
  const recentAttendance = await prisma.attendance.findMany({
    where: {
      date: { gte: addDays(TODAY, -30) },
      status: { in: ['PRESENT', 'LATE'] },
      inTime: { not: null },
      outTime: { not: null },
    },
    select: { id: true, date: true, inTime: true, breakTimeMinutes: true },
    take: 3_000,
  });
  const breakRows = recentAttendance
    .filter(() => chance(70))
    .map((a) => {
      // Lunch starts ~3h after clock-in.
      const start = new Date(a.inTime!.getTime() + (170 + randInt(-30, 45)) * 60_000);
      return {
        attendanceId: a.id,
        startAt: start,
        endAt: new Date(start.getTime() + Math.max(15, a.breakTimeMinutes) * 60_000),
        reason: chance(15) ? pick(['Lunch', 'Prayer break', 'Tea break']) : 'Lunch',
      };
    });
  await prisma.breakTime.createMany({ data: breakRows });
  log('created break-time records', breakRows.length);

  // ── attendance edit requests ───────────────────────────────────────
  const editRows: any[] = [];
  const attendanceUpdates: { id: bigint; data: any }[] = [];

  for (const [empKey, broken] of brokenPunch) {
    const emp = org.employees.find((e) => String(e.id) === empKey)!;
    // Not everyone chases a missing punch; roughly two thirds do.
    for (const item of broken.filter(() => chance(65))) {
      const row = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: emp.id, date: item.date } },
        select: { id: true },
      });
      if (!row) continue;

      const isFuture = item.date > addDays(TODAY, -3);
      const status = isFuture ? 'PENDING' : chance(80) ? 'APPROVED' : 'REJECTED';
      const requestedOut = atTime(item.date, '19:00', randInt(-15, 60));
      const sendingDate = addDays(item.date, randInt(1, 3));
      const decidedAt = status === 'PENDING' ? null : addDays(sendingDate, randInt(0, 2));

      editRows.push({
        attendanceId: row.id,
        employeeId: emp.id,
        requestedInTime: item.inTime,
        requestedOutTime: requestedOut,
        requestedStatus: 'PRESENT',
        reason: pick([
          'Forgot to tap out at the gate; left at the usual time.',
          'Access card failed on the way out — security log can confirm.',
          'Was in a client meeting off-site and could not punch out.',
          'Biometric device was down in the evening.',
        ]),
        status,
        approverId: emp.lineManagerId,
        decisionNote: status === 'REJECTED' ? 'No supporting record from security; please raise with admin.' : null,
        createdAt: sendingDate,
        decidedAt,
      });

      // Mirror the request onto the attendance row's inline sub-state.
      attendanceUpdates.push({
        id: row.id,
        data: {
          sendEditRequest: true,
          editReason: 'Missing out-punch',
          sendingDate,
          isOutTimeEdited: status === 'APPROVED',
          isEdited: status === 'APPROVED',
          updatedOutTime: status === 'APPROVED' ? requestedOut : null,
          updatedStatus: status === 'APPROVED' ? 'PRESENT' : null,
          isAcceptedByLm: status === 'APPROVED',
          isRejectedByLm: status === 'REJECTED',
          acceptedDate: status === 'APPROVED' ? decidedAt : null,
          rejectedDate: status === 'REJECTED' ? decidedAt : null,
          // Once approved, the corrected out-time becomes the effective one.
          ...(status === 'APPROVED' ? { outTime: requestedOut } : {}),
        },
      });
    }
  }
  await prisma.attendanceEditRequest.createMany({ data: editRows });
  for (const update of attendanceUpdates) {
    await prisma.attendance.update({ where: { id: update.id }, data: update.data });
  }
  log('created attendance edit requests', `${editRows.length} (${editRows.filter((r) => r.status === 'PENDING').length} pending)`);

  // ── overtime requests ──────────────────────────────────────────────
  const otRows: any[] = [];
  const otCandidates = org.employees.filter((e) => e.level <= 4);
  for (const emp of otCandidates) {
    for (let i = 0; i < randInt(0, 4); i++) {
      const date = addDays(TODAY, -randInt(1, 120));
      if (date < emp.joiningDate) continue;
      const hours = round2(randInt(1, 4) + (chance(50) ? 0.5 : 0));
      const isRecent = date > addDays(TODAY, -7);
      otRows.push({
        employeeId: emp.id,
        date,
        fromTime: '19:00',
        toTime: `${String(19 + Math.floor(hours)).padStart(2, '0')}:${hours % 1 ? '30' : '00'}`,
        hours,
        reason: pick([
          'Month-end stock reconciliation.',
          'Production release window after hours.',
          'Urgent client escalation handling.',
          'Dispatch backlog clearance before the holiday.',
          'Year-end audit support for Finance.',
        ]),
        status: isRecent ? 'PENDING' : chance(82) ? 'APPROVED' : 'REJECTED',
        approverId: emp.lineManagerId,
        createdAt: addDays(date, -1),
        decidedAt: isRecent ? null : addDays(date, randInt(1, 3)),
      });
    }
  }
  await prisma.overtimeRequest.createMany({ data: otRows });
  log('created overtime requests', `${otRows.length} (${otRows.filter((r) => r.status === 'PENDING').length} pending)`);

  // ── compensation (comp-off) requests ───────────────────────────────
  const compRows: any[] = [];
  for (const [empKey, dates] of compEligible) {
    const emp = org.employees.find((e) => String(e.id) === empKey)!;
    for (const workedIso of dates.filter(() => chance(70))) {
      const workedDate = new Date(`${workedIso}T12:00:00Z`);
      const isRecent = workedDate > addDays(TODAY, -10);
      const status = isRecent ? 'PENDING' : chance(85) ? 'APPROVED' : 'REJECTED';
      compRows.push({
        employeeId: emp.id,
        workedDate,
        requestedOffDate: chance(70) ? addDays(workedDate, randInt(7, 45)) : null,
        days: 1,
        reason: pick([
          'Worked the full shift on the weekend for the release.',
          'On-site during the Eid holiday for warehouse dispatch.',
          'Covered the holiday shift at the customer\'s request.',
        ]),
        status,
        approverId: emp.lineManagerId,
        expiresAt: addDays(workedDate, 90),
        createdAt: addDays(workedDate, randInt(1, 5)),
        decidedAt: status === 'PENDING' ? null : addDays(workedDate, randInt(2, 8)),
      });
    }
  }
  await prisma.compensationRequest.createMany({ data: compRows });
  log('created compensation requests', `${compRows.length} (${compRows.filter((r) => r.status === 'PENDING').length} pending)`);

  // Approved comp-offs top up the comp_off leave balance.
  const compOffType = leave.leaveTypes.find((t) => t.key === 'comp_off' && t.companyId === org.primaryCompanyId);
  if (compOffType) {
    const approvedByEmp = new Map<string, number>();
    for (const row of compRows.filter((r) => r.status === 'APPROVED')) {
      const k = String(row.employeeId);
      approvedByEmp.set(k, (approvedByEmp.get(k) ?? 0) + 1);
    }
    for (const [empId, count] of approvedByEmp) {
      await prisma.leaveBalance.updateMany({
        where: { employeeId: BigInt(empId), leaveTypeId: compOffType.id, year: TODAY.getUTCFullYear() },
        data: {
          actualLeaveCount: { increment: count },
          remainingLeaveCount: { increment: count },
        },
      });
    }
    log('credited comp-off balances', `${approvedByEmp.size} employees`);
  }

  // ── shift exchange requests (rotating-shift staff only) ────────────
  const warehouseLocation = org.locations.find((l) => l.alias === 'WH-TEJGAON');
  const swappable = org.employees.filter((e) => e.locationId === warehouseLocation?.id);
  const sxRows: any[] = [];
  if (swappable.length >= 2) {
    for (let i = 0; i < Math.min(14, swappable.length * 2); i++) {
      const requester = pick(swappable);
      const counterparty = pick(swappable.filter((e) => e.id !== requester.id));
      if (!counterparty) continue;
      const date = addDays(TODAY, randInt(-40, 20));
      const isFuture = date > TODAY;
      const shifts = calendar.shifts.filter((s) => s.companyId === requester.companyId && ['Morning', 'Evening', 'Night'].includes(s.name));
      sxRows.push({
        requesterId: requester.id,
        counterpartyId: counterparty.id,
        date,
        counterpartyDate: addDays(date, randInt(1, 5)),
        fromShiftId: pick(shifts).id,
        toShiftId: pick(shifts).id,
        reason: pick([
          'Family commitment — need the morning shift that day.',
          'Medical appointment during my usual shift.',
          'Swapping so we can both attend the training session.',
        ]),
        status: isFuture ? 'PENDING' : chance(75) ? 'APPROVED' : 'REJECTED',
        counterpartyAccepted: !isFuture || chance(60),
        approverId: requester.lineManagerId,
        createdAt: addDays(date, -randInt(2, 10)),
        decidedAt: isFuture ? null : addDays(date, -1),
      });
    }
  }
  await prisma.shiftExchangeRequest.createMany({ data: sxRows });
  log('created shift exchange requests', `${sxRows.length} (${sxRows.filter((r) => r.status === 'PENDING').length} pending)`);

  return { monthlyStats };
}
