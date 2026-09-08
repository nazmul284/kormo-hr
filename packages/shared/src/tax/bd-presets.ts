import type { EarningComponentRule, TaxConfigInput, TaxpayerCategory } from './types';

/**
 * Bangladesh statutory earning heads. Payroll splits gross into these
 * before tax; the percentages are company-configurable
 * (SalaryComponent) and these are only the defaults.
 */
export const BD_EARNING_COMPONENTS: EarningComponentRule[] = [
  { code: 'BASIC', label: 'Basic Salary', pctOfGross: 50 },
  { code: 'HOUSE_RENT', label: 'House Rent Allowance', pctOfGross: 30 },
  { code: 'CONVEYANCE', label: 'Conveyance Allowance', pctOfGross: 10 },
  { code: 'MEDICAL', label: 'Medical Allowance', pctOfGross: 10 },
];

/**
 * Exempt-band uplifts over the general threshold. The NBR grants a
 * higher tax-free ceiling to certain taxpayer categories; everything
 * above the first band is identical.
 */
const EXEMPT_BAND: Record<TaxpayerCategory, number> = {
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
 * NOTE ON THE REBATE: the reference system computes
 * `allowable = 20% x taxable` and `rebate = 10% x allowable`, which is
 * what these defaults reproduce so the numbers match a live statement.
 * Current NBR law is a three-way minimum (3% of taxable income, 15% of
 * actual investment, or a hard cap) — override
 * `investmentAllowancePct` / `rebatePct` per fiscal year rather than
 * editing the engine, which is exactly why these live in the database.
 */
export function bdTaxConfig(
  fiscalYear: string,
  category: TaxpayerCategory = 'GENERAL',
  overrides: Partial<TaxConfigInput> = {},
): TaxConfigInput {
  const exempt = EXEMPT_BAND[category];
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

export const BD_TAXPAYER_CATEGORIES: TaxpayerCategory[] = [
  'GENERAL',
  'FEMALE',
  'SENIOR_CITIZEN',
  'DISABLED',
  'GAZETTED_FREEDOM_FIGHTER',
  'THIRD_GENDER',
];

export const BD_CATEGORY_LABELS: Record<TaxpayerCategory, string> = {
  GENERAL: 'General',
  FEMALE: 'Female',
  SENIOR_CITIZEN: 'Senior citizen (65+)',
  DISABLED: 'Person with disability',
  GAZETTED_FREEDOM_FIGHTER: 'Gazetted freedom fighter',
  THIRD_GENDER: 'Third gender',
};
