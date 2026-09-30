import { describe, it, expect, beforeEach } from 'vitest';
import { db, openDb, getTask } from '../src/db/schema.js';
import { store } from '../src/store.js';

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await store.dispatch('NAV_TO_DATE', { date: '2026-10-01' });
});

describe('store navigation', () => {
  it.each([
    ['2026-10-31', 'NAV_NEXT_DAY', '2026-11-01'],
    ['2026-11-01', 'NAV_NEXT_DAY', '2026-11-02'],
    ['2026-12-31', 'NAV_NEXT_DAY', '2027-01-01'],
    ['2026-03-08', 'NAV_PREV_DAY', '2026-03-07'],
  ])('%s + %s → %s', async (start, action, want) => {
    await store.dispatch('NAV_TO_DATE', { date: start });
    await store.dispatch(action);
    expect(store.state.currentDate).toBe(want);
  });
});

describe('store tasks', () => {
  it('TASK_UPSERT adds to the current day', async () => {
    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Walk dog' });
    expect(store.state.tasks.map(t => t.title)).toEqual(['Walk dog']);
    expect(store.state.weeklySummary['2026-10-01']).toEqual({ total: 1, done: 0 });
  });

  it('TASK_TOGGLE flips done', async () => {
    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Walk dog' });
    const id = store.state.tasks[0].id;
    await store.dispatch('TASK_TOGGLE', { id });
    expect((await getTask(id)).done).toBe(true);
  });

  it('TASK_TOGGLE works for a task on another day (48h view)', async () => {
    await store.dispatch('TASK_UPSERT', { date: '2026-10-02', title: 'Tomorrow' });
    const [t] = await db.tasks.where('date').equals('2026-10-02').toArray();
    await store.dispatch('TASK_TOGGLE', { id: t.id });
    expect((await getTask(t.id)).done).toBe(true);
  });

  it('TASK_DELETE hides the task', async () => {
    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Walk dog' });
    await store.dispatch('TASK_DELETE', { id: store.state.tasks[0].id });
    expect(store.state.tasks).toEqual([]);
  });
});
