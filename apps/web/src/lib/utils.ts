import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── formatting ────────────────────────────────────────────────────────

/** Bangladeshi taka. Uses the en-IN grouping (lakh/crore) that BDT follows. */
export function formatMoney(
  value: number | string | null | undefined,
  options: { decimals?: boolean; symbol?: boolean } = {},
): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: options.decimals ? 2 : 0,
    maximumFractionDigits: options.decimals ? 2 : 0,
  });
  return options.symbol === false ? formatted : `৳${formatted}`;
}

/** Compact form for tiles: ৳12.4L, ৳1.2Cr. */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  if (Math.abs(amount) >= 10_000_000) return `৳${(amount / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(amount) >= 100_000) return `৳${(amount / 100_000).toFixed(2)}L`;
  if (Math.abs(amount) >= 1_000) return `৳${(amount / 1_000).toFixed(1)}k`;
  return `৳${amount.toFixed(0)}`;
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Leave balances are fractional; drop a trailing .00 but keep .56. */
export function formatDays(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toFixed(decimals)}%`;
}

// ── dates ─────────────────────────────────────────────────────────────

const DHAKA = 'Asia/Dhaka';

export function formatDate(
  value: string | Date | null | undefined,
  style: 'short' | 'medium' | 'long' | 'iso' = 'medium',
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  if (style === 'iso') return date.toISOString().slice(0, 10);

  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC', // stored dates are UTC-noon anchored calendar days
    day: '2-digit',
    month: style === 'short' ? 'short' : style === 'long' ? 'long' : 'short',
    year: 'numeric',
  });
}

/** Clock time in the tenant's timezone. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    timeZone: DHAKA,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)} · ${formatTime(date)}`;
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  const abs = Math.abs(diffDays);

  if (abs === 0) {
    const diffHours = Math.round(diffMs / 3_600_000);
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / 60_000);
      if (diffMinutes === 0) return 'just now';
      return diffMinutes > 0 ? `in ${diffMinutes}m` : `${-diffMinutes}m ago`;
    }
    return diffHours > 0 ? `in ${diffHours}h` : `${-diffHours}h ago`;
  }
  if (abs === 1) return diffDays > 0 ? 'tomorrow' : 'yesterday';
  if (abs < 30) return diffDays > 0 ? `in ${abs} days` : `${abs} days ago`;
  return formatDate(date, 'short');
}

/** "H:MM" from minutes — matches the API's own LT / TH / OTH columns. */
export function minutesToHm(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  if (minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Stable colour index for an avatar, derived from the name so the same
 * person always gets the same swatch.
 */
export function avatarTone(name: string | null | undefined): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 5;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Years to offer in a year picker, newest first. */
export function yearOptions(back = 4, forward = 1): number[] {
  const now = new Date().getUTCFullYear();
  const years: number[] = [];
  for (let y = now + forward; y >= now - back; y--) years.push(y);
  return years;
}

/**
 * Colour for a leave type, resolved from its key.
 *
 * Deliberately not the `colorHex` the API returns: a stored hex is a single
 * light-mode value, and dark mode needs a *selected* step rather than the
 * same colour on a dark ground. Rendering from a token keeps both modes
 * validated, and keeps the palette in one place.
 *
 * Maternity and paternity share the parental hue on purpose — they are
 * gender-restricted, so no employee ever sees both.
 */
export function leaveColor(key: string | null | undefined): string {
  switch (key) {
    case 'casual': return 'rgb(var(--leave-casual))';
    case 'sick': return 'rgb(var(--leave-sick))';
    case 'annual': return 'rgb(var(--leave-annual))';
    case 'maternity':
    case 'paternity': return 'rgb(var(--leave-parental))';
    case 'comp_off': return 'rgb(var(--leave-comp))';
    case 'lwp': return 'rgb(var(--leave-unpaid))';
    // An unrecognised type is drawn neutral rather than invented a hue for.
    default: return 'rgb(var(--ink-muted))';
  }
}

/**
 * "1 day", "2 days", "0.5 days" — never "1 day(s)".
 *
 * `(s)` had spread to eighteen call sites because it is the shortest thing to
 * type. It also reads as unfinished software, and it is the sort of detail a
 * reader notices without being able to say why the page felt cheap.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : pluralForm;
}

/**
 * A count with its correctly-inflected noun.
 *
 * Accepts a pre-formatted string (`formatDays` output, say) so the caller
 * keeps control of how the number itself is rendered.
 */
export function countOf(
  count: number | string,
  singular: string,
  pluralForm?: string,
): string {
  const amount = typeof count === 'number' ? count : Number(count);
  return `${count} ${plural(Number.isFinite(amount) ? amount : 2, singular, pluralForm)}`;
}
