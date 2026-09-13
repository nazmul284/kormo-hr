/**
 * Filing categories a tax authority may distinguish. Each gets its own
 * slab set, so the union is the superset across every country pack —
 * a pack declares which of these it actually uses in `TaxPack.categories`,
 * and `GENERAL` is the one every pack has.
 *
 * The first six are personal-status reliefs (the shape South Asian
 * authorities use); the rest are filing statuses (the shape the US and
 * several others use). Keeping both in one enum means the column stays a
 * single type across tenants in different countries.
 */
export type TaxpayerCategory =
  | 'GENERAL'
  | 'FEMALE'
  | 'SENIOR_CITIZEN'
  | 'DISABLED'
  | 'GAZETTED_FREEDOM_FIGHTER'
  | 'THIRD_GENDER'
  | 'SINGLE'
  | 'MARRIED_JOINT'
  | 'MARRIED_SEPARATE'
  | 'HEAD_OF_HOUSEHOLD'
  | 'NON_RESIDENT';

/**
 * One progressive band. `slabAmount` is the *width* of the band
 * ("the first N taka"), not a cumulative ceiling. `null` means
 * "everything still remaining".
 */
export interface TaxSlabInput {
  seq: number;
  slabAmount: number | null;
  /** Percentage, e.g. 10 for 10%. */
  rate: number;
  label?: string;
}

export interface TaxConfigInput {
  fiscalYear: string;
  category: TaxpayerCategory;
  /**
   * Proportional non-taxable allowance: min(totalEarning / divisor, cap).
   * This is the South Asian shape — the exemption scales with earnings up
   * to a ceiling. Ignored when `nonTaxableFlat` is set.
   */
  nonTaxableDivisor: number;
  nonTaxableCap: number;
  /**
   * Flat standard deduction, the shape most of the rest of the world uses
   * (US standard deduction, UK personal allowance, UAE nil). When set it
   * replaces the divisor/cap calculation entirely rather than stacking
   * with it — a country does one or the other, never both.
   */
  nonTaxableFlat?: number;
  /** Allowable investment = pct% x taxable income. */
  investmentAllowancePct: number;
  /** Rebate = pct% x allowable investment. */
  rebatePct: number;
  /**
   * Statutory floor on the amount payable (Bangladesh's NBR minimum tax
   * is the canonical example). Applied only when there is taxable income
   * above the exempt band — someone below the threshold owes nothing.
   * Packs whose country has no such floor set it to 0.
   */
  minimumTax: number;
  slabs: TaxSlabInput[];
}

/** A salary-effective-date segment of the fiscal year. */
export interface SalarySegmentInput {
  /** ISO date (yyyy-mm-dd) the gross took effect. */
  effectiveFrom: string;
  gross: number;
}

export interface EarningComponentRule {
  code: string;
  label: string;
  /** Percentage of gross. Must total 100 across the components. */
  pctOfGross: number;
  isTaxable?: boolean;
}

export interface BonusInput {
  label: string;
  amount: number;
  isTaxable?: boolean;
}

export interface TaxPaymentInput {
  month: number; // 1-12
  year: number;
  amount: number;
}

export interface TaxEngineInput {
  /** First day of the fiscal year, e.g. 2026-07-01. */
  fiscalYearStart: string;
  /** Salary timeline. Segments before the FY start are clamped to it. */
  segments: SalarySegmentInput[];
  /**
   * Statutory salary heads, from the country pack. Bangladesh splits
   * Basic 50 / House Rent 30 / Conveyance 10 / Medical 10; most packs
   * declare a single 100% Basic head because their tax base is gross.
   */
  components: EarningComponentRule[];
  bonuses?: BonusInput[];
  /** Declared tax-advantaged investment (pension, life insurance, savings plans…). */
  actualInvestment?: number;
  /** Tax already paid in advance outside payroll (e.g. on a vehicle registration). */
  advanceIncomeTax?: number;
  /** Monthly deduction-at-source ledger. */
  payments?: TaxPaymentInput[];
  /** "Today" — decides how many months are left to spread the balance over. */
  asOf: string;
  config: TaxConfigInput;
}

export interface GrossTimelineRow {
  effectiveFrom: string;
  effectiveTo: string;
  months: number;
  monthlyGross: number;
  total: number;
}

export interface EarningBreakupRow {
  code: string;
  label: string;
  /** Weighted monthly figure (total / months); informational. */
  monthly: number;
  months: number;
  total: number;
  isTaxable: boolean;
}

export interface SlabWorkingRow {
  seq: number;
  label: string;
  /** null = "on the balance". */
  slabAmount: number | null;
  rate: number;
  /** How much of the taxable income landed in this band. */
  taxableInSlab: number;
  tax: number;
}

export interface TaxComputation {
  fiscalYear: string;
  category: TaxpayerCategory;

  grossTimeline: GrossTimelineRow[];
  totalGross: number;

  earningBreakup: EarningBreakupRow[];
  totalEarning: number;

  nonTaxable: number;
  taxable: number;

  slabWorking: SlabWorkingRow[];
  totalTax: number;
  minimumTaxApplied: boolean;

  allowableInvestment: number;
  actualInvestment: number;
  rebate: number;

  advanceIncomeTax: number;
  liability: number;

  paidToDate: number;
  paymentLedger: TaxPaymentInput[];
  remainingLiability: number;
  remainingMonths: number;
  monthlyLiability: number;
}
