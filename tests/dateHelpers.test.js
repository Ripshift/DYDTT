import { describe, it, expect } from 'vitest';
import { addDays, localDateStr, getWeekGridDates, buildReminderTs } from '../src/utils/dateHelpers.js';

describe('dateHelpers', () => {
  it.each([
    ['2026-10-24',  1, '2026-10-25'],   // EU DST ends
    ['2026-10-31',  1, '2026-11-01'],   // month boundary
    ['2026-11-01',  1, '2026-11-02'],   // US DST ends
    ['2026-03-08', -1, '2026-03-07'],   // US DST starts
    ['2026-12-31',  1, '2027-01-01'],   // year boundary
    ['2026-03-01', -1, '2026-02-28'],
  ])('addDays(%s, %i) = %s', (start, n, want) => {
    expect(addDays(start, n)).toBe(want);
  });

  it('localDateStr uses local, not UTC, date parts', () => {
    expect(localDateStr(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
  });

  it('getWeekGridDates returns 9 days centred on the date', () => {
    const d = getWeekGridDates('2026-10-01');
    expect(d).toHaveLength(9);
    expect(d[0]).toBe('2026-09-27');
    expect(d[4]).toBe('2026-10-01');
    expect(d[8]).toBe('2026-10-05');
  });

  it('buildReminderTs builds a LOCAL date + time', () => {
    const r = new Date(buildReminderTs('2026-10-01', '09:30'));
    expect([r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes()])
      .toEqual([2026, 9, 1, 9, 30]);
  });

  it('buildReminderTs returns null without a time', () => {
    expect(buildReminderTs('2026-10-01', '')).toBeNull();
  });
});
