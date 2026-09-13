import type { CurrencySpec, MoneyGrouping } from './types';

/**
 * Money formatting, shared so the server's XLSX export and the browser's
 * table cell cannot disagree about what a figure looks like.
 *
 * `Intl.NumberFormat` does the grouping; the pack decides which locale
 * drives it. Deliberately *not* `style: 'currency'` — that puts the ISO
 * code or a locale-chosen symbol in a locale-chosen position, and HR
 * tables need the symbol tight against the number so a column of figures
 * stays scannable.
 */
export function formatMoney(
  value: number | string | null | undefined,
  currency: CurrencySpec,
  options: { decimals?: boolean; symbol?: boolean } = {},
): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  const digits = options.decimals ? currency.decimals : 0;
  const formatted = amount.toLocaleString(currency.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return options.symbol === false ? formatted : `${currency.symbol}${formatted}`;
}

/**
 * Compact form for dashboard tiles.
 *
 * The thresholds follow the grouping, not the language: where numbers are
 * grouped 2-2-3 the readable steps are lakh and crore, and rendering
 * ৳1.2M to someone who thinks in crore is the same mistake as rendering
 * $1.2Cr to someone who thinks in millions.
 */
export function formatMoneyCompact(
  value: number | string | null | undefined,
  currency: CurrencySpec,
): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const s = currency.symbol;

  if (currency.grouping === 'indian') {
    if (abs >= 10_000_000) return `${sign}${s}${(abs / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `${sign}${s}${(abs / 100_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${sign}${s}${(abs / 1_000).toFixed(1)}k`;
    return `${sign}${s}${abs.toFixed(0)}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${s}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${s}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${s}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${s}${abs.toFixed(0)}`;
}

/** The step names a grouping uses, for axis labels and tooltips. */
export function compactUnits(grouping: MoneyGrouping): string[] {
  return grouping === 'indian' ? ['k', 'L', 'Cr'] : ['K', 'M', 'B'];
}
