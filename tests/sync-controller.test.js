import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, openDb, getSetting, setSyncActive, upsertTask } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { initSync, syncNow, signOutAndClear, askFirstSync, confirmDialog, getSyncEngine } from '../src/sync/index.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function pick(label) {
  for (let i = 0; i < 40; i++) {
    const b = [...document.querySelectorAll('.dialog button')].find(x => x.textContent.trim().startsWith(label));
    if (b) { b.click(); await tick(); return; }
    await tick(10);
  }
  throw new Error('no button ' + label);
}

function memoryAdapter() {
  const docs = { task: new Map(), series: new Map() };
  let clock = 1;
  return {
    docs,
    push: vi.fn(async (uid, { tasks, series }) => {
      tasks.forEach(t => docs.task.set(t.id, { ...t, syncedAt: ++clock }));
      series.forEach(s => docs.series.set(s.id, { ...s, syncedAt: ++clock }));
    }),
    fetchAll: vi.fn(async () => ({ tasks: [...docs.task.values()], series: [...docs.series.values()] })),
    subscribe: vi.fn((uid, since, onDocs) => {
      const t = [...docs.task.values()];
      if (t.length) onDocs('task', t, clock);
      return () => {};
    }),
  };
}

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.syncQueue.clear(), db.settings.clear()]);
  setSyncActive(false);
  await store.dispatch('AUTH_SET', { user: null });
});

describe('sync controller', () => {
  it('starts on sign-in, reports status, uploads changes, signs out cleanly', async () => {
    const adapter = memoryAdapter();
    adapter.docs.task.set('c1', { id: 'c1', date: '2026-10-01', title: 'From cloud', done: false, updatedAt: 1, deleted: false, syncedAt: 1 });
    await initSync({ adapter });
    await store.dispatch('NAV_TO_DATE', { date: '2026-10-01' });

    await store.dispatch('AUTH_SET', { user: { uid: 'u1' } });
    await tick(60);
    expect(getSyncEngine().uid).toBe('u1');
    expect(store.state.sync.status).toBe('idle');
    expect(store.state.tasks.map(t => t.title)).toEqual(['From cloud']);

    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'New here' });
    await tick(1000);                                           // debounced upload
    expect([...adapter.docs.task.values()].some(t => t.title === 'New here')).toBe(true);

    expect(await syncNow()).toBe(true);

    const signOut = vi.fn(async () => store.dispatch('AUTH_SET', { user: null }));
    expect(await signOutAndClear(signOut)).toBe(true);
    expect(signOut).toHaveBeenCalled();
    expect(await db.tasks.count()).toBe(0);
    expect(await getSetting('syncUid')).toBeNull();
    expect(store.state.sync.status).toBe('off');
  });

  it('cancelling the first-sync question leaves sync off; "Sync" can set it up later', async () => {
    const adapter = memoryAdapter();
    await upsertTask({ date: '2026-10-01', title: 'Local' });
    await initSync({ adapter });
    store.dispatch('AUTH_SET', { user: { uid: 'u2' } });
    await pick('Don\'t sync yet');
    await tick();
    expect(getSyncEngine().uid).toBeNull();
    expect(document.querySelector('.toast').textContent).toContain('sync is off');

    const p = syncNow();
    await pick('Upload 1 task');
    expect(await p).toBe(true);
    expect([...adapter.docs.task.values()].map(t => t.title)).toEqual(['Local']);
  });

  it('online / offline events', async () => {
    await initSync({ adapter: memoryAdapter() });
    window.dispatchEvent(new Event('offline'));
    await tick();
    expect(store.state.sync.status).toBe('offline');
    window.dispatchEvent(new Event('online'));
  });

  it('syncNow without a user does nothing', async () => {
    await initSync({ adapter: memoryAdapter() });
    expect(await syncNow()).toBe(false);
  });
});

describe('first-sync questions', () => {
  it('upload with no duplicates → newest; discard; duplicates → choice; cancel', async () => {
    let p = askFirstSync({ localCount: 3, duplicateCount: 0 });
    await pick('Upload 3 tasks');
    expect(await p).toEqual({ upload: true, duplicates: 'newest' });

    p = askFirstSync({ localCount: 1, duplicateCount: 0 });
    await pick('Discard');
    expect(await p).toEqual({ upload: false });

    p = askFirstSync({ localCount: 2, duplicateCount: 1 });
    await pick('Upload 2 tasks');
    expect(document.querySelector('.dialog').textContent).toContain('1 task is already in your account');
    await pick('Replace with this device');
    expect(await p).toEqual({ upload: true, duplicates: 'replace' });

    p = askFirstSync({ localCount: 2, duplicateCount: 2 });
    await pick('Upload');
    await pick('Don\'t sync yet');
    expect(await p).toBeNull();
  });

  it('confirmDialog', async () => {
    let p = confirmDialog({ title: 'Sure?', message: 'm', confirmLabel: 'Sign out anyway' });
    await pick('Sign out anyway');
    expect(await p).toBe(true);
    p = confirmDialog({ title: 'Sure?', message: 'm', confirmLabel: 'Go' });
    await pick('Cancel');
    expect(await p).toBe(false);
  });
});
