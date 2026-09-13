import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * United States.
 *
 * Federal income tax only — state and FICA withholding are out of scope
 * for the demo, and the brackets below are illustrative rather than a
 * filing-grade reproduction of any single tax year. Treat them the way
 * you would any other pack: the numbers live here so that correcting
 * them is editing one file, not auditing the engine.
 */

const STANDARD_DEDUCTION: Partial<Record<TaxpayerCategory, number>> = {
  SINGLE: 15_000,
  MARRIED_JOINT: 30_000,
  MARRIED_SEPARATE: 15_000,
  HEAD_OF_HOUSEHOLD: 22_500,
};

/** Single-filer band widths. Other statuses scale these. */
const SINGLE_BANDS: { width: number | null; rate: number }[] = [
  { width: 11_925, rate: 10 },
  { width: 36_525, rate: 12 },
  { width: 54_875, rate: 22 },
  { width: 94_100, rate: 24 },
  { width: 53_375, rate: 32 },
  { width: 375_800, rate: 35 },
  { width: null, rate: 37 },
];

const SCALE: Partial<Record<TaxpayerCategory, number>> = {
  SINGLE: 1,
  MARRIED_JOINT: 2,
  MARRIED_SEPARATE: 1,
  HEAD_OF_HOUSEHOLD: 1.5,
};

function buildConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'SINGLE',
): TaxConfigInput {
  const scale = SCALE[category] ?? 1;
  return {
    fiscalYear,
    category,
    nonTaxableFlat: STANDARD_DEDUCTION[category] ?? STANDARD_DEDUCTION.SINGLE!,
    nonTaxableDivisor: 3,
    nonTaxableCap: 0,
    // The US grants no proportional investment rebate of the kind the
    // engine models, so both percentages are zero and the rebate line
    // renders as 0 rather than being hidden — an explicit zero is easier
    // to reconcile against than a missing row.
    investmentAllowancePct: 0,
    rebatePct: 0,
    minimumTax: 0,
    slabs: SINGLE_BANDS.map((b, i) => {
      const width = b.width === null ? null : Math.round(b.width * scale);
      return {
        seq: i + 1,
        slabAmount: width,
        rate: b.rate,
        label: width === null
          ? `On the balance @ ${b.rate}%`
          : `${i === 0 ? 'First' : 'Next'} ${width.toLocaleString('en-US')} @ ${b.rate}%`,
      };
    }),
  };
}

/**
 * Federal holidays. The floating ones (third Monday in January, and so
 * on) are computed rather than listed, so the pack stays correct for any
 * year instead of running out of table rows.
 */
function nthWeekdayOf(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + shift + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastWeekdayOf(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  const day = last.getUTCDate() - shift;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function holidaysFor(year: number): HolidaySpec[] {
  return [
    { name: "New Year's Day", start: `${year}-01-01` },
    { name: 'Martin Luther King Jr. Day', start: nthWeekdayOf(year, 1, 1, 3) },
    { name: "Presidents' Day", start: nthWeekdayOf(year, 2, 1, 3) },
    { name: 'Memorial Day', start: lastWeekdayOf(year, 5, 1) },
    { name: 'Juneteenth', start: `${year}-06-19` },
    { name: 'Independence Day', start: `${year}-07-04` },
    { name: 'Labor Day', start: nthWeekdayOf(year, 9, 1, 1) },
    { name: 'Veterans Day', start: `${year}-11-11` },
    { name: 'Thanksgiving', start: nthWeekdayOf(year, 11, 4, 4), end: nthWeekdayOf(year, 11, 5, 4), description: 'Thanksgiving Thursday and the day after.' },
    { name: 'Christmas Day', start: `${year}-12-25`, religion: 'Christianity' },
  ];
}

export const UNITED_STATES: CountryPack = {
  code: 'US',
  name: 'United States',
  flag: '🇺🇸',
  timezone: 'America/New_York',
  locale: 'en-US',
  currency: { code: 'USD', symbol: '$', locale: 'en-US', grouping: 'western', decimals: 2 },
  weekendDays: [6, 0],
  workWeekLabel: 'Monday – Friday',
  phone: {
    dialCode: '1',
    pattern: '(202) 555-01##',
    reservedBy: 'NANP numbers 555-0100 to 555-0199 are reserved for fictional use and are never assigned.',
    example: '+1 (202) 555-0142',
  },
  nationalId: {
    label: 'Social Security Number',
    pattern: '900-##-####',
    reservedBy: 'SSNs in the 900–999 area-number range are never issued by the SSA.',
    example: '900-48-2193',
  },
  taxId: {
    label: 'Taxpayer Identification Number',
    pattern: '00-#######',
    reservedBy: 'No EIN is issued with a 00 prefix.',
    example: '00-4831927',
  },
  tax: {
    // US pay is not split into statutory heads — the tax base is gross —
    // so a single 100% component is the accurate model, not a shortcut.
    earningComponents: [{ code: 'BASIC', label: 'Base Salary', pctOfGross: 100 }],
    categories: ['SINGLE', 'MARRIED_JOINT', 'MARRIED_SEPARATE', 'HEAD_OF_HOUSEHOLD'],
    categoryLabels: {
      SINGLE: 'Single',
      MARRIED_JOINT: 'Married, filing jointly',
      MARRIED_SEPARATE: 'Married, filing separately',
      HEAD_OF_HOUSEHOLD: 'Head of household',
    },
    fiscalYearStartMonth: 1,
    authority: 'US federal income tax (illustrative)',
    buildConfig,
  },
  holidays: Object.fromEntries(
    [2024, 2025, 2026, 2027, 2028].map((y) => [y, holidaysFor(y)]),
  ),
  bankTransferTypes: [
    { code: 'ACH', label: 'ACH direct deposit' },
    { code: 'WIRE', label: 'Fedwire transfer' },
    { code: 'CHECK', label: 'Paper cheque' },
    { code: 'CASH', label: 'Cash disbursement' },
  ],
};
