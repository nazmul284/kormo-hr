import type {
  BonusInput,
  EarningBreakupRow,
  GrossTimelineRow,
  SlabWorkingRow,
  TaxComputation,
  TaxEngineInput,
  TaxPaymentInput,
} from './types';

/**
 * ── Rounding policy ──────────────────────────────────────────────────
 * Reproduced from the reference implementation, verified against a live
 * statement (see engine.test.ts):
 *
 *   nonTaxable  → ceil   (rounds in the taxpayer's favour)
 *   totalTax    → floor
 *   investment  → floor
 *   rebate      → floor
 *   monthly     → round half-up
 *
 * These are deliberately *not* a single "round everything" rule: the NBR
 * statement lands on specific integers and a naive round() drifts by
 * 1 taka, which shows up as a mismatch on the payslip.
 */
const ceil = (n: number) => Math.ceil(round2(n));
const floor = (n: number) => Math.floor(round2(n));
const half = (n: number) => Math.round(round2(n));

/**
 * Kills binary-float dust (e.g. 5499.899999999999) before a floor/ceil,
 * which would otherwise swing the result by a whole taka.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MS_DAY = 86_400_000;

function parseDate(iso: string): Date {
  // Anchor at UTC noon so DST/timezone shifts can never roll the date.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

/** Whole months between two dates, minimum 0. */
function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

/**
 * Builds the month-by-month gross timeline for the fiscal year by
 * segmenting on salary-effective dates.
 *
 * A mid-year increment produces two rows (e.g. 6 months at the old gross
 * + 6 at the new); the FY total is the sum, never `latestGross × 12`.
 */
export function buildGrossTimeline(
  fiscalYearStart: string,
  segments: { effectiveFrom: string; gross: number }[],
): GrossTimelineRow[] {
  const fyStart = parseDate(fiscalYearStart);
  const fyEnd = addMonths(fyStart, 12); // exclusive

  if (segments.length === 0) return [];

  // Sort ascending, then clamp everything to the FY window. Segments that
  // started before the FY are carried in at the FY start.
  const sorted = [...segments]
    .map((s) => ({ from: parseDate(s.effectiveFrom), gross: s.gross }))
    .sort((a, b) => a.from.getTime() - b.from.getTime());

  // The gross in force on day one of the FY.
  const priorOrOpening = sorted.filter((s) => s.from.getTime() <= fyStart.getTime());
  const insideFy = sorted.filter(
    (s) => s.from.getTime() > fyStart.getTime() && s.from.getTime() < fyEnd.getTime(),
  );

  const points: { from: Date; gross: number }[] = [];
  if (priorOrOpening.length > 0) {
    points.push({ from: fyStart, gross: priorOrOpening[priorOrOpening.length - 1].gross });
  }
  for (const s of insideFy) {
    // Effective dates mid-month are treated as effective from that month:
    // payroll applies an increment to the whole month it lands in.
    const monthStart = new Date(
      Date.UTC(s.from.getUTCFullYear(), s.from.getUTCMonth(), 1, 12),
    );
    points.push({ from: monthStart, gross: s.gross });
  }

  if (points.length === 0) {
    // Everything starts after the FY — nothing earned this year.
    return [];
  }

  const rows: GrossTimelineRow[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = points[i].from;
    const next = i + 1 < points.length ? points[i + 1].from : fyEnd;
    const months = monthsBetween(start, next);
    if (months <= 0) continue;
    const monthlyGross = points[i].gross;
    rows.push({
      effectiveFrom: toIso(start),
      effectiveTo: toIso(new Date(addMonths(next, 0).getTime() - MS_DAY)),
      months,
      monthlyGross,
      total: round2(monthlyGross * months),
    });
  }
  return rows;
}

/**
 * Splits the FY gross into its statutory earning heads and appends
 * bonuses. Component percentages are applied per-segment so a mid-year
 * increment splits correctly.
 */
export function buildEarningBreakup(
  timeline: GrossTimelineRow[],
  components: { code: string; label: string; pctOfGross: number; isTaxable?: boolean }[],
  bonuses: BonusInput[] = [],
): { rows: EarningBreakupRow[]; totalEarning: number } {
  const totalMonths = timeline.reduce((s, r) => s + r.months, 0);

  const rows: EarningBreakupRow[] = components.map((c) => {
    const total = round2(
      timeline.reduce((sum, r) => sum + r.monthlyGross * (c.pctOfGross / 100) * r.months, 0),
    );
    return {
      code: c.code,
      label: c.label,
      monthly: totalMonths > 0 ? round2(total / totalMonths) : 0,
      months: totalMonths,
      total,
      isTaxable: c.isTaxable !== false,
    };
  });

  for (const b of bonuses) {
    rows.push({
      code: 'BONUS',
      label: b.label,
      monthly: round2(b.amount),
      months: 1,
      total: round2(b.amount),
      isTaxable: b.isTaxable !== false,
    });
  }

  const totalEarning = round2(
    rows.filter((r) => r.isTaxable).reduce((s, r) => s + r.total, 0),
  );
  return { rows, totalEarning };
}

/**
 * Applies the progressive slab ladder. Each slab's `slabAmount` is the
 * band *width*; a null width absorbs the balance.
 */
export function applySlabs(
  taxable: number,
  slabs: { seq: number; slabAmount: number | null; rate: number; label?: string }[],
): { rows: SlabWorkingRow[]; totalTax: number } {
  let remaining = taxable;
  const rows: SlabWorkingRow[] = [];

  for (const slab of [...slabs].sort((a, b) => a.seq - b.seq)) {
    const width = slab.slabAmount ?? Number.POSITIVE_INFINITY;
    const inSlab = Math.max(0, Math.min(remaining, width));
    const tax = round2(inSlab * (slab.rate / 100));
    rows.push({
      seq: slab.seq,
      label:
        slab.label ??
        (slab.slabAmount === null
          ? `On the balance @ ${slab.rate}%`
          : `First ${slab.slabAmount.toLocaleString('en-US')} @ ${slab.rate}%`),
      slabAmount: slab.slabAmount,
      rate: slab.rate,
      taxableInSlab: round2(inSlab),
      tax,
    });
    remaining = round2(remaining - inSlab);
    if (remaining <= 0) {
      // Keep the untouched higher bands visible with zeroes so the
      // statement always shows the full ladder.
      const rest = [...slabs]
        .sort((a, b) => a.seq - b.seq)
        .filter((s) => s.seq > slab.seq);
      for (const s of rest) {
        rows.push({
          seq: s.seq,
          label:
            s.label ??
            (s.slabAmount === null
              ? `On the balance @ ${s.rate}%`
              : `First ${s.slabAmount.toLocaleString('en-US')} @ ${s.rate}%`),
          slabAmount: s.slabAmount,
          rate: s.rate,
          taxableInSlab: 0,
          tax: 0,
        });
      }
      break;
    }
  }

  const totalTax = floor(rows.reduce((s, r) => s + r.tax, 0));
  return { rows, totalTax };
}

/**
 * Full income-tax computation for one employee, one fiscal year.
 *
 * Country-agnostic: every figure that varies between jurisdictions —
 * slabs, the exemption shape, the investment rebate, the minimum-tax
 * floor — arrives in `config`, which a country pack builds and the
 * database stores. Pure: no dates from the ambient clock, no DB, no
 * rounding surprises — so the API, a payroll worker and the browser
 * preview all produce byte-identical numbers.
 *
 * Pipeline (each step is exposed on the result for auditability):
 *   1. gross timeline      — segment the FY on salary-effective dates
 *   2. earning breakup     — statutory heads + bonuses
 *   3. non-taxable         — min(totalEarning / divisor, cap)
 *   4. taxable             — totalEarning − nonTaxable
 *   5. slabs               — progressive ladder
 *   6. rebate              — pct of (pct of taxable)
 *   7. liability           — totalTax − rebate − AIT, floored at minimum tax
 *   8. paid to date        — deduction-at-source ledger
 *   9. remaining / month   — balance spread over the months left in the FY
 */
export function computeTax(input: TaxEngineInput): TaxComputation {
  const { config } = input;

  // 1 ── gross timeline
  const grossTimeline = buildGrossTimeline(input.fiscalYearStart, input.segments);
  const totalGross = round2(grossTimeline.reduce((s, r) => s + r.total, 0));

  // 2 ── earning breakup
  const { rows: earningBreakup, totalEarning } = buildEarningBreakup(
    grossTimeline,
    input.components,
    input.bonuses ?? [],
  );

  // 3 ── non-taxable allowance
  //
  // Two shapes, never both: a flat standard deduction (most of the world)
  // or an earnings-proportional exemption capped at a ceiling (South Asia).
  // A flat allowance cannot exceed what was actually earned, or a
  // part-year joiner would show negative taxable income.
  const nonTaxable = config.nonTaxableFlat !== undefined
    ? ceil(Math.min(config.nonTaxableFlat, totalEarning))
    : ceil(Math.min(totalEarning / config.nonTaxableDivisor, config.nonTaxableCap));

  // 4 ── taxable income
  const taxable = Math.max(0, round2(totalEarning - nonTaxable));

  // 5 ── progressive slabs
  const { rows: slabWorking, totalTax: slabTax } = applySlabs(taxable, config.slabs);

  // 6 ── investment rebate
  const allowableInvestment = floor(taxable * (config.investmentAllowancePct / 100));
  const actualInvestment = round2(input.actualInvestment ?? 0);
  // The rebate is earned on what was *actually* invested, capped by the
  // allowable ceiling. With no declared investment there is no rebate —
  // but the reference statement always shows the ceiling, so both are kept.
  const rebateBase = actualInvestment > 0
    ? Math.min(actualInvestment, allowableInvestment)
    : allowableInvestment;
  const rebate = floor(rebateBase * (config.rebatePct / 100));

  // 7 ── liability
  const advanceIncomeTax = round2(input.advanceIncomeTax ?? 0);
  let liability = round2(slabTax - rebate - advanceIncomeTax);
  let minimumTaxApplied = false;

  // A statutory minimum bites only when there is income above the exempt band.
  const exemptBand = config.slabs.find((s) => s.rate === 0)?.slabAmount ?? 0;
  const hasTaxableIncomeAboveExemption = taxable > exemptBand;
  if (hasTaxableIncomeAboveExemption && config.minimumTax > 0 && liability < config.minimumTax) {
    liability = config.minimumTax;
    minimumTaxApplied = true;
  }
  if (!hasTaxableIncomeAboveExemption) liability = 0;
  liability = Math.max(0, liability);

  // 8 ── already deducted at source
  const paymentLedger: TaxPaymentInput[] = [...(input.payments ?? [])].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
  const paidToDate = round2(paymentLedger.reduce((s, p) => s + p.amount, 0));

  // 9 ── spread the balance over the months left in the fiscal year
  const fyStart = parseDate(input.fiscalYearStart);
  const asOf = parseDate(input.asOf);
  const monthsElapsed = Math.min(12, Math.max(0, monthsBetween(fyStart, asOf)));
  const remainingMonths = Math.max(1, 12 - monthsElapsed);
  const remainingLiability = Math.max(0, round2(liability - paidToDate));
  const monthlyLiability = half(remainingLiability / remainingMonths);

  return {
    fiscalYear: config.fiscalYear,
    category: config.category,
    grossTimeline,
    totalGross,
    earningBreakup,
    totalEarning,
    nonTaxable,
    taxable,
    slabWorking,
    totalTax: slabTax,
    minimumTaxApplied,
    allowableInvestment,
    actualInvestment,
    rebate,
    advanceIncomeTax,
    liability,
    paidToDate,
    paymentLedger,
    remainingLiability,
    remainingMonths,
    monthlyLiability,
  };
}

/**
 * Fiscal-year helpers.
 *
 * `startMonth` comes from the country pack: January in the US and most of
 * the EU, April in the UK and India, July in Bangladesh and Australia. A
 * year that straddles two calendar years is labelled by both halves
 * ("2026-27"); one that does not is labelled by its single year ("2026").
 */
export function fiscalYearLabel(date: Date, startMonth = 1): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  if (startMonth === 1) return String(startYear);
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function fiscalYearStartIso(label: string, startMonth = 1): string {
  const startYear = Number(label.slice(0, 4));
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}

export function fiscalYearRange(label: string, startMonth = 1): { start: string; end: string } {
  const start = fiscalYearStartIso(label, startMonth);
  const s = parseDate(start);
  const end = new Date(addMonths(s, 12).getTime() - MS_DAY);
  return { start, end: toIso(end) };
}
