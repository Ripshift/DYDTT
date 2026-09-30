import { describe, it, expect, beforeEach } from 'vitest';
import { db, openDb, upsertTask, getTask, getTasksForDate, deleteTask, getWeeklySummary } from '../src/db/schema.js';

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
});

describe('upsertTask', () => {
  it('creates a task with defaults', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'A' });
    expect(typeof t.id).toBe('string');
    expect(t.done).toBe(false);
    expect(t.syncStatus).toBe('pending-upsert');
    expect(await getTask(t.id)).toMatchObject({ title: 'A' });
  });

  it('merges a partial update into the existing record', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'A', done: true, order: 5, priority: 1, tags: ['home'] });
    await upsertTask({ id: t.id, title: 'B', order: undefined });
    const after = await getTask(t.id);
    expect(after).toMatchObject({ title: 'B', done: true, order: 5, priority: 1, tags: ['home'], createdAt: t.createdAt });
  });

  it('lets null clear a field (e.g. removing a reminder)', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'A', reminderAt: 123 });
    await upsertTask({ id: t.id, reminderAt: null });
    expect((await getTask(t.id)).reminderAt).toBeNull();
  });
});

describe('queries', () => {
  it('getTasksForDate sorts by order', async () => {
    await upsertTask({ date: '2026-10-01', title: 'second', order: 2 });
    await upsertTask({ date: '2026-10-01', title: 'first',  order: 1 });
    await upsertTask({ date: '2026-10-02', title: 'other day' });
    expect((await getTasksForDate('2026-10-01')).map(t => t.title)).toEqual(['first', 'second']);
  });

  it('getWeeklySummary counts totals and done, ignoring soft-deleted', async () => {
    await upsertTask({ date: '2026-10-01', title: 'a', done: true });
    await upsertTask({ date: '2026-10-01', title: 'b' });
    const gone = await upsertTask({ date: '2026-10-01', title: 'c' });
    await deleteTask(gone.id);
    expect(await getWeeklySummary(['2026-10-01', '2026-10-02'])).toEqual({
      '2026-10-01': { total: 2, done: 1 },
      '2026-10-02': { total: 0, done: 0 },
    });
  });
});
