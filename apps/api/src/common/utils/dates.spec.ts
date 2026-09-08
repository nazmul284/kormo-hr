import {
  addDays, atLocalTime, dateOnly, eachDate, endOfMonth, localMinutes, monthWindow,
  startOfMonth, startOfWeek, toIsoDate,
} from './dates';

describe('dateOnly', () => {
  /*
   * Calendar days are anchored at UTC noon so that no server timezone can
   * roll them backwards or forwards — the classic "attendance shifted by
   * one day" bug.
   */
  it('anchors a calendar day at UTC noon', () => {
    const day = dateOnly('2026-09-08');
    expect(day.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('round-trips through toIsoDate', () => {
    expect(toIsoDate(dateOnly('2026-01-31'))).toBe('2026-01-31');
    expect(toIsoDate(dateOnly('2026-12-31'))).toBe('2026-12-31');
  });

  it('ignores any time component it is handed', () => {
    expect(toIsoDate(dateOnly('2026-09-08T23:45:00Z'))).toBe('2026-09-08');
  });
});

describe('atLocalTime', () => {
  /*
   * This is what a booking, punch or meal timestamp is built from, and the
   * bug it guards against is real: querying timestamp columns with a
   * UTC-noon date anchor selects the wrong 24 hours, so a 15:00 Dhaka
   * booking lands in the neighbouring day and the grid renders empty.
   */
  it('builds the correct instant for a Dhaka wall-clock time', () => {
    // 10:00 in Dhaka (UTC+6) is 04:00 UTC on the same date.
    expect(atLocalTime(dateOnly('2026-09-08'), '10:00').toISOString())
      .toBe('2026-09-08T04:00:00.000Z');
  });

  it('puts local midnight on the previous UTC day', () => {
    // 00:00 Dhaka on the 8th is 18:00 UTC on the 7th.
    expect(atLocalTime(dateOnly('2026-09-08'), '00:00').toISOString())
      .toBe('2026-09-07T18:00:00.000Z');
  });

  it('brackets a full local day as exactly 24 hours', () => {
    const from = atLocalTime(dateOnly('2026-09-08'), '00:00');
    const to = atLocalTime(addDays(dateOnly('2026-09-08'), 1), '00:00');
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('places a 15:00 local booking inside that local day, not the next', () => {
    const from = atLocalTime(dateOnly('2026-09-08'), '00:00');
    const to = atLocalTime(addDays(dateOnly('2026-09-08'), 1), '00:00');
    const booking = atLocalTime(dateOnly('2026-09-08'), '15:00');
    expect(booking >= from && booking < to).toBe(true);
  });

  it('round-trips through localMinutes', () => {
    expect(localMinutes(atLocalTime(dateOnly('2026-09-08'), '09:30'))).toBe(9 * 60 + 30);
    expect(localMinutes(atLocalTime(dateOnly('2026-09-08'), '00:00'))).toBe(0);
    expect(localMinutes(atLocalTime(dateOnly('2026-09-08'), '23:59'))).toBe(23 * 60 + 59);
  });
});

describe('month and week windows', () => {
  it('spans a whole month inclusively', () => {
    const { start, end } = monthWindow(2, 2026);
    expect(toIsoDate(start)).toBe('2026-02-01');
    expect(toIsoDate(end)).toBe('2026-02-28');
  });

  it('handles a leap February', () => {
    expect(toIsoDate(monthWindow(2, 2028).end)).toBe('2028-02-29');
  });

  it('handles December without rolling the year', () => {
    const { start, end } = monthWindow(12, 2026);
    expect(toIsoDate(start)).toBe('2026-12-01');
    expect(toIsoDate(end)).toBe('2026-12-31');
  });

  it('agrees with startOfMonth / endOfMonth', () => {
    const anchor = dateOnly('2026-09-17');
    expect(toIsoDate(startOfMonth(anchor))).toBe('2026-09-01');
    expect(toIsoDate(endOfMonth(anchor))).toBe('2026-09-30');
  });

  it('starts the week on Sunday, as the Bangladeshi work week does', () => {
    // 2026-09-08 is a Tuesday.
    expect(toIsoDate(startOfWeek(dateOnly('2026-09-08')))).toBe('2026-09-06');
    // A Sunday is its own week start.
    expect(toIsoDate(startOfWeek(dateOnly('2026-09-06')))).toBe('2026-09-06');
  });
});

describe('eachDate', () => {
  it('is inclusive of both ends', () => {
    const days = eachDate(dateOnly('2026-09-08'), dateOnly('2026-09-10'));
    expect(days.map(toIsoDate)).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
  });

  it('crosses a month boundary', () => {
    const days = eachDate(dateOnly('2026-01-30'), dateOnly('2026-02-02'));
    expect(days.map(toIsoDate)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('returns a single day for an identical range', () => {
    expect(eachDate(dateOnly('2026-09-08'), dateOnly('2026-09-08'))).toHaveLength(1);
  });

  it('returns nothing for an inverted range', () => {
    expect(eachDate(dateOnly('2026-09-10'), dateOnly('2026-09-08'))).toEqual([]);
  });
});
