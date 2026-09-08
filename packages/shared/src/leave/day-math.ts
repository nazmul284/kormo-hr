/**
 * Leave day arithmetic. Deliberately pure and shared: the browser shows a
 * live "Leave Days vs Calendar Days" preview while the user is still
 * filling in the form, and the server recomputes the same numbers on
 * submit. If these two ever disagree, employees lose days — so there is
 * exactly one implementation.
 */

export type DayPart = 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';

export interface HolidaySpan {
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
}

export interface LeaveDayOptions {
  /** Weekday numbers treated as the weekend. 0=Sun … 6=Sat. Bangladesh: [5,6]. */
  weekendDays?: number[];
  /** Holiday spans that fall inside or across the requested range. */
  holidays?: HolidaySpan[];
  /**
   * When true the leave type burns weekends/holidays too (typical for
   * statutory maternity leave, which is counted in calendar days).
   */
  countsHolidays?: boolean;
  /** Half-day selection. Only meaningful for a single-day request. */
  dayPart?: DayPart;
  /** Dates the employee is contractually off, overriding the weekend rule. */
  rosterOffDates?: string[];
}

export interface LeaveDayResult {
  /** Inclusive span length, ignoring weekends and holidays. */
  calendarDays: number;
  /** Chargeable days deducted from the balance. */
  leaveDays: number;
  /** Per-day classification, for rendering the request preview. */
  days: {
    date: string;
    weekday: number;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName?: string;
    chargeable: boolean;
    charge: number;
  }[];
  weekendCount: number;
  holidayCount: number;
}

const MS_DAY = 86_400_000;

function parse(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function eachDayIso(startIso: string, endIso: string): string[] {
  const start = parse(startIso);
  const end = parse(endIso);
  if (end.getTime() < start.getTime()) return [];
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_DAY) {
    out.push(toIso(new Date(t)));
  }
  return out;
}

/** Expands holiday spans into a date → name lookup. */
export function expandHolidays(
  holidays: (HolidaySpan & { name?: string })[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holidays) {
    for (const iso of eachDayIso(h.startDate, h.endDate)) {
      map.set(iso, h.name ?? 'Holiday');
    }
  }
  return map;
}

/**
 * Computes chargeable leave days for a request.
 *
 * A half-day is only valid on a single-day request; asking for a half on
 * a multi-day range silently resolves to full days rather than charging
 * a confusing 0.5 against the last day.
 */
export function computeLeaveDays(
  startIso: string,
  endIso: string,
  options: LeaveDayOptions = {},
): LeaveDayResult {
  const weekendDays = options.weekendDays ?? [5, 6]; // Fri, Sat
  const holidayMap = expandHolidays(
    (options.holidays ?? []) as (HolidaySpan & { name?: string })[],
  );
  const rosterOff = new Set(options.rosterOffDates ?? []);
  const isoDays = eachDayIso(startIso, endIso);

  const single = isoDays.length === 1;
  const halfRequested =
    single && (options.dayPart === 'FIRST_HALF' || options.dayPart === 'SECOND_HALF');

  const days = isoDays.map((iso) => {
    const weekday = parse(iso).getUTCDay();
    const isWeekend = weekendDays.includes(weekday) || rosterOff.has(iso);
    const holidayName = holidayMap.get(iso);
    const isHoliday = holidayName !== undefined;

    const skipped = !options.countsHolidays && (isWeekend || isHoliday);
    const chargeable = !skipped;
    const charge = chargeable ? (halfRequested ? 0.5 : 1) : 0;

    return { date: iso, weekday, isWeekend, isHoliday, holidayName, chargeable, charge };
  });

  return {
    calendarDays: isoDays.length,
    leaveDays: round2(days.reduce((s, d) => s + d.charge, 0)),
    days,
    weekendCount: days.filter((d) => d.isWeekend).length,
    holidayCount: days.filter((d) => d.isHoliday).length,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pro-rates an annual entitlement for someone who joined (or left)
 * part-way through the leave year. This is what produces the fractional
 * balances users see, e.g. 8.56 of 8.56 days.
 */
export function proRateEntitlement(
  annualEntitlement: number,
  joiningDateIso: string,
  year: number,
  separationDateIso?: string | null,
): number {
  const yearStart = Date.UTC(year, 0, 1, 12);
  const yearEnd = Date.UTC(year, 11, 31, 12);
  const totalDays = Math.round((yearEnd - yearStart) / MS_DAY) + 1;

  const joined = parse(joiningDateIso).getTime();
  const left = separationDateIso ? parse(separationDateIso).getTime() : yearEnd;

  const from = Math.max(yearStart, joined);
  const to = Math.min(yearEnd, left);
  if (to < from) return 0;

  const served = Math.round((to - from) / MS_DAY) + 1;
  if (served >= totalDays) return round2(annualEntitlement);
  return round2((annualEntitlement * served) / totalDays);
}

/**
 * Bradford Factor = S² × D, where S is the number of distinct absence
 * spells and D the total days lost. It weights frequent short absences
 * far more heavily than one long one, which is the whole point: a
 * fortnight of flu scores 14, seven odd days scores 343.
 */
export function bradfordFactor(
  spells: { startDate: string; endDate: string; days?: number }[],
): { score: number; spellCount: number; totalDays: number } {
  const spellCount = spells.length;
  const totalDays = spells.reduce(
    (sum, s) => sum + (s.days ?? eachDayIso(s.startDate, s.endDate).length),
    0,
  );
  return { score: spellCount * spellCount * totalDays, spellCount, totalDays };
}

/** Banding used to colour the Bradford score in the UI. */
export function bradfordBand(score: number): 'ok' | 'watch' | 'concern' | 'critical' {
  if (score < 51) return 'ok';
  if (score < 201) return 'watch';
  if (score < 401) return 'concern';
  return 'critical';
}
