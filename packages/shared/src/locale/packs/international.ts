import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * The country-neutral default.
 *
 * Nowhere runs exactly this, and that is deliberate: it is the pack you
 * demo with, evaluate with, and fork when adding your own country. Its
 * figures are round and obviously illustrative so nobody mistakes them
 * for a jurisdiction's real rules — USD, a calendar tax year, a
 * Saturday–Sunday weekend and a five-band progressive scale.
 */

/** Flat standard deduction per filing category, in USD. */
const STANDARD_DEDUCTION: Partial<Record<TaxpayerCategory, number>> = {
  GENERAL: 12_000,
  MARRIED_JOINT: 24_000,
  NON_RESIDENT: 0,
};

/** Band widths above the deduction, in USD. `null` = the balance. */
const BANDS: { width: number | null; rate: number }[] = [
  { width: 10_000, rate: 0 },
  { width: 30_000, rate: 10 },
  { width: 50_000, rate: 20 },
  { width: 100_000, rate: 30 },
  { width: null, rate: 35 },
];

function buildConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
): TaxConfigInput {
  // A non-resident is taxed flat from the first unit earned, with no
  // free band — the common treatment, and a useful second shape to have
  // in the demo so the slab table is not always the same ladder.
  const bands = category === 'NON_RESIDENT'
    ? [{ width: null, rate: 25 }]
    : BANDS;
  // Joint filers get the whole ladder widened, not just the free band.
  const scale = category === 'MARRIED_JOINT' ? 2 : 1;

  return {
    fiscalYear,
    category,
    nonTaxableFlat: STANDARD_DEDUCTION[category] ?? 0,
    // Unused when `nonTaxableFlat` is set, but the shape requires them.
    nonTaxableDivisor: 3,
    nonTaxableCap: 0,
    investmentAllowancePct: 20,
    rebatePct: 10,
    minimumTax: 0,
    slabs: bands.map((b, i) => {
      const width = b.width === null ? null : b.width * scale;
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
 * A neutral public-holiday calendar: the days that are closed almost
 * everywhere, plus two floating company days so the calendar has
 * something in the middle of the year to render.
 */
function holidaysFor(year: number): HolidaySpec[] {
  return [
    { name: "New Year's Day", start: `${year}-01-01` },
    { name: 'Spring Public Holiday', start: `${year}-04-06`, description: 'Floating spring closure.' },
    { name: 'International Workers’ Day', start: `${year}-05-01` },
    { name: 'Mid-Year Company Day', start: `${year}-07-03`, description: 'Company-wide closure.' },
    { name: 'Autumn Public Holiday', start: `${year}-10-12`, description: 'Floating autumn closure.' },
    { name: 'Winter Holiday', start: `${year}-12-24`, end: `${year}-12-26`, description: 'Year-end closure.' },
    { name: "New Year's Eve", start: `${year}-12-31` },
  ];
}

export const INTERNATIONAL: CountryPack = {
  code: 'INTL',
  name: 'International',
  flag: '🌐',
  timezone: 'UTC',
  locale: 'en-US',
  currency: { code: 'USD', symbol: '$', locale: 'en-US', grouping: 'western', decimals: 2 },
  weekendDays: [6, 0],
  workWeekLabel: 'Monday – Friday',
  phone: {
    dialCode: '99',
    pattern: '0100000###',
    reservedBy: 'Country code +99 is unassigned by the ITU, so these numbers cannot route anywhere on the public network.',
    example: '+99 0100000142',
  },
  nationalId: {
    label: 'National ID',
    pattern: '0100-####-####',
    reservedBy: 'Fictional scheme; the 0100 prefix is not issued by any registry.',
    example: '0100-4821-9930',
  },
  taxId: {
    label: 'Tax ID',
    pattern: 'TIN-0100######',
    reservedBy: 'Fictional scheme; no authority issues a TIN- prefixed identifier in this form.',
    example: 'TIN-0100483192',
  },
  tax: {
    earningComponents: [
      { code: 'BASIC', label: 'Basic Salary', pctOfGross: 70 },
      { code: 'HOUSING', label: 'Housing Allowance', pctOfGross: 20 },
      { code: 'CONVEYANCE', label: 'Conveyance Allowance', pctOfGross: 10 },
    ],
    categories: ['GENERAL', 'MARRIED_JOINT', 'NON_RESIDENT'],
    categoryLabels: {
      GENERAL: 'Standard',
      MARRIED_JOINT: 'Married, filing jointly',
      NON_RESIDENT: 'Non-resident',
    },
    fiscalYearStartMonth: 1,
    authority: 'Illustrative international scale',
    buildConfig,
  },
  holidays: Object.fromEntries(
    [2024, 2025, 2026, 2027, 2028].map((y) => [y, holidaysFor(y)]),
  ),
  bankTransferTypes: [
    { code: 'ACH', label: 'ACH / domestic bank transfer' },
    { code: 'SWIFT', label: 'SWIFT international wire' },
    { code: 'SEPA', label: 'SEPA credit transfer' },
    { code: 'CASH', label: 'Cash disbursement' },
    { code: 'WALLET', label: 'Mobile money / wallet' },
  ],
};
