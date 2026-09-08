import { BD_WEEKEND_DAYS } from '@kormo/shared';
import type { Shift } from '@prisma/client';

import type { OrgResult } from './org';
import {
  TODAY, addDays, chance, d, eachDay, endOfMonth, iso, isWeekendBd, log, pick,
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

// ── Bangladesh public holiday calendar ────────────────────────────────
// Islamic dates are lunar and confirmed only days ahead by the government;
// these are the conventional gazetted spans for each year.
const HOLIDAYS: Record<number, { name: string; start: string; end?: string; description?: string; religion?: string; optional?: boolean }[]> = {
  2025: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2025-02-21' },
    { name: 'Independence & National Day', start: '2025-03-26' },
    { name: 'Eid-ul-Fitr', start: '2025-03-28', end: '2025-04-01', religion: 'Islam', description: 'Eid holiday including Shab-e-Qadr and pre/post Eid days' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2025-04-14' },
    { name: 'May Day', start: '2025-05-01' },
    { name: 'Eid-ul-Azha', start: '2025-06-05', end: '2025-06-10', religion: 'Islam' },
    { name: 'Ashura', start: '2025-07-06', religion: 'Islam' },
    { name: 'Janmashtami', start: '2025-08-16', religion: 'Hinduism' },
    { name: 'Eid-e-Miladunnabi', start: '2025-09-05', religion: 'Islam' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2025-10-01', end: '2025-10-02', religion: 'Hinduism' },
    { name: 'Victory Day', start: '2025-12-16' },
    { name: 'Christmas Day', start: '2025-12-25', religion: 'Christianity' },
  ],
  2026: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2026-02-21' },
    { name: 'Eid-ul-Fitr', start: '2026-03-17', end: '2026-03-21', religion: 'Islam', description: 'Eid holiday including pre/post Eid days' },
    { name: 'Independence & National Day', start: '2026-03-26' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2026-04-14' },
    { name: 'May Day', start: '2026-05-01' },
    { name: 'Eid-ul-Azha', start: '2026-05-26', end: '2026-05-30', religion: 'Islam' },
    { name: 'Ashura', start: '2026-06-25', religion: 'Islam' },
    { name: 'Eid-e-Miladunnabi', start: '2026-08-25', religion: 'Islam' },
    { name: 'Janmashtami', start: '2026-09-04', religion: 'Hinduism' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2026-10-20', end: '2026-10-21', religion: 'Hinduism' },
    { name: 'Buddha Purnima', start: '2026-05-11', religion: 'Buddhism', optional: true },
    { name: 'Victory Day', start: '2026-12-16' },
    { name: 'Christmas Day', start: '2026-12-25', religion: 'Christianity' },
  ],
  2027: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2027-02-21' },
    { name: 'Eid-ul-Fitr', start: '2027-03-07', end: '2027-03-11', religion: 'Islam' },
    { name: 'Independence & National Day', start: '2027-03-26' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2027-04-14' },
    { name: 'May Day', start: '2027-05-01' },
    { name: 'Eid-ul-Azha', start: '2027-05-16', end: '2027-05-20', religion: 'Islam' },
    { name: 'Ashura', start: '2027-06-15', religion: 'Islam' },
    { name: 'Eid-e-Miladunnabi', start: '2027-08-14', religion: 'Islam' },
    { name: 'Janmashtami', start: '2027-08-25', religion: 'Hinduism' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2027-10-09', religion: 'Hinduism' },
    { name: 'Victory Day', start: '2027-12-16' },
    { name: 'Christmas Day', start: '2027-12-25', religion: 'Christianity' },
  ],
};

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
        name: 'Office — Sun to Thu',
        rotationPattern: { weekends: BD_WEEKEND_DAYS, cycle: ['General'] },
      },
    });
    await prisma.attendanceRoster.create({
      data: {
        companyId: company.id,
        name: 'Warehouse — rotating 3 shift',
        rotationPattern: { weekends: [5], cycle: ['Morning', 'Evening', 'Night'], rotateEveryDays: 7 },
      },
    });
    await prisma.attendanceRoster.create({
      data: {
        companyId: company.id,
        name: 'Field Force — 6 day',
        rotationPattern: { weekends: [5], cycle: ['Field'] },
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
  log('created holidays', `${holidayCount} rows across 2025-2027`);

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
    const isWarehouse = emp.locationId === org.locations.find((l) => l.alias === 'WH-TEJGAON')?.id;
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
        isWeekend = dow === 5; // single day off
      } else if (isField) {
        shiftId = field.id;
        isWeekend = dow === 5;
      } else {
        shiftId = general.id;
        isWeekend = BD_WEEKEND_DAYS.includes(dow);
      }

      // A few Saturdays are "conditional" weekends — worked if the month's
      // targets slipped. Exercises the CONDITIONAL_WEEKEND status.
      const isConditionalWeekend = !isWarehouse && !isField && dow === 6 && day.getUTCDate() <= 7;

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
