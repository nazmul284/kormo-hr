import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BD_EARNING_COMPONENTS, bdTaxConfig } from './bd-presets';
import {
  applySlabs,
  buildGrossTimeline,
  computeTax,
  fiscalYearLabel,
  fiscalYearRange,
} from './engine';

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
    components: BD_EARNING_COMPONENTS,
    bonuses: [{ label: 'Festival Bonus', amount: 85_000 }],
    payments: [
      { month: 7, year: 2026, amount: 1_430 },
      { month: 8, year: 2026, amount: 1_758 },
    ],
    asOf: '2026-09-15',
    config: bdTaxConfig('2026-27', 'GENERAL'),
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
    components: BD_EARNING_COMPONENTS,
    asOf: '2026-07-01',
    config: bdTaxConfig('2026-27', 'GENERAL'),
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
      config: bdTaxConfig('2026-27', 'FEMALE'),
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
    const { rows, totalTax } = applySlabs(500_000, bdTaxConfig('2026-27').slabs);
    assert.equal(rows.length, 6);
    assert.equal(totalTax, 10_000); // 100,000 into the 10% band
    assert.equal(rows[5].taxableInSlab, 0);
  });

  it('absorbs the balance in the open-ended top band', () => {
    const { totalTax } = applySlabs(10_000_000, bdTaxConfig('2026-27').slabs);
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
  it('labels July onwards as the new fiscal year', () => {
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 6, 1))), '2026-27');
    assert.equal(fiscalYearLabel(new Date(Date.UTC(2026, 5, 30))), '2025-26');
  });

  it('derives the fiscal year window', () => {
    assert.deepEqual(fiscalYearRange('2026-27'), {
      start: '2026-07-01',
      end: '2027-06-30',
    });
  });
});
