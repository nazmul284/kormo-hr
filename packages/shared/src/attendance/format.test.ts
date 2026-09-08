import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePunch, hhmmToMinutes, minutesToHm, serviceLength, shiftLabel, to12h } from './format';

describe('minutesToHm', () => {
  it('formats hours and minutes', () => {
    assert.equal(minutesToHm(0), '0:00');
    assert.equal(minutesToHm(9), '0:09');
    assert.equal(minutesToHm(545), '9:05');
  });
  it('shows a dash for missing data rather than 0:00', () => {
    assert.equal(minutesToHm(null), '--');
    assert.equal(minutesToHm(undefined), '--');
  });
});

describe('to12h / shiftLabel', () => {
  it('renders the reference shift label format', () => {
    assert.equal(shiftLabel('General', '10:00', '19:00'), 'General(10am-07pm)');
  });
  it('keeps minutes when non-zero', () => {
    assert.equal(to12h('09:30'), '09:30am');
    assert.equal(to12h('00:00'), '12am');
  });
});

describe('evaluatePunch', () => {
  const shift = {
    shiftStartMinutes: hhmmToMinutes('10:00'),
    shiftEndMinutes: hhmmToMinutes('19:00'),
    graceMinutes: 15,
    breakMinutes: 60,
    isNightShift: false,
  };

  it('forgives arrival inside the grace period', () => {
    const r = evaluatePunch({ ...shift, inMinutes: hhmmToMinutes('10:12'), outMinutes: hhmmToMinutes('19:00') });
    assert.equal(r.lateMinutes, 0);
  });

  it('counts late minutes past the grace period', () => {
    const r = evaluatePunch({ ...shift, inMinutes: hhmmToMinutes('10:45'), outMinutes: hhmmToMinutes('19:00') });
    assert.equal(r.lateMinutes, 30);
  });

  it('nets the break out of worked hours', () => {
    const r = evaluatePunch({ ...shift, inMinutes: hhmmToMinutes('10:00'), outMinutes: hhmmToMinutes('19:00') });
    assert.equal(r.workMinutes, 480); // 9h on site − 1h break
    assert.equal(r.overtimeMinutes, 0);
  });

  it('credits overtime past the scheduled day', () => {
    const r = evaluatePunch({ ...shift, inMinutes: hhmmToMinutes('10:00'), outMinutes: hhmmToMinutes('21:30') });
    assert.equal(r.overtimeMinutes, 150);
  });

  it('handles an overnight shift crossing midnight', () => {
    const r = evaluatePunch({
      inMinutes: hhmmToMinutes('22:00'),
      outMinutes: hhmmToMinutes('06:00'),
      shiftStartMinutes: hhmmToMinutes('22:00'),
      shiftEndMinutes: hhmmToMinutes('06:00'),
      graceMinutes: 15,
      breakMinutes: 60,
      isNightShift: true,
    });
    assert.equal(r.workMinutes, 420); // 8h on site − 1h break
    assert.equal(r.lateMinutes, 0);
  });

  it('reports nothing worked when the employee never clocked out', () => {
    const r = evaluatePunch({ ...shift, inMinutes: hhmmToMinutes('10:00'), outMinutes: null });
    assert.equal(r.workMinutes, 0);
  });
});

describe('serviceLength', () => {
  it('computes calendar-aware y/m/d', () => {
    const r = serviceLength('2022-03-15', '2026-09-08');
    assert.equal(r.years, 4);
    assert.equal(r.months, 5);
    assert.equal(r.days, 24);
    assert.equal(r.label, '4 years 5 months 24 days');
  });

  it('handles an exact month boundary', () => {
    const r = serviceLength('2026-01-01', '2026-03-01');
    assert.equal(r.years, 0);
    assert.equal(r.months, 2);
    assert.equal(r.days, 0);
  });

  it('shows days only for a brand new joiner', () => {
    const r = serviceLength('2026-09-01', '2026-09-08');
    assert.equal(r.label, '7 days');
  });

  it('does not go negative for a future joining date', () => {
    assert.equal(serviceLength('2030-01-01', '2026-09-08').label, '--');
  });
});
