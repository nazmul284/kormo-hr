import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * United Arab Emirates.
 *
 * There is no personal income tax, so the pack ships a single zero-rate
 * band rather than no tax pack at all. That is a deliberate choice: the
 * tax module stays switched on and produces a statement that reads
 * "nil", which is more useful to a payroll officer than a hidden page —
 * and it exercises the zero-liability path in the engine.
 *
 * The working week is Monday–Friday with a Saturday–Sunday weekend,
 * which is what the federal sector moved to in 2022.
 */
function buildConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
): TaxConfigInput {
  return {
    fiscalYear,
    category,
    nonTaxableFlat: 0,
    nonTaxableDivisor: 3,
    nonTaxableCap: 0,
    investmentAllowancePct: 0,
    rebatePct: 0,
    minimumTax: 0,
    slabs: [
      { seq: 1, slabAmount: null, rate: 0, label: 'All personal income @ 0% — no personal income tax' },
    ],
  };
}

/**
 * Islamic holidays follow the Hijri calendar and are confirmed by
 * government announcement only days ahead, so they are listed per year
 * rather than computed. Ranges are the conventional announced spans.
 */
const ISLAMIC: Record<number, HolidaySpec[]> = {
  2025: [
    { name: 'Eid Al Fitr', start: '2025-03-30', end: '2025-04-01', religion: 'Islam' },
    { name: 'Arafat Day & Eid Al Adha', start: '2025-06-05', end: '2025-06-08', religion: 'Islam' },
    { name: 'Islamic New Year', start: '2025-06-26', religion: 'Islam' },
    { name: 'Prophet Muhammad’s Birthday', start: '2025-09-05', religion: 'Islam' },
  ],
  2026: [
    { name: 'Eid Al Fitr', start: '2026-03-19', end: '2026-03-21', religion: 'Islam' },
    { name: 'Arafat Day & Eid Al Adha', start: '2026-05-26', end: '2026-05-29', religion: 'Islam' },
    { name: 'Islamic New Year', start: '2026-06-16', religion: 'Islam' },
    { name: 'Prophet Muhammad’s Birthday', start: '2026-08-25', religion: 'Islam' },
  ],
  2027: [
    { name: 'Eid Al Fitr', start: '2027-03-09', end: '2027-03-11', religion: 'Islam' },
    { name: 'Arafat Day & Eid Al Adha', start: '2027-05-16', end: '2027-05-19', religion: 'Islam' },
    { name: 'Islamic New Year', start: '2027-06-06', religion: 'Islam' },
    { name: 'Prophet Muhammad’s Birthday', start: '2027-08-14', religion: 'Islam' },
  ],
};

function holidaysFor(year: number): HolidaySpec[] {
  return [
    { name: "New Year's Day", start: `${year}-01-01` },
    ...(ISLAMIC[year] ?? []),
    { name: 'Commemoration Day', start: `${year}-12-01` },
    { name: 'National Day', start: `${year}-12-02`, end: `${year}-12-03` },
  ].sort((a, b) => a.start.localeCompare(b.start));
}

export const UNITED_ARAB_EMIRATES: CountryPack = {
  code: 'AE',
  name: 'United Arab Emirates',
  flag: '🇦🇪',
  timezone: 'Asia/Dubai',
  locale: 'en-AE',
  currency: { code: 'AED', symbol: 'AED ', locale: 'en-AE', grouping: 'western', decimals: 2 },
  weekendDays: [6, 0],
  workWeekLabel: 'Monday – Friday',
  phone: {
    dialCode: '971',
    pattern: '50 000 00##',
    reservedBy: 'The TDRA publishes no fictional range, so the pack uses an all-zero subscriber body that no operator allocates.',
    example: '+971 50 000 0042',
  },
  nationalId: {
    label: 'Emirates ID',
    pattern: '784-0000-#######-#',
    reservedBy: 'The birth-year field is zeroed, which no issued Emirates ID can be.',
    example: '784-0000-4821993-0',
  },
  taxId: {
    label: 'Tax Registration Number',
    pattern: '1000########',
    reservedBy: 'Fictional scheme; not checked against the FTA register.',
    example: '100048319275',
  },
  tax: {
    earningComponents: [
      { code: 'BASIC', label: 'Basic Salary', pctOfGross: 60 },
      { code: 'HOUSING', label: 'Housing Allowance', pctOfGross: 25 },
      { code: 'CONVEYANCE', label: 'Conveyance Allowance', pctOfGross: 15 },
    ],
    categories: ['GENERAL'],
    categoryLabels: { GENERAL: 'All residents' },
    fiscalYearStartMonth: 1,
    authority: 'Federal Tax Authority — no personal income tax',
    buildConfig,
  },
  holidays: Object.fromEntries(
    [2024, 2025, 2026, 2027, 2028].map((y) => [y, holidaysFor(y)]),
  ),
  bankTransferTypes: [
    { code: 'WPS', label: 'WPS — Wage Protection System' },
    { code: 'IBAN', label: 'Domestic IBAN transfer' },
    { code: 'SWIFT', label: 'SWIFT international wire' },
    { code: 'CASH', label: 'Cash disbursement' },
  ],
};
