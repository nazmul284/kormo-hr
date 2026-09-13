import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * United Kingdom.
 *
 * Income tax only — National Insurance is a separate deduction the
 * payroll module handles as an ordinary salary component. The personal
 * allowance is modelled as the engine's flat non-taxable amount; its
 * taper above £100,000 is deliberately not implemented, because the
 * engine's exemption is a constant rather than a function of income and
 * faking it here would hide the limitation rather than document it.
 */

const PERSONAL_ALLOWANCE = 12_570;

const BANDS: { width: number | null; rate: number }[] = [
  { width: 37_700, rate: 20 },   // basic rate
  { width: 87_440, rate: 40 },   // higher rate, up to £125,140
  { width: null, rate: 45 },     // additional rate
];

function buildConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
): TaxConfigInput {
  // A non-resident without a personal allowance pays from the first pound.
  const allowance = category === 'NON_RESIDENT' ? 0 : PERSONAL_ALLOWANCE;
  return {
    fiscalYear,
    category,
    nonTaxableFlat: allowance,
    nonTaxableDivisor: 3,
    nonTaxableCap: 0,
    investmentAllowancePct: 0,
    rebatePct: 0,
    minimumTax: 0,
    slabs: BANDS.map((b, i) => ({
      seq: i + 1,
      slabAmount: b.width,
      rate: b.rate,
      label: b.width === null
        ? `On the balance @ ${b.rate}%`
        : `${i === 0 ? 'First' : 'Next'} ${b.width.toLocaleString('en-GB')} @ ${b.rate}%`,
    })),
  };
}

/** Easter Sunday (Meeus/Jones/Butcher), which anchors Good Friday and Easter Monday. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** First or last Monday of a month — how UK bank holidays are defined. */
function firstMonday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return isoOf(shift(first, (1 - first.getUTCDay() + 7) % 7));
}

function lastMonday(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  return isoOf(shift(last, -((last.getUTCDay() - 1 + 7) % 7)));
}

function holidaysFor(year: number): HolidaySpec[] {
  const e = easter(year);
  return [
    { name: "New Year's Day", start: `${year}-01-01` },
    { name: 'Good Friday', start: isoOf(shift(e, -2)), religion: 'Christianity' },
    { name: 'Easter Monday', start: isoOf(shift(e, 1)), religion: 'Christianity' },
    { name: 'Early May Bank Holiday', start: firstMonday(year, 5) },
    { name: 'Spring Bank Holiday', start: lastMonday(year, 5) },
    { name: 'Summer Bank Holiday', start: lastMonday(year, 8) },
    { name: 'Christmas & Boxing Day', start: `${year}-12-25`, end: `${year}-12-26`, religion: 'Christianity' },
  ];
}

export const UNITED_KINGDOM: CountryPack = {
  code: 'GB',
  name: 'United Kingdom',
  flag: '🇬🇧',
  timezone: 'Europe/London',
  locale: 'en-GB',
  currency: { code: 'GBP', symbol: '£', locale: 'en-GB', grouping: 'western', decimals: 2 },
  weekendDays: [6, 0],
  workWeekLabel: 'Monday – Friday',
  phone: {
    dialCode: '44',
    pattern: '7700 900###',
    reservedBy: 'Ofcom reserves 07700 900000–900999 for drama and documentation; the range is never allocated.',
    example: '+44 7700 900142',
  },
  nationalId: {
    label: 'National Insurance Number',
    pattern: 'QQ ## ## ## C',
    reservedBy: 'The QQ prefix is on HMRC’s list of combinations never issued.',
    example: 'QQ 12 34 56 C',
  },
  taxId: {
    label: 'Unique Taxpayer Reference',
    pattern: '0100######',
    reservedBy: 'Fictional scheme; HMRC does not issue a UTR with this prefix.',
    example: '0100483192',
  },
  tax: {
    earningComponents: [{ code: 'BASIC', label: 'Base Salary', pctOfGross: 100 }],
    categories: ['GENERAL', 'NON_RESIDENT'],
    categoryLabels: {
      GENERAL: 'Standard (with personal allowance)',
      NON_RESIDENT: 'Non-resident (no personal allowance)',
    },
    // The UK tax year runs 6 April – 5 April. The engine segments on whole
    // months, so the pack opens the year on 1 April; the five-day offset
    // is a known, documented simplification rather than an oversight.
    fiscalYearStartMonth: 4,
    authority: 'HMRC income tax (illustrative)',
    buildConfig,
  },
  holidays: Object.fromEntries(
    [2024, 2025, 2026, 2027, 2028].map((y) => [y, holidaysFor(y)]),
  ),
  bankTransferTypes: [
    { code: 'BACS', label: 'BACS credit' },
    { code: 'FPS', label: 'Faster Payments' },
    { code: 'CHAPS', label: 'CHAPS same-day transfer' },
    { code: 'SEPA', label: 'SEPA credit transfer' },
    { code: 'CASH', label: 'Cash disbursement' },
  ],
};
