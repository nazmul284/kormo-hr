/**
 * Attendance presentation helpers. Kept in shared so the API's exported
 * XLSX and the on-screen grid render identical strings — an auditor
 * comparing the two should never see a discrepancy.
 */

/** Minutes → "H:MM" (the LT / BT / TH / OTH columns). */
export function minutesToHm(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '--';
  if (minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function secondsToHm(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '--';
  return minutesToHm(Math.round(seconds / 60));
}

/**
 * Date → "HH:mm:ss" at a given offset from UTC, in minutes.
 *
 * The default is 0, not a guess at where the deployment is: a
 * wrong-by-six-hours default silently shifts every clock-in, which shows
 * up as a fleet-wide late-arrival spike nobody can explain. Callers with
 * a tenant in scope pass its offset.
 */
export function timeOfDay(
  value: Date | string | null | undefined,
  offsetMinutes = 0,
): string {
  if (!value) return '--';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '--';
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** "10:00" + 9h → "General(10am-07pm)", the shift label format. */
export function shiftLabel(name: string, startTime: string, endTime: string): string {
  return `${name}(${to12h(startTime)}-${to12h(endTime)})`;
}

export function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${String(h12).padStart(2, '0')}${suffix}`
    : `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Parses "HH:mm" into minutes past midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToHhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * Derives late minutes and worked minutes against a shift, handling
 * overnight shifts (out time before in time on the clock).
 */
export function evaluatePunch(params: {
  inMinutes: number | null;
  outMinutes: number | null;
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  graceMinutes: number;
  breakMinutes: number;
  isNightShift: boolean;
}): { lateMinutes: number; workMinutes: number; overtimeMinutes: number } {
  const {
    inMinutes,
    outMinutes,
    shiftStartMinutes,
    shiftEndMinutes,
    graceMinutes,
    breakMinutes,
    isNightShift,
  } = params;

  if (inMinutes === null) return { lateMinutes: 0, workMinutes: 0, overtimeMinutes: 0 };

  const lateMinutes = Math.max(0, inMinutes - (shiftStartMinutes + graceMinutes));

  if (outMinutes === null) return { lateMinutes, workMinutes: 0, overtimeMinutes: 0 };

  // An overnight shift (or anyone who clocked out after midnight) needs
  // the out time pushed into the next day before subtracting.
  const adjustedOut =
    outMinutes < inMinutes || (isNightShift && outMinutes <= shiftStartMinutes)
      ? outMinutes + 1440
      : outMinutes;

  const gross = Math.max(0, adjustedOut - inMinutes);
  const workMinutes = Math.max(0, gross - breakMinutes);

  const scheduledEnd = shiftEndMinutes < shiftStartMinutes ? shiftEndMinutes + 1440 : shiftEndMinutes;
  const scheduledMinutes = Math.max(0, scheduledEnd - shiftStartMinutes - breakMinutes);
  const overtimeMinutes = Math.max(0, workMinutes - scheduledMinutes);

  return { lateMinutes, workMinutes, overtimeMinutes };
}

/**
 * Service length as y/m/d, the "Service Length" field on the profile.
 * Calendar-aware: 1 Jan → 1 Mar is 2 months exactly, not 59/30 months.
 */
export function serviceLength(
  joiningDate: Date | string,
  asOf: Date | string = new Date(),
): { years: number; months: number; days: number; label: string; totalMonths: number } {
  const from = new Date(joiningDate);
  const to = new Date(asOf);
  if (Number.isNaN(from.getTime()) || to < from) {
    return { years: 0, months: 0, days: 0, label: '--', totalMonths: 0 };
  }

  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  let days = to.getUTCDate() - from.getUTCDate();

  if (days < 0) {
    months -= 1;
    // Days in the month preceding `to`.
    days += new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);

  return { years, months, days, label: parts.join(' '), totalMonths: years * 12 + months };
}

/** Initials for the avatar fallback. */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = (firstName ?? '').trim().charAt(0).toUpperCase();
  const b = (lastName ?? '').trim().charAt(0).toUpperCase();
  return (a + b) || '?';
}
