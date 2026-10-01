import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, openDb, getSetting, setSetting, setSyncActive, upsertTask, getTask, queuedCount,
  getLiveTasksForDate } from '../src/db/schema.js';
import { createSyncEngine, toRemote, TASK_FIELDS } from '../src/sync/syncEngine.js';
import { createFromForm } from '../src/tasks/taskService.js';

/** In-memory stand-in for Firestore. */
function fakeCloud() {
  const store = { tasks: new Map(), series: new Map() };
  let clock = 1000;
  const listeners = [];
  const adapter = {
    pushes: [],
    async push(uid, { tasks = [], series = [] }) {
      adapter.pushes.push({ tasks, series });
      for (const [col, docs] of [['tasks', tasks], ['series', series]]) {
        for (const d of docs) store[col].set(d.id, { ...d, syncedAt: ++clock });
      }
      notify();
    },
    async fetchAll() {
      return { tasks: [...store.tasks.values()], series: [...store.series.values()] };
    },
    subscribe(uid, since, onDocs) {
      const l = { since: { ...since }, onDocs };
      listeners.push(l);
      emit(l);
      return () => listeners.splice(listeners.indexOf(l), 1);
    },
    /** Simulate another device writing. */
    remoteWrite(col, doc) { store[col].set(doc.id, { ...doc, syncedAt: ++clock }); notify(); },
    store,
  };
  function emit(l) {
    for (const [kind, col] of [['task', 'tasks'], ['series', 'series']]) {
      const docs = [...store[col].values()].filter(d => d.syncedAt > l.since[kind]);
      if (docs.length) {
        const latest = Math.max(...docs.map(d => d.syncedAt));
        l.since[kind] = latest;
        l.onDocs(kind, docs, latest);
      }
    }
  }
  function notify() { listeners.forEach(emit); }
  return adapter;
}

const setOnline = (v) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const T = (over = {}) => ({ date: '2026-10-01', title: 'Walk dog', ...over });

let cloud, onRemote, statuses;
function engine(opts = {}) {
  return createSyncEngine({ adapter: cloud, onRemoteChange: onRemote, onStatus: s => statuses.push(s), ...opts });
}

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.syncQueue.clear(), db.settings.clear()]);
  setSyncActive(false);
  cloud = fakeCloud();
  onRemote = vi.fn();
  statuses = [];
});

describe('toRemote', () => {
  it('keeps only allowed fields', () => {
    const r = toRemote({ id: 'a', date: '2026-10-01', title: 'x'.repeat(300), done: false, updatedAt: 1,
      syncStatus: 'pending-upsert', generated: true, junk: 1, notes: undefined }, TASK_FIELDS);
    expect(Object.keys(r).sort()).toEqual(['date', 'day', 'deleted', 'done', 'id', 'private', 'title', 'updatedAt']);
    expect(r).toMatchObject({ private: false, day: 20727 });
    expect(r.title).toHaveLength(255);
  });
});

describe('sync engine', () => {
  it('fresh device + empty account: links, then uploads every change', async () => {
    const e = engine();
    await e.start('u1');
    expect(await getSetting('syncUid')).toBe('u1');
    const t = await upsertTask(T());
    await e.drain();
    expect(cloud.store.tasks.get(t.id)).toMatchObject({ title: 'Walk dog', deleted: false });
    expect(cloud.store.tasks.get(t.id).syncStatus).toBeUndefined();
    expect((await getTask(t.id)).syncStatus).toBe('synced');
    expect(await queuedCount()).toBe(0);
    expect(statuses.at(-1)).toMatchObject({ status: 'idle', pending: 0 });
  });

  it('pulls tasks from the account, and latest edit wins', async () => {
    cloud.remoteWrite('tasks', { id: 'r1', date: '2026-10-01', title: 'From phone', done: false, updatedAt: 500, deleted: false });
    const e = engine();
    await e.start('u1');
    await tick();
    expect((await getTask('r1')).title).toBe('From phone');
    expect(onRemote).toHaveBeenCalled();

    // Older remote edit loses to a newer local, pending edit
    await upsertTask({ id: 'r1', title: 'Edited here' });
    cloud.remoteWrite('tasks', { id: 'r1', date: '2026-10-01', title: 'Old phone edit', done: false, updatedAt: 600, deleted: false });
    await tick();
    expect((await getTask('r1')).title).toBe('Edited here');

    // Newer remote edit wins
    await e.drain();
    cloud.remoteWrite('tasks', { id: 'r1', date: '2026-10-01', title: 'New phone edit', done: true, updatedAt: Date.now() + 10_000, deleted: false });
    await tick();
    expect((await getTask('r1'))).toMatchObject({ title: 'New phone edit', done: true });

    // Remote delete
    cloud.remoteWrite('tasks', { id: 'r1', date: '2026-10-01', title: 'x', done: true, updatedAt: Date.now() + 20_000, deleted: true });
    await tick();
    expect(await getLiveTasksForDate('2026-10-01')).toEqual([]);
  });

  it('first sign-in with local tasks: discard → device shows the account', async () => {
    await upsertTask(T({ title: 'Local only' }));
    cloud.remoteWrite('tasks', { id: 'r1', date: '2026-10-01', title: 'Cloud', done: false, updatedAt: 1, deleted: false });
    const ask = vi.fn(async () => ({ upload: false }));
    await engine({ askFirstSync: ask }).start('u1');
    await tick();
    expect(ask).toHaveBeenCalledWith({ localCount: 1, duplicateCount: 0 });
    expect((await getLiveTasksForDate('2026-10-01')).map(t => t.title)).toEqual(['Cloud']);
    expect(cloud.store.tasks.size).toBe(1);
  });

  it('first sign-in: cancel keeps the device unlinked', async () => {
    await upsertTask(T());
    const ok = await engine({ askFirstSync: async () => null }).start('u1');
    expect(ok).toBe(false);
    expect(await getSetting('syncUid')).toBeNull();
    expect(await db.tasks.count()).toBe(1);
  });

  it.each([
    ['newest',  'Local newer'],
    ['replace', 'Local newer'],
    ['keep',    'Cloud copy'],
  ])('first sign-in: duplicates → %s', async (choice, expected) => {
    cloud.remoteWrite('tasks', { id: 'cloud-id', date: '2026-10-01', title: 'Walk dog', notes: 'Cloud copy', done: false, updatedAt: 1, deleted: false });
    await upsertTask(T({ notes: 'Local newer' }));                     // same date + title → duplicate
    await upsertTask(T({ title: 'Only local' }));
    const ask = vi.fn(async () => ({ upload: true, duplicates: choice }));
    const e = engine({ askFirstSync: ask });
    await e.start('u1');
    await tick();
    expect(ask).toHaveBeenCalledWith({ localCount: 2, duplicateCount: 1 });
    const day = await getLiveTasksForDate('2026-10-01');
    expect(day.map(t => t.title).sort()).toEqual(['Only local', 'Walk dog']);
    expect(day.find(t => t.title === 'Walk dog')).toMatchObject({ id: 'cloud-id', notes: expected });
    expect(cloud.store.tasks.get('cloud-id').notes).toBe(expected);
    expect([...cloud.store.tasks.values()].some(t => t.title === 'Only local')).toBe(true);
  });

  it('newest keeps the account copy when it is newer', async () => {
    await upsertTask(T({ notes: 'Old local' }));
    cloud.remoteWrite('tasks', { id: 'c', date: '2026-10-01', title: 'walk DOG ', notes: 'Newer cloud', done: false, updatedAt: Date.now() + 5000, deleted: false });
    await engine({ askFirstSync: async () => ({ upload: true, duplicates: 'newest' }) }).start('u1');
    await tick();
    expect((await getLiveTasksForDate('2026-10-01')).map(t => t.notes)).toEqual(['Newer cloud']);
  });

  it('repeating tasks sync as a series; copies are generated on each device, edits sync', async () => {
    const e = engine();
    await e.start('u1');
    const { series } = await createFromForm({ title: 'Meds', date: '2026-10-01', time: '09:00', repeat: { freq: 'daily' } });
    const [today] = await getLiveTasksForDate('2026-10-01');    // generated copy, not uploaded
    await e.drain();
    expect(await getTask(today.id)).toMatchObject({ generated: true });   // our own upload echo didn't disturb it
    expect(cloud.store.series.get(series.id).title).toBe('Meds');
    expect(cloud.store.tasks.size).toBe(0);
    await upsertTask({ id: today.id, done: true });              // edited copy → uploaded
    await e.drain();
    expect(cloud.store.tasks.get(today.id)).toMatchObject({ done: true, seriesId: series.id, slot: 0 });

    // A second device sees the series and the done copy
    await Promise.all([db.tasks.clear(), db.series.clear(), db.settings.clear()]);
    setSyncActive(false);
    const e2 = engine();
    await e2.start('u1');
    await tick();
    const day1 = await getLiveTasksForDate('2026-10-01');
    const day2 = await getLiveTasksForDate('2026-10-02');
    expect(day1[0]).toMatchObject({ title: 'Meds', done: true });
    expect(day2[0]).toMatchObject({ title: 'Meds', done: false });

    // Renaming the series elsewhere regenerates untouched copies here
    cloud.remoteWrite('series', { ...cloud.store.series.get(series.id), title: 'Vitamins', updatedAt: Date.now() + 1000 });
    await tick();
    expect((await getLiveTasksForDate('2026-10-02'))[0].title).toBe('Vitamins');
  });

  it('offline: keeps changes queued, uploads when back online', async () => {
    const e = engine();
    await e.start('u1');
    setOnline(false);
    await upsertTask(T());
    await e.drain();
    expect(statuses.at(-1)).toMatchObject({ status: 'offline', pending: 1 });
    setOnline(true);
    await e.drain();
    expect(cloud.store.tasks.size).toBe(1);
  });

  it('upload errors are reported and retried', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const e = engine();
    await e.start('u1');
    const realPush = cloud.push;
    cloud.push = vi.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(realPush);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await upsertTask(T());
    await e.drain();
    expect(statuses.at(-1)).toMatchObject({ status: 'error', error: 'boom', pending: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cloud.store.tasks.size).toBe(1);
    err.mockRestore();
    vi.useRealTimers();
  });

  it('sign out uploads pending changes, then clears the device', async () => {
    const e = engine();
    await e.start('u1');
    await upsertTask(T());
    expect(await e.signOut()).toBe(true);
    expect(cloud.store.tasks.size).toBe(1);
    expect(await db.tasks.count()).toBe(0);
    expect(await getSetting('syncUid')).toBeNull();
    expect(e.uid).toBeNull();
  });

  it('sign out with unsynced changes asks first', async () => {
    const confirm = vi.fn(async () => false);
    const e = engine({ confirm });
    await e.start('u1');
    setOnline(false);
    await upsertTask(T());
    expect(await e.signOut()).toBe(false);
    expect(confirm).toHaveBeenCalled();
    expect(await db.tasks.count()).toBe(1);
    confirm.mockResolvedValue(true);
    expect(await e.signOut()).toBe(true);
    expect(await db.tasks.count()).toBe(0);
    setOnline(true);
  });

  it('signing in with a different account clears the previous account\'s data first', async () => {
    await setSetting('syncUid', 'old');
    await upsertTask(T({ title: 'Old account task' }));
    const ask = vi.fn();
    await engine({ askFirstSync: ask }).start('new');
    expect(ask).not.toHaveBeenCalled();
    expect(await db.tasks.count()).toBe(0);
    expect(await getSetting('syncUid')).toBe('new');
  });

  it('resumes without asking when this device is already linked', async () => {
    await setSetting('syncUid', 'u1');
    await openDb();
    await upsertTask(T());                 // queued while offline-before-auth
    const ask = vi.fn();
    const e = engine({ askFirstSync: ask });
    await e.start('u1');
    expect(ask).not.toHaveBeenCalled();
    expect(cloud.store.tasks.size).toBe(1);
    e.stop();
    expect(e.status.status).toBe('off');
  });
});
