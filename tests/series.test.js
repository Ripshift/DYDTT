import { describe, it, expect, beforeEach } from 'vitest';
import { db, openDb, getTask, getSeries, getLiveTasksForDate, isLive, setSyncActive, clearDay, wipeAll,
  upsertTask, queuedCount } from '../src/db/schema.js';
import { createFromForm, editOneTime, editOccurrence, removeTask, ruleFromForm, formFromSeries }
  from '../src/tasks/taskService.js';
import { occurrenceId } from '../src/utils/recurrence.js';

const F = (over = {}) => ({ title: 'Walk dog', notes: '', date: '2026-10-01', time: '', repeat: { freq: 'none' }, ...over });
const titles = async (d) => (await getLiveTasksForDate(d)).map(t => t.title);

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.syncQueue.clear()]);
  setSyncActive(false);
});

describe('form ⇄ rule', () => {
  it('maps the repeat section', () => {
    expect(ruleFromForm(F())).toBeNull();
    expect(ruleFromForm(F({ time: '07:30', repeat: { freq: 'daily', ends: 'count', count: 4 } })))
      .toMatchObject({ freq: 'daily', times: ['07:30'], count: 4, endDate: null });
    expect(ruleFromForm(F({ repeat: { freq: 'several', times: ['09:00', '', '18:00'], ends: 'date', endDate: '2026-12-01' } })))
      .toMatchObject({ freq: 'daily', times: ['09:00', '18:00'], endDate: '2026-12-01' });
    const back = formFromSeries({ title: 'x', rule: ruleFromForm(F({ repeat: { freq: 'several', times: ['09:00', '18:00'] } })) });
    expect(back.repeat).toMatchObject({ freq: 'several', times: ['09:00', '18:00'], ends: 'never' });
    const weekly = formFromSeries({ title: 'x', rule: ruleFromForm(F({ time: '08:00', repeat: { freq: 'weekly', weekdays: [1], ends: 'count', count: 3 } })) });
    expect(weekly).toMatchObject({ time: '08:00', repeat: { freq: 'weekly', weekdays: [1], ends: 'count', count: 3 } });
  });
});

describe('repeating tasks', () => {
  it('creates a series whose copies appear on matching days only', async () => {
    await createFromForm(F({ title: 'Gym', repeat: { freq: 'weekly', weekdays: [1, 3] } }));
    expect(await titles('2026-10-05')).toEqual(['Gym']);   // Mon
    expect(await titles('2026-10-06')).toEqual([]);        // Tue
    expect(await titles('2026-09-28')).toEqual([]);        // before start
  });

  it('several times a day → one copy per time', async () => {
    await createFromForm(F({ title: 'Meds', repeat: { freq: 'several', times: ['09:00', '21:00'] } }));
    const day = await getLiveTasksForDate('2026-10-02');
    expect(day).toHaveLength(2);
    expect(day.map(t => new Date(t.reminderAt).getHours())).toEqual([9, 21]);
  });

  it('each day keeps its own done state', async () => {
    const { series } = await createFromForm(F({ repeat: { freq: 'daily' } }));
    await getLiveTasksForDate('2026-10-01');
    await upsertTask({ id: occurrenceId(series.id, '2026-10-01', 0), done: true });
    expect((await getLiveTasksForDate('2026-10-01'))[0].done).toBe(true);
    expect((await getLiveTasksForDate('2026-10-02'))[0].done).toBe(false);
  });

  it('edit "just this one" changes only that day', async () => {
    const { series } = await createFromForm(F({ repeat: { freq: 'daily' } }));
    const [occ] = await getLiveTasksForDate('2026-10-03');
    await editOccurrence(occ, F({ title: 'Walk dog (long)', date: '2026-10-03', repeat: { freq: 'daily' } }), 'this');
    expect(await titles('2026-10-03')).toEqual(['Walk dog (long)']);
    expect(await titles('2026-10-04')).toEqual(['Walk dog']);
    expect((await getSeries(series.id)).title).toBe('Walk dog');
  });

  it('edit "this and future" splits the series and keeps the past', async () => {
    const { series } = await createFromForm(F({ repeat: { freq: 'daily' } }));
    await getLiveTasksForDate('2026-10-02');
    await upsertTask({ id: occurrenceId(series.id, '2026-10-05', 0), date: '2026-10-05', seriesId: series.id, slot: 0, title: 'Walk dog', done: true });
    const [occ] = await getLiveTasksForDate('2026-10-05');
    const { series: next } = await editOccurrence(occ,
      F({ title: 'Run', date: '2026-10-05', time: '06:00', repeat: { freq: 'daily' } }), 'future');

    expect(await titles('2026-10-02')).toEqual(['Walk dog']);
    expect(await titles('2026-10-04')).toEqual(['Walk dog']);
    expect(await titles('2026-10-05')).toEqual(['Run']);
    expect(await titles('2026-10-09')).toEqual(['Run']);
    expect((await getSeries(series.id)).rule.endDate).toBe('2026-10-04');
    expect((await getLiveTasksForDate('2026-10-05'))[0].done).toBe(true);         // done carried over
    expect(new Date((await getLiveTasksForDate('2026-10-06'))[0].reminderAt).getHours()).toBe(6);
    expect(next.rule.startDate).toBe('2026-10-05');
  });

  it('"this and future" from the first day replaces the series; switching to no repeat leaves a one-time task', async () => {
    const { series } = await createFromForm(F({ repeat: { freq: 'daily' } }));
    const [first] = await getLiveTasksForDate('2026-10-01');
    await editOccurrence(first, F({ title: 'Once', repeat: { freq: 'none' } }), 'future');
    expect((await getSeries(series.id)).deleted).toBe(true);
    expect(await titles('2026-10-01')).toEqual(['Once']);
    expect(await titles('2026-10-02')).toEqual([]);
  });

  it('"ends after N times" keeps counting across a split', async () => {
    await createFromForm(F({ repeat: { freq: 'daily', ends: 'count', count: 5 } }));
    const [occ] = await getLiveTasksForDate('2026-10-03');
    const { series } = await editOccurrence(occ, F({ title: 'New', date: '2026-10-03', repeat: { freq: 'daily', ends: 'count', count: 5 } }), 'future');
    expect(series.rule.count).toBe(3);
    expect(await titles('2026-10-05')).toEqual(['New']);
    expect(await titles('2026-10-06')).toEqual([]);
  });

  it('turning a one-time task into a repeat keeps its done state', async () => {
    const { task } = await createFromForm(F());
    await upsertTask({ id: task.id, done: true });
    await editOneTime(await getTask(task.id), F({ repeat: { freq: 'daily' } }));
    expect(isLive(await getTask(task.id))).toBe(false);
    const [today] = await getLiveTasksForDate('2026-10-01');
    expect(today).toMatchObject({ title: 'Walk dog', done: true });
    expect(await titles('2026-10-02')).toEqual(['Walk dog']);
  });

  it('delete: just this one / this and future / all', async () => {
    const { series } = await createFromForm(F({ repeat: { freq: 'daily' } }));
    await removeTask((await getLiveTasksForDate('2026-10-03'))[0], 'this');
    expect(await titles('2026-10-03')).toEqual([]);
    expect(await titles('2026-10-04')).toEqual(['Walk dog']);

    await removeTask((await getLiveTasksForDate('2026-10-06'))[0], 'future');
    expect(await titles('2026-10-05')).toEqual(['Walk dog']);
    expect(await titles('2026-10-06')).toEqual([]);
    expect(await titles('2026-10-20')).toEqual([]);

    await removeTask((await getLiveTasksForDate('2026-10-02'))[0], 'all');
    expect(await titles('2026-10-01')).toEqual([]);
    expect((await getSeries(series.id)).deleted).toBe(true);
  });

  it('deleting a one-time task ignores the scope', async () => {
    const { task } = await createFromForm(F());
    await removeTask(task, 'all');
    expect(await titles('2026-10-01')).toEqual([]);
  });
});

describe('clear + wipe', () => {
  it('clearDay removes that day only (repeats do not come back there)', async () => {
    await createFromForm(F({ title: 'One-off' }));
    await createFromForm(F({ title: 'Daily', repeat: { freq: 'daily' } }));
    expect(await clearDay('2026-10-01')).toBe(2);
    expect(await titles('2026-10-01')).toEqual([]);
    expect(await titles('2026-10-02')).toEqual(['Daily']);
  });

  it('wipeAll signed out: hard delete everything', async () => {
    await createFromForm(F());
    await createFromForm(F({ repeat: { freq: 'daily' } }));
    await wipeAll();
    expect(await db.tasks.count()).toBe(0);
    expect(await db.series.count()).toBe(0);
  });

  it('wipeAll signed in: tombstones + queued for upload', async () => {
    setSyncActive(true);
    await createFromForm(F());
    await createFromForm(F({ repeat: { freq: 'daily' } }));
    await getLiveTasksForDate('2026-10-01');   // generate a copy (local only)
    await db.syncQueue.clear();
    await wipeAll();
    expect((await db.tasks.toArray()).every(t => t.deleted)).toBe(true);
    expect((await db.series.toArray()).every(s => s.deleted)).toBe(true);
    expect(await db.tasks.filter(t => t.generated).count()).toBe(0);
    expect(await queuedCount()).toBe(2);
    expect(await titles('2026-10-05')).toEqual([]);
  });

  it('changes are only queued while sync is active', async () => {
    await createFromForm(F());
    expect(await queuedCount()).toBe(0);
    setSyncActive(true);
    await createFromForm(F({ title: 'B' }));
    expect(await queuedCount()).toBe(1);
  });
});
