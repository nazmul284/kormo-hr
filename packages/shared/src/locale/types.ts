import type { EarningComponentRule, TaxConfigInput, TaxpayerCategory } from '../tax/types';

/**
 * How a currency is grouped when written out.
 *
 * `western` is the 3-digit grouping almost everywhere uses (1,234,567).
 * `indian` is the 2-2-3 lakh/crore grouping of the subcontinent
 * (12,34,567) — it is not a cosmetic preference there, a salary written
 * with western grouping reads as the wrong order of magnitude to a
 * Bangladeshi or Indian payroll officer.
 */
export type MoneyGrouping = 'western' | 'indian';

export interface CurrencySpec {
  /** ISO 4217, e.g. "USD". */
  code: string;
  /** What actually gets printed beside the number, e.g. "$" or "৳". */
  symbol: string;
  /** BCP-47 tag used for `Intl` grouping. */
  locale: string;
  grouping: MoneyGrouping;
  /** Decimal places on a "with decimals" render. Money is 2 everywhere we ship. */
  decimals: number;
}

/**
 * A generator template.
 *
 * `#` is replaced by a random digit and `A` by a random uppercase letter;
 * every other character is copied through verbatim, which is what gives
 * each country its own spacing and punctuation. The fixed characters at
 * the front are the point of the whole mechanism: they pin the value into
 * a block that cannot belong to a real person.
 */
export type Template = string;

/**
 * A fictional phone-number spec.
 *
 * Where the national regulator publishes a range reserved for drama and
 * documentation (Ofcom's 07700 900xxx, the NANP's 555-01xx) the pack uses
 * it. Where none exists, the pack uses an all-zero subscriber body that no
 * operator issues. Either way the requirement is "provably cannot ring
 * anyone", not "looks plausible" — this repository is public, and a seeded
 * contact number that happens to be live is somebody's phone ringing at
 * 3am because a stranger cloned a demo.
 */
export interface PhoneSpec {
  /** E.164 country calling code, digits only, no plus. */
  dialCode: string;
  /** National-significant part, excluding the dial code. */
  pattern: Template;
  /** Why this range is safe. Surfaced in the docs, not the UI. */
  reservedBy: string;
  /** A rendered example, for placeholder text and documentation. */
  example: string;
}

export interface IdentifierSpec {
  /** What HR calls it on the form, e.g. "National ID", "Social Security Number". */
  label: string;
  pattern: Template;
  /** Why a generated value cannot collide with a real one. */
  reservedBy: string;
  example: string;
}

export interface HolidaySpec {
  name: string;
  /** ISO yyyy-mm-dd. */
  start: string;
  /** ISO yyyy-mm-dd; omit for a single-day holiday. */
  end?: string;
  description?: string;
  /**
   * Set when the day belongs to one faith community. Packs mark these so
   * a tenant can switch them to optional rather than closing the office.
   */
  religion?: string;
  /** Observed at the employee's discretion rather than a company closure. */
  optional?: boolean;
}

/** Tax rules for one country. `null` on packs that ship no tax engine. */
export interface TaxPack {
  /** Statutory salary heads gross is split into before tax. */
  earningComponents: EarningComponentRule[];
  /** Filing categories this country actually distinguishes. */
  categories: TaxpayerCategory[];
  categoryLabels: Partial<Record<TaxpayerCategory, string>>;
  /** Month (1-12) the tax year opens on. */
  fiscalYearStartMonth: number;
  /** The authority whose rules these reproduce, for the UI heading. */
  authority: string;
  buildConfig(fiscalYear: string, category?: TaxpayerCategory): TaxConfigInput;
}

/**
 * Everything that differs between one country's HR setup and another's.
 *
 * The point of collecting these in one object is that adding a country is
 * adding a file, not editing twenty call sites. Nothing outside
 * `locale/packs/` may branch on a country code.
 */
export interface CountryPack {
  /** ISO 3166-1 alpha-2, or "INTL" for the country-neutral default. */
  code: string;
  name: string;
  /** Regional-indicator emoji, or 🌐 for the neutral pack. */
  flag: string;
  /** IANA timezone the demo tenant runs in. */
  timezone: string;
  /** BCP-47 tag for dates and non-money numbers. */
  locale: string;
  currency: CurrencySpec;
  /** Weekday numbers that are the weekend. 0 = Sunday … 6 = Saturday. */
  weekendDays: number[];
  /** Human form of the work week, e.g. "Monday – Friday". */
  workWeekLabel: string;
  phone: PhoneSpec;
  nationalId: IdentifierSpec;
  taxId: IdentifierSpec;
  tax: TaxPack | null;
  /** Public holidays by calendar year. */
  holidays: Record<number, HolidaySpec[]>;
  /** Instrument codes the payroll disbursement file offers. */
  bankTransferTypes: { code: string; label: string }[];
}
