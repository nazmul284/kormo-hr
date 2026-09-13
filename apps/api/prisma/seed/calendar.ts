import type { Shift } from '@prisma/client';

import type { OrgResult } from './org';
import {
  PACK, TODAY, addDays, chance, d, eachDay, endOfMonth, iso, isWeekend, log, pick,
  prisma, randInt, section, startOfMonth,
} from './lib';

/**
 * The attendance/roster window. Eight-plus months of history gives the
 * monthly grids, the payroll register and the FY-to-date tax ledger
 * something real to read, without ballooning the seed.
 */
export const WINDOW_START = d(`${TODAY.getUTCFullYear()}-01-01`);
export const WINDOW_END = TODAY;
/** Rosters run ahead of today so the shift calendar has future months. */
export const ROSTER_END = endOfMonth(addDays(TODAY, 55));

export interface CalendarResult {
  shifts: { id: number; name: string; startTime: string; endTime: string; graceMinutes: number; breakMinutes: number; isNightShift: boolean; companyId: number }[];
  rosterIdByCompany: Map<number, number>;
  /** date ISO → holiday name, for the primary company. */
  holidayMap: Map<string, string>;
  /** employeeId → (date ISO → { shiftId, isWeekend }) */
  rosterByEmployee: Map<string, Map<string, { shiftId: number | null; isWeekend: boolean; isConditionalWeekend: boolean }>>;
}

/**
 * Public holidays come from the tenant's country pack, which ships a
 * table per calendar year. Only the years the seed window actually
 * touches are written, so switching SEED_TODAY does not silently import
 * a decade of holidays nobody will look at.
 */
const HOLIDAYS = PACK.holidays;

/** The weekend, and the single day off for six-day patterns. */
const WEEKEND_DAYS = PACK.weekendDays;
const SINGLE_OFF_DAY = WEEKEND_DAYS[0];

const SHIFT_SPEC = [
  { name: 'General', startTime: '10:00', endTime: '19:00', graceMinutes: 15, breakMinutes: 60, isNightShift: false, colorHex: '#4F46E5' },
  { name: 'Morning', startTime: '06:00', endTime: '14:00', graceMinutes: 10, breakMinutes: 45, isNightShift: false, colorHex: '#0EA5E9' },
  { name: 'Evening', startTime: '14:00', endTime: '22:00', graceMinutes: 10, breakMinutes: 45, isNightShift: false, colorHex: '#F59E0B' },
  { name: 'Night', startTime: '22:00', endTime: '06:00', graceMinutes: 10, breakMinutes: 60, isNightShift: true, colorHex: '#7C3AED' },
  { name: 'Field', startTime: '09:00', endTime: '18:00', graceMinutes: 30, breakMinutes: 60, isNightShift: false, colorHex: '#14B8A6' },
];

export async function seedCalendar(org: OrgResult): Promise<CalendarResult> {
  section('Shifts, rosters & holidays');

  // ── shifts ─────────────────────────────────────────────────────────
  const shifts: Shift[] = [];
  for (const company of org.companies) {
    for (const spec of SHIFT_SPEC) {
      shifts.push(
        await prisma.shift.create({
          data: {
            ...spec,
            companyId: company.id,
            fullDayMinutes: 480,
            halfDayMinutes: 240,
          },
        }),
      );
    }
  }
  log('created shifts', `${SHIFT_SPEC.length} x ${org.companies.length} tenants`);

  // ── rosters ────────────────────────────────────────────────────────
  const rosterIdByCompany = new Map<number, number>();
  for (const company of org.companies) {
    const officeRoster = await prisma.attendanceRoster.create({
      data: {
        companyId: company.id,
        name: `Office — ${PACK.workWeekLabel}`,
        rotationPattern: { weekends: WEEKEND_DAYS, cycle: ['General'] },
      },
    });
    await prisma.attendanceRoster.create({
      data: {
        companyId: company.id,
        name: 'Warehouse — rotating 3 shift',
        rotationPattern: { weekends: [SINGLE_OFF_DAY], cycle: ['Morning', 'Evening', 'Night'], rotateEveryDays: 7 },
      },
    });
    await prisma.attendanceRoster.create({
      data: {
        companyId: company.id,
        name: 'Field Force — 6 day',
        rotationPattern: { weekends: [SINGLE_OFF_DAY], cycle: ['Field'] },
      },
    });
    rosterIdByCompany.set(company.id, officeRoster.id);
  }
  log('created attendance rosters', '3 patterns per tenant');

  // ── holidays ───────────────────────────────────────────────────────
  const holidayMap = new Map<string, string>();
  let holidayCount = 0;
  for (const [yearStr, list] of Object.entries(HOLIDAYS)) {
    const year = Number(yearStr);
    for (const h of list) {
      const start = d(h.start);
      const end = d(h.end ?? h.start);
      const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      for (const company of org.companies) {
        await prisma.holiday.create({
          data: {
            companyId: company.id,
            name: h.name,
            startDate: start,
            endDate: end,
            duration,
            description: h.description ?? null,
            year,
            isOptional: h.optional ?? false,
            religion: h.religion ?? null,
          },
        });
        holidayCount += 1;
      }
      // Only mandatory holidays for the primary tenant drive attendance.
      if (!h.optional) {
        for (const day of eachDay(start, end)) holidayMap.set(iso(day), h.name);
      }
    }
  }
  log('created holidays', `${holidayCount} rows — ${PACK.name} calendar`);

  // ── roster assignments ─────────────────────────────────────────────
  // One row per employee per day: which shift, and whether it is an off day.
  const rosterByEmployee = new Map<string, Map<string, { shiftId: number | null; isWeekend: boolean; isConditionalWeekend: boolean }>>();
  const shiftsByCompany = new Map<number, typeof shifts>();
  for (const s of shifts) {
    const list = shiftsByCompany.get(s.companyId) ?? [];
    list.push(s);
    shiftsByCompany.set(s.companyId, list);
  }

  const assignmentRows: any[] = [];
  const days = eachDay(WINDOW_START, ROSTER_END);

  for (const emp of org.employees) {
    const companyShifts = shiftsByCompany.get(emp.companyId)!;
    const general = companyShifts.find((s) => s.name === 'General')!;
    const field = companyShifts.find((s) => s.name === 'Field')!;
    const rotating = companyShifts.filter((s) => ['Morning', 'Evening', 'Night'].includes(s.name));

    // Warehouse and field staff work non-office patterns.
    const isWarehouse = emp.locationId === org.locations.find((l) => l.alias === 'WH-MAIN')?.id;
    const isField = org.departments.find((x) => x.id === emp.departmentId)?.name === 'Field Force';

    const perDay = new Map<string, { shiftId: number | null; isWeekend: boolean; isConditionalWeekend: boolean }>();

    for (const day of days) {
      if (day < emp.joiningDate) continue;
      const key = iso(day);
      const dow = day.getUTCDay();

      let shiftId: number;
      let isWeekend: boolean;

      if (isWarehouse) {
        // Rotating three-shift pattern, changing every seven days.
        const weekIndex = Math.floor((day.getTime() - WINDOW_START.getTime()) / (7 * 86_400_000));
        shiftId = rotating[weekIndex % rotating.length].id;
        isWeekend = dow === SINGLE_OFF_DAY; // single day off
      } else if (isField) {
        shiftId = field.id;
        isWeekend = dow === SINGLE_OFF_DAY;
      } else {
        shiftId = general.id;
        isWeekend = WEEKEND_DAYS.includes(dow);
      }

      // A few weekend days each month are "conditional" — worked if the
      // month's targets slipped. Exercises the CONDITIONAL_WEEKEND status.
      // Always the second weekend day, so a five-day week keeps one
      // genuinely free day.
      const isConditionalWeekend =
        !isWarehouse && !isField && dow === WEEKEND_DAYS[WEEKEND_DAYS.length - 1]
        && day.getUTCDate() <= 7;

      perDay.set(key, { shiftId, isWeekend, isConditionalWeekend });
      assignmentRows.push({
        employeeId: emp.id,
        rosterId: rosterIdByCompany.get(emp.companyId)!,
        date: day,
        shiftId,
        isWeekend,
        isConditionalWeekend,
      });
    }
    rosterByEmployee.set(String(emp.id), perDay);
  }

  // Chunked to stay well inside Postgres' parameter limit.
  for (let i = 0; i < assignmentRows.length; i += 5_000) {
    await prisma.rosterAssignment.createMany({ data: assignmentRows.slice(i, i + 5_000) });
  }
  log('created roster assignments', `${assignmentRows.length} rows (${iso(WINDOW_START)} → ${iso(ROSTER_END)})`);

  return {
    shifts: shifts.map((s) => ({
      id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime,
      graceMinutes: s.graceMinutes, breakMinutes: s.breakMinutes,
      isNightShift: s.isNightShift, companyId: s.companyId,
    })),
    rosterIdByCompany,
    holidayMap,
    rosterByEmployee,
  };
}
