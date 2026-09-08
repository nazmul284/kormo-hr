/** Taxpayer categories recognised by the NBR. Each gets its own slab set. */
export type TaxpayerCategory =
  | 'GENERAL'
  | 'FEMALE'
  | 'SENIOR_CITIZEN'
  | 'DISABLED'
  | 'GAZETTED_FREEDOM_FIGHTER'
  | 'THIRD_GENDER';

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
  /** Non-taxable allowance = min(totalEarning / divisor, cap). */
  nonTaxableDivisor: number;
  nonTaxableCap: number;
  /** Allowable investment = pct% x taxable income. */
  investmentAllowancePct: number;
  /** Rebate = pct% x allowable investment. */
  rebatePct: number;
  /**
   * NBR floor. Applied only when there is taxable income above the
   * exempt band — someone below the threshold owes nothing.
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
  /** Bangladesh default: Basic 50 / House Rent 30 / Conveyance 10 / Medical 10. */
  components: EarningComponentRule[];
  bonuses?: BonusInput[];
  /** Declared investment (DPS, life insurance, savings certificates…). */
  actualInvestment?: number;
  /** AIT already deposited (e.g. on a car registration). */
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
