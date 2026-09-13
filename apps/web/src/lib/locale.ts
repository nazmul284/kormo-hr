import {
  DEFAULT_COUNTRY,
  formatMoney as formatMoneyWith,
  formatMoneyCompact as formatMoneyCompactWith,
  getCountryPack,
} from '@kormo/shared';
import type { CurrencySpec } from '@kormo/shared';

/**
 * The tenant's formatting settings, as the session hands them over.
 */
export interface TenantLocale {
  country: string;
  countryName: string;
  currency: CurrencySpec;
  /** IANA timezone. Clock times are rendered in it. */
  timezone: string;
  /** BCP-47 tag for dates and non-money numbers. */
  locale: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekendDays: number[];
  fiscalYearStartMonth: number;
}

function fallback(): TenantLocale {
  const pack = getCountryPack(DEFAULT_COUNTRY);
  return {
    country: pack.code,
    countryName: pack.name,
    currency: pack.currency,
    timezone: pack.timezone,
    locale: pack.locale,
    weekendDays: pack.weekendDays,
    fiscalYearStartMonth: pack.tax?.fiscalYearStartMonth ?? 1,
  };
}

/**
 * ── Why this is a module-level value and not React context ───────────
 *
 * `formatMoney` and `formatDate` are called from 100+ places, most of
 * them inside `map()` callbacks, column definitions and chart
 * formatters — none of which are components and none of which can call
 * a hook. Threading a context value into every one of them would mean
 * either prop-drilling a currency through every table column or turning
 * every formatter call site into a component.
 *
 * The safety argument for doing it this way: this app is a client-side
 * shell. Only `app/layout.tsx` and `app/page.tsx` render on the server,
 * and neither formats money — so there is no request whose locale could
 * bleed into another's. The provider sets this during render, before
 * any child paints, so the first frame is already in the right currency
 * rather than flashing dollars at a tenant who bills in taka.
 *
 * If a page ever needs to render money on the server, this has to become
 * a real context and the call sites have to change. That is the trade
 * being made here, deliberately and in one place.
 */
let active: TenantLocale = fallback();

/** Called by the locale provider when the session resolves. */
export function setActiveLocale(next: TenantLocale | null | undefined): void {
  active = next ?? fallback();
}

export function activeLocale(): TenantLocale {
  return active;
}

export function activeCurrency(): CurrencySpec {
  return active.currency;
}

/** Money in the tenant's currency, e.g. "$12,400" or "৳1,24,000". */
export function formatMoney(
  value: number | string | null | undefined,
  options: { decimals?: boolean; symbol?: boolean } = {},
): string {
  return formatMoneyWith(value, active.currency, options);
}

/** Compact money for tiles — "$12.4K" in most places, "৳12.4L" where the grouping is 2-2-3. */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  return formatMoneyCompactWith(value, active.currency);
}

/** True when a weekday number falls on the tenant's weekend. */
export function isWeekendDay(weekday: number): boolean {
  return active.weekendDays.includes(weekday);
}
