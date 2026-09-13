/**
 * Date helpers. Every stored `@db.Date` is anchored at UTC noon so a
 * server in any timezone reads back the same calendar day — the classic
 * "attendance shifted by one day" bug.
 */
export const MS_DAY = 86_400_000;

/**
 * Timezone used when a call site genuinely has no tenant in scope.
 *
 * UTC, not a guess at where the deployment is: a wrong-by-six-hours
 * default silently shifts every clock-in, which shows up as a fleet-wide
 * late-arrival spike nobody can explain. Every tenant-scoped caller
 * passes `TenantContext.timezone` instead.
 */
export const DEFAULT_TIMEZONE = 'UTC';

/**
 * A timezone's offset from UTC, in minutes, at a given instant.
 *
 * Resolved per-instant through `Intl` rather than held as a constant,
 * because most of the timezones the country packs ship observe DST — a
 * fixed offset is wrong for half the year in London, New York and Berlin.
 */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function dateOnly(value: string | Date): Date {
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * MS_DAY);
}

export function addMonths(value: Date, months: number): Date {
  const result = new Date(value.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 12));
}

export function endOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 12));
}

/** Inclusive month window, for the many "?month=&year=" endpoints. */
export function monthWindow(month: number, year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 12)),
    end: new Date(Date.UTC(year, month, 0, 12)),
  };
}

/**
 * Start of the week containing `value`.
 *
 * `weekStartsOn` defaults to Sunday, which is what the attendance and
 * room-booking grids render. A tenant whose week starts on Monday passes
 * 1; the grids read it off their country pack.
 */
export function startOfWeek(value: Date, weekStartsOn = 0): Date {
  const dow = (value.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(dateOnly(value), -dow);
}

export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += MS_DAY) out.push(new Date(t));
  return out;
}

/** Builds an instant at HH:mm wall-clock time, in the tenant's timezone. */
export function atLocalTime(day: Date, hhmm: string, timeZone = DEFAULT_TIMEZONE): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const midnightUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  // Probe the offset on the day itself so a DST transition is respected.
  const offset = tzOffsetMinutes(timeZone, new Date(midnightUtc));
  return new Date(midnightUtc + ((h ?? 0) * 60 + (m ?? 0) - offset) * 60_000);
}

/** Minutes past local midnight for an instant, in the tenant's timezone. */
export function localMinutes(value: Date, timeZone = DEFAULT_TIMEZONE): number {
  const shifted = new Date(value.getTime() + tzOffsetMinutes(timeZone, value) * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}
