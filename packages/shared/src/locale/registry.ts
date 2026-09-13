import { BANGLADESH } from './packs/bangladesh';
import { INDIA } from './packs/india';
import { INTERNATIONAL } from './packs/international';
import { UNITED_ARAB_EMIRATES } from './packs/uae';
import { UNITED_KINGDOM } from './packs/united-kingdom';
import { UNITED_STATES } from './packs/us';
import type { CountryPack } from './types';

/**
 * Every country pack the build ships.
 *
 * Adding a country is adding a file here and one line to this map. If
 * you find yourself writing `if (country === 'XX')` anywhere else in the
 * codebase, the pack is missing a field — add the field instead.
 */
export const COUNTRY_PACKS: Record<string, CountryPack> = {
  INTL: INTERNATIONAL,
  US: UNITED_STATES,
  GB: UNITED_KINGDOM,
  IN: INDIA,
  AE: UNITED_ARAB_EMIRATES,
  BD: BANGLADESH,
};

/** The pack used when a tenant has not chosen one. */
export const DEFAULT_COUNTRY = 'INTL';

export const COUNTRY_CODES = Object.keys(COUNTRY_PACKS);

/**
 * Resolves a country code to its pack, falling back to the neutral one.
 *
 * The fallback is deliberate rather than a throw: a tenant row carrying a
 * country this build does not ship (a downgrade, a typo in an import)
 * should render in a sane default, not take the whole app down. Callers
 * that need to know whether the code was recognised can compare
 * `pack.code` against what they passed in.
 */
export function getCountryPack(code: string | null | undefined): CountryPack {
  if (!code) return COUNTRY_PACKS[DEFAULT_COUNTRY];
  return COUNTRY_PACKS[code.toUpperCase()] ?? COUNTRY_PACKS[DEFAULT_COUNTRY];
}

/** Summary rows for a country picker, without shipping the whole pack to the client. */
export function listCountries(): {
  code: string;
  name: string;
  flag: string;
  currency: string;
  weekendDays: number[];
  taxAuthority: string | null;
}[] {
  return COUNTRY_CODES.map((code) => {
    const pack = COUNTRY_PACKS[code];
    return {
      code: pack.code,
      name: pack.name,
      flag: pack.flag,
      currency: pack.currency.code,
      weekendDays: pack.weekendDays,
      taxAuthority: pack.tax?.authority ?? null,
    };
  });
}
