import type { TaxConfigInput, TaxpayerCategory } from '../../tax/types';
import type { CountryPack, HolidaySpec } from '../types';

/**
 * Bangladesh.
 *
 * The most elaborate pack in the set, and the one the tax engine was
 * originally written against: NBR income tax is genuinely progressive
 * with a proportional exemption, an investment rebate and a statutory
 * minimum, so it exercises every branch the engine has. Anyone adding a
 * country pack should read this one first — whatever your jurisdiction
 * does, some shape of it is already here.
 */

/**
 * Exempt-band uplifts over the general threshold. The NBR grants a
 * higher tax-free ceiling to certain taxpayer categories; everything
 * above the first band is identical.
 */
const EXEMPT_BAND: Partial<Record<TaxpayerCategory, number>> = {
  GENERAL: 400_000,
  FEMALE: 475_000,
  SENIOR_CITIZEN: 475_000,
  THIRD_GENDER: 475_000,
  DISABLED: 500_000,
  GAZETTED_FREEDOM_FIGHTER: 525_000,
};

/** Bands above the exempt threshold — the same for every category. */
const UPPER_BANDS: { slabAmount: number | null; rate: number }[] = [
  { slabAmount: 300_000, rate: 10 },
  { slabAmount: 400_000, rate: 15 },
  { slabAmount: 500_000, rate: 20 },
  { slabAmount: 2_000_000, rate: 25 },
  { slabAmount: null, rate: 30 },
];

/**
 * Builds a full config for one fiscal year + category.
 *
 * NOTE ON THE REBATE: this reproduces `allowable = 20% × taxable` and
 * `rebate = 10% × allowable`, which is what a live statement from the
 * reference system shows. Current NBR law is a three-way minimum (3% of
 * taxable income, 15% of actual investment, or a hard cap) — override
 * `investmentAllowancePct` / `rebatePct` per fiscal year rather than
 * editing the engine, which is exactly why these live in the database.
 */
export function bdTaxConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
  overrides: Partial<TaxConfigInput> = {},
): TaxConfigInput {
  const exempt = EXEMPT_BAND[category] ?? EXEMPT_BAND.GENERAL!;
  const slabs = [
    { seq: 1, slabAmount: exempt, rate: 0, label: `First ${exempt.toLocaleString('en-US')} @ 0%` },
    ...UPPER_BANDS.map((b, i) => ({
      seq: i + 2,
      slabAmount: b.slabAmount,
      rate: b.rate,
      label:
        b.slabAmount === null
          ? `On the balance @ ${b.rate}%`
          : `Next ${b.slabAmount.toLocaleString('en-US')} @ ${b.rate}%`,
    })),
  ];

  return {
    fiscalYear,
    category,
    nonTaxableDivisor: 3,
    nonTaxableCap: 500_000,
    investmentAllowancePct: 20,
    rebatePct: 10,
    minimumTax: 5_000,
    slabs,
    ...overrides,
  };
}

/**
 * Gazetted public holidays. Islamic dates are lunar and confirmed only
 * days ahead by the government; these are the conventional gazetted
 * spans for each year.
 */
const HOLIDAYS: Record<number, HolidaySpec[]> = {
  2025: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2025-02-21' },
    { name: 'Independence & National Day', start: '2025-03-26' },
    { name: 'Eid-ul-Fitr', start: '2025-03-28', end: '2025-04-01', religion: 'Islam', description: 'Eid holiday including Shab-e-Qadr and pre/post Eid days' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2025-04-14' },
    { name: 'May Day', start: '2025-05-01' },
    { name: 'Eid-ul-Azha', start: '2025-06-05', end: '2025-06-10', religion: 'Islam' },
    { name: 'Ashura', start: '2025-07-06', religion: 'Islam' },
    { name: 'Janmashtami', start: '2025-08-16', religion: 'Hinduism' },
    { name: 'Eid-e-Miladunnabi', start: '2025-09-05', religion: 'Islam' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2025-10-01', end: '2025-10-02', religion: 'Hinduism' },
    { name: 'Victory Day', start: '2025-12-16' },
    { name: 'Christmas Day', start: '2025-12-25', religion: 'Christianity' },
  ],
  2026: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2026-02-21' },
    { name: 'Eid-ul-Fitr', start: '2026-03-17', end: '2026-03-21', religion: 'Islam', description: 'Eid holiday including pre/post Eid days' },
    { name: 'Independence & National Day', start: '2026-03-26' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2026-04-14' },
    { name: 'May Day', start: '2026-05-01' },
    { name: 'Buddha Purnima', start: '2026-05-11', religion: 'Buddhism', optional: true },
    { name: 'Eid-ul-Azha', start: '2026-05-26', end: '2026-05-30', religion: 'Islam' },
    { name: 'Ashura', start: '2026-06-25', religion: 'Islam' },
    { name: 'Eid-e-Miladunnabi', start: '2026-08-25', religion: 'Islam' },
    { name: 'Janmashtami', start: '2026-09-04', religion: 'Hinduism' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2026-10-20', end: '2026-10-21', religion: 'Hinduism' },
    { name: 'Victory Day', start: '2026-12-16' },
    { name: 'Christmas Day', start: '2026-12-25', religion: 'Christianity' },
  ],
  2027: [
    { name: 'Shaheed Dibosh & International Mother Language Day', start: '2027-02-21' },
    { name: 'Eid-ul-Fitr', start: '2027-03-07', end: '2027-03-11', religion: 'Islam' },
    { name: 'Independence & National Day', start: '2027-03-26' },
    { name: 'Pahela Baishakh — Bengali New Year', start: '2027-04-14' },
    { name: 'May Day', start: '2027-05-01' },
    { name: 'Eid-ul-Azha', start: '2027-05-16', end: '2027-05-20', religion: 'Islam' },
    { name: 'Ashura', start: '2027-06-15', religion: 'Islam' },
    { name: 'Eid-e-Miladunnabi', start: '2027-08-14', religion: 'Islam' },
    { name: 'Janmashtami', start: '2027-08-25', religion: 'Hinduism' },
    { name: 'Durga Puja — Vijaya Dashami', start: '2027-10-09', religion: 'Hinduism' },
    { name: 'Victory Day', start: '2027-12-16' },
    { name: 'Christmas Day', start: '2027-12-25', religion: 'Christianity' },
  ],
};

export const BANGLADESH: CountryPack = {
  code: 'BD',
  name: 'Bangladesh',
  flag: '🇧🇩',
  timezone: 'Asia/Dhaka',
  locale: 'en-BD',
  // BDT follows the en-IN lakh/crore grouping, not the western one: a
  // salary written 1,196,000 instead of 11,96,000 reads as the wrong
  // order of magnitude to the payroll officer checking it.
  currency: { code: 'BDT', symbol: '৳', locale: 'en-IN', grouping: 'indian', decimals: 2 },
  weekendDays: [5, 6],
  workWeekLabel: 'Sunday – Thursday',
  phone: {
    dialCode: '880',
    pattern: '1300-0000##',
    reservedBy: 'The BTRC publishes no fictional range, so the pack uses an all-zero subscriber body that no operator allocates.',
    example: '+880 1300-000042',
  },
  nationalId: {
    label: 'National ID (NID)',
    pattern: '0000######',
    reservedBy: 'A real NID never begins with 0 — the leading zeros make these structurally invalid.',
    example: '0000483192',
  },
  taxId: {
    label: 'e-TIN',
    pattern: '000#########',
    reservedBy: 'Fictional scheme; not checked against the NBR register.',
    example: '000483192756',
  },
  tax: {
    /**
     * Bangladesh statutory earning heads. Payroll splits gross into these
     * before tax; the percentages are company-configurable
     * (SalaryComponent) and these are only the defaults.
     */
    earningComponents: [
      { code: 'BASIC', label: 'Basic Salary', pctOfGross: 50 },
      { code: 'HOUSE_RENT', label: 'House Rent Allowance', pctOfGross: 30 },
      { code: 'CONVEYANCE', label: 'Conveyance Allowance', pctOfGross: 10 },
      { code: 'MEDICAL', label: 'Medical Allowance', pctOfGross: 10 },
    ],
    categories: [
      'GENERAL',
      'FEMALE',
      'SENIOR_CITIZEN',
      'DISABLED',
      'GAZETTED_FREEDOM_FIGHTER',
      'THIRD_GENDER',
    ],
    categoryLabels: {
      GENERAL: 'General',
      FEMALE: 'Female',
      SENIOR_CITIZEN: 'Senior citizen (65+)',
      DISABLED: 'Person with disability',
      GAZETTED_FREEDOM_FIGHTER: 'Gazetted freedom fighter',
      THIRD_GENDER: 'Third gender',
    },
    fiscalYearStartMonth: 7,
    authority: 'National Board of Revenue (NBR)',
    buildConfig: bdTaxConfig,
  },
  holidays: HOLIDAYS,
  bankTransferTypes: [
    { code: 'BEFTN', label: 'BEFTN — Bangladesh Electronic Funds Transfer Network' },
    { code: 'RTGS', label: 'RTGS — Real Time Gross Settlement' },
    { code: 'NPSB', label: 'NPSB — National Payment Switch Bangladesh' },
    { code: 'MFS', label: 'Mobile Financial Service' },
    { code: 'CASH', label: 'Cash disbursement' },
  ],
};
