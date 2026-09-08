import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bradfordBand, bradfordFactor, computeLeaveDays, proRateEntitlement } from './day-math';

describe('computeLeaveDays', () => {
  it('excludes the Friday/Saturday weekend by default', () => {
    // 2026-09-07 is a Monday; the range runs Mon → Sun.
    const r = computeLeaveDays('2026-09-07', '2026-09-13');
    assert.equal(r.calendarDays, 7);
    assert.equal(r.weekendCount, 2);
    assert.equal(r.leaveDays, 5);
  });

  it('excludes holidays that fall inside the range', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-10', {
      holidays: [{ startDate: '2026-09-08', endDate: '2026-09-09' }],
    });
    assert.equal(r.calendarDays, 4);
    assert.equal(r.holidayCount, 2);
    assert.equal(r.leaveDays, 2);
  });

  it('burns weekends and holidays when the type counts them', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-13', { countsHolidays: true });
    assert.equal(r.leaveDays, 7);
  });

  it('charges half a day for a single-day half request', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-07', { dayPart: 'FIRST_HALF' });
    assert.equal(r.leaveDays, 0.5);
  });

  it('ignores a half-day request spanning multiple days', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-08', { dayPart: 'FIRST_HALF' });
    assert.equal(r.leaveDays, 2);
  });

  it('returns nothing for an inverted range', () => {
    const r = computeLeaveDays('2026-09-10', '2026-09-01');
    assert.equal(r.calendarDays, 0);
    assert.equal(r.leaveDays, 0);
  });

  it('honours a custom weekend (Sat/Sun)', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-13', { weekendDays: [0, 6] });
    assert.equal(r.leaveDays, 5);
    assert.equal(r.weekendCount, 2);
  });

  it('treats roster off-days as non-chargeable', () => {
    const r = computeLeaveDays('2026-09-07', '2026-09-09', {
      weekendDays: [],
      rosterOffDates: ['2026-09-08'],
    });
    assert.equal(r.leaveDays, 2);
  });
});

describe('proRateEntitlement', () => {
  it('gives the full entitlement to someone employed all year', () => {
    assert.equal(proRateEntitlement(18, '2020-01-01', 2026), 18);
  });

  it('pro-rates a mid-year joiner to a fractional balance', () => {
    // Joined 1 July 2026 → 184 of 365 days served.
    const v = proRateEntitlement(18, '2026-07-01', 2026);
    assert.ok(v > 9 && v < 9.2, `expected ~9.07, got ${v}`);
  });

  it('pro-rates a leaver', () => {
    const v = proRateEntitlement(12, '2020-01-01', 2026, '2026-06-30');
    assert.ok(v > 5.9 && v < 6.1, `expected ~5.98, got ${v}`);
  });

  it('returns zero for someone who joins after the year ends', () => {
    assert.equal(proRateEntitlement(18, '2027-03-01', 2026), 0);
  });
});

describe('bradfordFactor', () => {
  it('penalises frequent short absences over one long one', () => {
    const long = bradfordFactor([{ startDate: '2026-01-05', endDate: '2026-01-18' }]);
    const frequent = bradfordFactor(
      Array.from({ length: 7 }, (_, i) => ({
        startDate: `2026-0${i + 1}-05`,
        endDate: `2026-0${i + 1}-05`,
      })),
    );
    assert.equal(long.totalDays, 14);
    assert.equal(long.score, 14); // 1² × 14
    assert.equal(frequent.score, 343); // 7² × 7
    assert.ok(frequent.score > long.score);
  });

  it('bands the score', () => {
    assert.equal(bradfordBand(14), 'ok');
    assert.equal(bradfordBand(120), 'watch');
    assert.equal(bradfordBand(343), 'concern');
    assert.equal(bradfordBand(900), 'critical');
  });
});
