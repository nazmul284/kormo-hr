/**
 * Date helpers. Every stored `@db.Date` is anchored at UTC noon so a
 * server in any timezone reads back the same calendar day — the classic
 * "attendance shifted by one day" bug.
 */
export const MS_DAY = 86_400_000;

/** Tenant timezone offset in minutes. Asia/Dhaka is UTC+6, no DST. */
export const DHAKA_OFFSET_MIN = 360;

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

/** The Bangladeshi work week runs Sunday → Thursday. */
export function startOfWeek(value: Date): Date {
  const dow = value.getUTCDay(); // 0 = Sunday
  return addDays(dateOnly(value), -dow);
}

export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += MS_DAY) out.push(new Date(t));
  return out;
}

/** Builds an instant at HH:mm local (Dhaka) on a given calendar day. */
export function atLocalTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) +
      ((h ?? 0) * 60 + (m ?? 0) - DHAKA_OFFSET_MIN) * 60_000,
  );
}

/** Minutes past local midnight for an instant. */
export function localMinutes(value: Date): number {
  const shifted = new Date(value.getTime() + DHAKA_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}
