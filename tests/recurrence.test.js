import { describe, it, expect } from 'vitest';
import { normaliseRule, occursOn, occurrencesFor, occurrenceId, countBefore, describeRule, sameRule, daysBetween }
  from '../src/utils/recurrence.js';

const R = (r) => normaliseRule({ startDate: '2026-10-01', ...r });   // Thu 1 Oct 2026

describe('recurrence rules', () => {
  it('daily: every day from the start, never before', () => {
    const r = R({ freq: 'daily' });
    expect(occursOn(r, '2026-09-30')).toBe(false);
    expect(occursOn(r, '2026-10-01')).toBe(true);
    expect(occursOn(r, '2027-03-14')).toBe(true);
  });

  it('weekly on chosen days (defaults to the start weekday)', () => {
    const mwf = R({ freq: 'weekly', weekdays: [1, 3, 5] });
    expect(['2026-10-05', '2026-10-07', '2026-10-09'].every(d => occursOn(mwf, d))).toBe(true);
    expect(occursOn(mwf, '2026-10-06')).toBe(false);
    expect(R({ freq: 'weekly' }).weekdays).toEqual([4]);
  });

  it('every N days counts from the start date across DST', () => {
    const r = R({ freq: 'interval', interval: 3 });
    expect(occursOn(r, '2026-10-04')).toBe(true);
    expect(occursOn(r, '2026-10-05')).toBe(false);
    expect(occursOn(r, '2026-11-03')).toBe(true);     // 33 days, crosses US DST end
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('monthly uses the last day in short months', () => {
    const r = normaliseRule({ freq: 'monthly', startDate: '2026-01-31' });
    expect(r.monthDay).toBe(31);
    expect(occursOn(r, '2026-02-28')).toBe(true);
    expect(occursOn(r, '2026-04-30')).toBe(true);
    expect(occursOn(r, '2026-05-31')).toBe(true);
    expect(occursOn(r, '2026-05-30')).toBe(false);
  });

  it('ends on a date or after N times', () => {
    const until = R({ freq: 'daily', endDate: '2026-10-03' });
    expect(occursOn(until, '2026-10-03')).toBe(true);
    expect(occursOn(until, '2026-10-04')).toBe(false);
    const three = R({ freq: 'weekly', weekdays: [4], count: 3 });
    expect(countBefore(three, '2026-10-15')).toBe(2);
    expect(occursOn(three, '2026-10-15')).toBe(true);
    expect(occursOn(three, '2026-10-22')).toBe(false);
  });

  it('several times a day → one occurrence per time, sorted, with local reminders', () => {
    const s = { id: 's1', title: 'Meds', notes: '', createdAt: 100, updatedAt: 5,
      rule: R({ freq: 'daily', times: ['21:00', '09:00', '09:00', 'bad'] }) };
    expect(s.rule.times).toEqual(['09:00', '21:00']);
    const occ = occurrencesFor(s, '2026-10-02');
    expect(occ.map(o => o.id)).toEqual([occurrenceId('s1', '2026-10-02', 0), occurrenceId('s1', '2026-10-02', 1)]);
    expect(new Date(occ[0].reminderAt).getHours()).toBe(9);
    expect(new Date(occ[1].reminderAt).getHours()).toBe(21);
    expect(occ[0]).toMatchObject({ seriesId: 's1', slot: 0, date: '2026-10-02', title: 'Meds', done: false, order: 100 });
    expect(occurrencesFor({ ...s, deleted: true }, '2026-10-02')).toEqual([]);
    expect(occurrencesFor({ ...s, rule: R({ freq: 'daily' }) }, '2026-10-02')[0].reminderAt).toBeNull();
  });

  it('normalises bad input', () => {
    const r = normaliseRule({ freq: 'yearly', interval: -2, weekdays: [9, 1, 1], monthDay: 99, count: 0, startDate: '2026-10-01' });
    expect(r).toMatchObject({ freq: 'daily', interval: 1, weekdays: [], monthDay: 1, count: null, endDate: null });
    expect(normaliseRule({ freq: 'weekly', weekdays: [9, 1, 1], startDate: '2026-10-01' }).weekdays).toEqual([1]);
    expect(normaliseRule({ freq: 'monthly', monthDay: 99, startDate: '2026-10-01' }).monthDay).toBe(31);
    expect(normaliseRule({ freq: 'interval', interval: 999, startDate: '2026-10-01' }).interval).toBe(365);
  });

  it('describeRule + sameRule', () => {
    expect(describeRule(R({ freq: 'daily' }))).toBe('Daily');
    expect(describeRule(R({ freq: 'daily', times: ['09:00', '13:00'] }))).toBe('Daily · 2× a day');
    expect(describeRule(R({ freq: 'weekly', weekdays: [1, 3] }))).toBe('Every Mon, Wed');
    expect(describeRule(R({ freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Daily');
    expect(describeRule(R({ freq: 'interval', interval: 3, count: 5 }))).toBe('Every 3 days · 5 times');
    expect(describeRule(R({ freq: 'interval', interval: 1 }))).toBe('Daily');
    expect(describeRule(R({ freq: 'monthly', monthDay: 22, endDate: '2027-01-01' }))).toBe('Monthly on the 22nd · until Jan 1');
    expect(describeRule(R({ freq: 'monthly', monthDay: 11 }))).toBe('Monthly on the 11th');
    expect(describeRule(null)).toBe('');
    expect(sameRule(R({ freq: 'daily' }), { ...R({ freq: 'daily' }), startDate: '2026-12-01' })).toBe(true);
    expect(sameRule(R({ freq: 'daily' }), R({ freq: 'daily', times: ['09:00'] }))).toBe(false);
    expect(sameRule(null, null)).toBe(true);
  });
});
