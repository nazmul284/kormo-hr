import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BANGLADESH } from '../locale/packs/bangladesh';
import { INTERNATIONAL } from '../locale/packs/international';
import { UNITED_STATES } from '../locale/packs/us';
import {
  applySlabs,
  buildGrossTimeline,
  computeTax,
  fiscalYearLabel,
  fiscalYearRange,
} from './engine';

const BD = BANGLADESH.tax!;
const INTL = INTERNATIONAL.tax!;
const US = UNITED_STATES.tax!;

/**
 * These figures are lifted from a live NBR statement produced by the
 * system being replaced. They are the contract: if a refactor moves any
 * of them by even one taka, payslips stop reconciling.
 */
describe('computeTax — reference statement, FY 2026-27', () => {
  const result = computeTax({
    fiscalYearStart: '2026-07-01',
    segments: [
      { effectiveFrom: '2025-04-01', gross: 85_000 }, // in force at FY start
      { effectiveFrom: '2027-01-01', gross: 85_000 }, // mid-year record
    ],
    components: BD.earningComponents,
    bonuses: [{ label: 'Festival Bonus', amount: 85_000 }],
    payments: [
      { month: 7, year: 2026, amount: 1_430 },
      { month: 8, year: 2026, amount: 1_758 },
    ],
    asOf: '2026-09-15',
    config: BD.buildConfig('2026-27', 'GENERAL'),
  });

  it('segments the fiscal year on salary-effective dates', () => {
    assert.equal(result.grossTimeline.length, 2);
    assert.equal(result.grossTimeline[0].months, 6);
    assert.equal(result.grossTimeline[1].months, 6);
    assert.equal(result.totalGross, 1_020_000);
  });

  it('adds the festival bonus to total earning', () => {
    assert.equal(result.totalEarning, 1_105_000);
  });

  it('caps the non-taxable allowance at one third of earnings', () => {
    assert.equal(result.nonTaxable, 368_334);
    assert.equal(result.taxable, 736_666);
  });

  it('applies the progressive slab ladder', () => {
    assert.equal(result.totalTax, 35_499);
    // 400,000 @ 0% | 300,000 @ 10% | 36,666 @ 15%
    assert.equal(result.slabWorking[0].tax, 0);
    assert.equal(result.slabWorking[1].tax, 30_000);
    assert.equal(result.slabWorking[2].taxableInSlab, 36_666);
  });

  it('computes the investment rebate', () => {
    assert.equal(result.allowableInvestment, 147_333);
    assert.equal(result.rebate, 14_733);
  });

  it('nets down to the annual liability', () => {
    assert.equal(result.liability, 20_766);
  });

  it('spreads the balance over the remaining months', () => {
    assert.equal(result.paidToDate, 3_188);
    assert.equal(result.remainingLiability, 17_578);
    assert.equal(result.remainingMonths, 10);
    assert.equal(result.monthlyLiability, 1_758);
  });
});

describe('computeTax — edge cases', () => {
  const base = {
    fiscalYearStart: '2026-07-01',
    components: BD.earningComponents,
    asOf: '2026-07-01',
    config: BD.buildConfig('2026-27', 'GENERAL'),
  };

  it('charges nothing below the exempt band, and does not apply minimum tax there', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2026-07-01', gross: 30_000 }],
    });
    // 360,000 earned, 120,000 exempt → 240,000 taxable, all inside the 0% band.
    assert.equal(r.taxable, 240_000);
    assert.equal(r.totalTax, 0);
    assert.equal(r.liability, 0);
    assert.equal(r.minimumTaxApplied, false);
  });

  it('applies the NBR minimum tax once income clears the exempt band', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2026-07-01', gross: 51_000 }],
    });
    // Slab tax lands under 5,000 after the rebate → floored at minimum tax.
    assert.ok(r.taxable > 400_000);
    assert.equal(r.liability, 5_000);
    assert.equal(r.minimumTaxApplied, true);
  });

  it('honours a higher exempt band for the female category', () => {
    const general = computeTax({ ...base, segments: [{ effectiveFrom: '2026-07-01', gross: 85_000 }] });
    const female = computeTax({
      ...base,
      config: BD.buildConfig('2026-27', 'FEMALE'),
      segments: [{ effectiveFrom: '2026-07-01', gross: 85_000 }],
    });
    assert.ok(female.liability < general.liability);
    assert.equal(female.slabWorking[0].slabAmount, 475_000);
  });

  it('caps the non-taxable allowance in absolute terms for high earners', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2026-07-01', gross: 500_000 }],
    });
    // One third of 6,000,000 would be 2,000,000 — the 500,000 cap wins.
    assert.equal(r.nonTaxable, 500_000);
  });

  it('pro-rates a mid-year joiner instead of assuming twelve months', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2027-01-01', gross: 100_000 }],
    });
    assert.equal(r.grossTimeline.length, 1);
    assert.equal(r.grossTimeline[0].months, 6);
    assert.equal(r.totalGross, 600_000);
  });

  it('reflects a mid-year increment in the timeline', () => {
    const r = computeTax({
      ...base,
      segments: [
        { effectiveFrom: '2026-07-01', gross: 60_000 },
        { effectiveFrom: '2027-01-01', gross: 90_000 },
      ],
    });
    assert.equal(r.totalGross, 60_000 * 6 + 90_000 * 6);
  });

  it('never returns a negative remaining liability when over-deducted', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2026-07-01', gross: 85_000 }],
      payments: [{ month: 7, year: 2026, amount: 999_999 }],
    });
    assert.equal(r.remainingLiability, 0);
    assert.equal(r.monthlyLiability, 0);
  });

  it('returns an empty timeline when no salary falls inside the year', () => {
    const r = computeTax({
      ...base,
      segments: [{ effectiveFrom: '2030-01-01', gross: 100_000 }],
    });
    assert.deepEqual(r.grossTimeline, []);
    assert.equal(r.totalGross, 0);
    assert.equal(r.liability, 0);
  });
});

describe('applySlabs', () => {
  it('shows the whole ladder even when income stops early', () => {
    const { rows, totalTax } = applySlabs(500_000, BD.buildConfig('2026-27').slabs);
    assert.equal(rows.length, 6);
    assert.equal(totalTax, 10_000); // 100,000 into the 10% band
    assert.equal(rows[5].taxableInSlab, 0);
  });

  it('absorbs the balance in the open-ended top band', () => {
    const { totalTax } = applySlabs(10_000_000, BD.buildConfig('2026-27').slabs);
    // 0 + 30,000 + 60,000 + 100,000 + 500,000 + (6,400,000 @ 30%)
    assert.equal(totalTax, 0 + 30_000 + 60_000 + 100_000 + 500_000 + 1_920_000);
  });
});

describe('buildGrossTimeline', () => {
  it('clamps a pre-FY salary record to the start of the year', () => {
    const rows = buildGrossTimeline('2026-07-01', [
      { effectiveFrom: '2020-01-01', gross: 40_000 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].effectiveFrom, '2026-07-01');
    assert.equal(rows[0].months, 12);
  });

  it('uses the latest pre-FY record as the opening gross', () => {
    const rows = buildGrossTimeline('2026-07-01', [
      { effectiveFrom: '2020-01-01', gross: 40_000 },
      { effectiveFrom: '2024-01-01', gross: 55_000 },
    ]);
    assert.equal(rows[0].monthlyGross, 55_000);
  });
});

describe('fiscal year helpers', () => {
  it('labels a July-start year by both calendar halves', () => {
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 6, 1)), 7), '2026-27');
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 5, 30)), 7), '2025-26');
  });

  it('labels a calendar tax year by its single year', () => {
    // A January-start year does not straddle two calendar years, so
    // "2026-27" would be actively misleading on a US or UAE statement.
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 0, 1)), 1), '2026');
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 11, 31)), 1), '2026');
  });

  it('labels an April-start year across the boundary', () => {
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 3, 6)), 4), '2026-27');
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 2, 31)), 4), '2025-26');
  });

  it('derives the fiscal year window', () => {
    assert.deepEqual(fiscalYearRange('2026-27', 7), {
      start: '2026-07-01',
      end: '2027-06-30',
    });
    assert.deepEqual(fiscalYearRange('2026', 1), {
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
});

/**
 * The country packs are the reason the engine is parameterised at all, so
 * each shipped shape gets a test. These are not re-derivations of the
 * engine's arithmetic — they pin the *shape* each pack asks for: a flat
 * standard deduction instead of a proportional exemption, a zero-rate
 * jurisdiction, and a pack with no investment rebate at all.
 */
describe('country packs — exemption shapes', () => {
  const salary = (gross: number, pack: typeof INTL, fyStart: string, category: any) =>
    computeTax({
      fiscalYearStart: fyStart,
      segments: [{ effectiveFrom: '2020-01-01', gross }],
      components: pack.earningComponents,
      asOf: `${fyStart.slice(0, 4)}-01-01`,
      config: pack.buildConfig(fyStart.slice(0, 4), category),
    });

  it('applies a flat standard deduction rather than a proportional one', () => {
    const r = salary(10_000, INTL, '2026-01-01', 'GENERAL');
    // 120,000 earned − 12,000 flat deduction, not 120,000/3.
    assert.equal(r.totalEarning, 120_000);
    assert.equal(r.nonTaxable, 12_000);
    assert.equal(r.taxable, 108_000);
  });

  it('caps a flat deduction at what was actually earned', () => {
    // A part-year earner must never show negative taxable income.
    const r = computeTax({
      fiscalYearStart: '2026-01-01',
      segments: [{ effectiveFrom: '2026-11-01', gross: 1_000 }],
      components: INTL.earningComponents,
      asOf: '2026-12-01',
      config: INTL.buildConfig('2026', 'GENERAL'),
    });
    assert.equal(r.nonTaxable, r.totalEarning);
    assert.equal(r.taxable, 0);
    assert.equal(r.liability, 0);
  });

  it('widens the whole ladder for a joint filer, not just the free band', () => {
    const single = INTL.buildConfig('2026', 'GENERAL');
    const joint = INTL.buildConfig('2026', 'MARRIED_JOINT');
    assert.equal(joint.nonTaxableFlat, (single.nonTaxableFlat ?? 0) * 2);
    assert.equal(joint.slabs[1].slabAmount, (single.slabs[1].slabAmount ?? 0) * 2);
  });

  it('taxes a non-resident flat from the first unit earned', () => {
    const config = INTL.buildConfig('2026', 'NON_RESIDENT');
    assert.equal(config.nonTaxableFlat, 0);
    assert.deepEqual(config.slabs, [
      { seq: 1, slabAmount: null, rate: 25, label: 'On the balance @ 25%' },
    ]);
  });

  it('reports a zero rebate for a pack that has none', () => {
    const r = salary(10_000, US, '2026-01-01', 'SINGLE');
    // An explicit zero, not a missing row — the statement still balances.
    assert.equal(r.allowableInvestment, 0);
    assert.equal(r.rebate, 0);
  });

  it('keeps the Bangladesh proportional exemption untouched', () => {
    // The flat-deduction branch must not have leaked into the packs that
    // still use the divisor/cap shape.
    const config = BD.buildConfig('2026-27', 'GENERAL');
    assert.equal(config.nonTaxableFlat, undefined);
    assert.equal(config.nonTaxableDivisor, 3);
    assert.equal(config.nonTaxableCap, 500_000);
  });
});
