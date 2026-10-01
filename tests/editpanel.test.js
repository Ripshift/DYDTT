import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/auth/authManager.js', () => ({
  signInWithGoogle: vi.fn(), signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(),
  resetPassword: vi.fn(), signOutUser: vi.fn(),
}));

import { db, openDb, getLiveTasksForDate, getSeries, setSyncActive } from '../src/db/schema.js';
import { store }  from '../src/store.js';
import Modal      from '../src/components/Modal.js';
import { choose } from '../src/components/Dialog.js';
import { syncLabel } from '../src/components/EditPanel.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const D = '2026-10-01';
let app, $;

/** Click a dialog button by its label (waits for the dialog to appear). */
async function pick(label) {
  for (let i = 0; i < 40; i++) {
    const btn = [...document.querySelectorAll('.dialog button')].find(b => b.textContent.trim().startsWith(label));
    if (btn) { btn.click(); await tick(); return; }
    await tick(10);
  }
  throw new Error(`No dialog button "${label}". Saw: ${[...document.querySelectorAll('.dialog button')].map(b => b.textContent).join(' | ')}`);
}
const dialogText = () => document.querySelector('.dialog')?.textContent ?? '';

async function openEdit() {
  await store.dispatch('MODAL_OPEN', { tab: 'edit' });
  await tick();
}
const set = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
const titles = async (d = D) => (await getLiveTasksForDate(d)).map(t => t.title);

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.syncQueue.clear()]);
  setSyncActive(false);
  await store.dispatch('MODAL_CLOSE');
  await store.dispatch('AUTH_SET', { user: null });
  await store.dispatch('NAV_TO_DATE', { date: D });
  app = document.getElementById('app');
  new Modal({ container: app });
  await tick();
  $ = (s) => app.querySelector(s);
});

describe('Edit tab — repeat options', () => {
  it('shows only the options for the chosen repeat type, with a summary', async () => {
    await openEdit();
    const visible = () => [...app.querySelectorAll('.repeat__opt')].filter(o => !o.hidden).map(o => o.dataset.for);
    expect(visible()).toEqual([]);
    set('#modal-repeat', 'weekly');
    expect(visible()).toEqual(['weekly', 'any']);
    expect($('#modal-repeat-summary').textContent).toBe('Every Thu');        // defaults to the date's weekday
    set('#modal-repeat', 'several');
    expect(visible()).toEqual(['several', 'any']);
    expect(app.querySelectorAll('#modal-times input')).toHaveLength(2);
    expect($('#modal-time-single').hidden).toBe(true);
    $('#modal-add-time').click();
    expect(app.querySelectorAll('#modal-times input')).toHaveLength(3);
    app.querySelector('.repeat__remove').click();
    expect(app.querySelectorAll('#modal-times input')).toHaveLength(2);
    set('#modal-repeat', 'interval');
    set('#modal-interval', '3');
    set('#modal-ends', 'count');
    expect($('#modal-end-count').hidden).toBe(false);
    expect($('#modal-repeat-summary').textContent).toBe('Every 3 days · 10 times');
    set('#modal-ends', 'date');
    expect($('#modal-end-date').hidden).toBe(false);
    set('#modal-repeat', 'monthly');
    expect($('#modal-monthday').value).toBe('1');
  });

  it('weekday buttons toggle', async () => {
    await openEdit();
    set('#modal-repeat', 'weekly');
    app.querySelector('.weekday[data-day="1"]').click();
    expect($('#modal-repeat-summary').textContent).toBe('Every Mon, Thu');
    app.querySelector('.weekday[data-day="4"]').click();
    expect($('#modal-repeat-summary').textContent).toBe('Every Mon');
  });
});

describe('Edit tab — saving', () => {
  it('requires a title', async () => {
    await openEdit();
    $('#modal-save-btn').click();
    await tick();
    expect(await titles()).toEqual([]);
  });

  it('adds a repeating task (several times a day)', async () => {
    await openEdit();
    set('#modal-task-title', 'Meds');
    set('#modal-repeat', 'several');
    const [a, b] = app.querySelectorAll('#modal-times input');
    a.value = '09:00'; b.value = '21:00';
    $('#modal-save-btn').click();
    await tick(60);
    expect(await titles('2026-10-02')).toEqual(['Meds', 'Meds']);
    expect(store.state.tasks).toHaveLength(2);
    expect(app.querySelector('.modal-overlay').classList.contains('open')).toBe(false);
  });

  it('editing a repeat copy asks "just this one" or "this and all future"', async () => {
    await openEdit();
    set('#modal-task-title', 'Walk');
    set('#modal-repeat', 'daily');
    $('#modal-save-btn').click();
    await tick(60);

    await store.dispatch('NAV_TO_DATE', { date: '2026-10-03' });
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    expect($('#modal-edit-context').textContent).toContain('↻ Daily');
    expect($('#modal-repeat').value).toBe('daily');
    expect($('#modal-delete-btn').textContent).toBe('Delete task…');

    set('#modal-task-title', 'Long walk');
    $('#modal-save-btn').click();
    await pick('Just this one');
    expect(await titles('2026-10-03')).toEqual(['Long walk']);
    expect(await titles('2026-10-04')).toEqual(['Walk']);

    // Changing the repeat only offers "this and all future"
    await store.dispatch('NAV_TO_DATE', { date: '2026-10-05' });
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    set('#modal-repeat', 'weekly');
    $('#modal-save-btn').click();
    await tick();
    expect(dialogText()).toContain('this and all future');
    expect(dialogText()).not.toContain('Just this one');
    await pick('This and all future');
    expect(await titles('2026-10-04')).toEqual(['Walk']);         // before the split: unchanged
    expect(await titles('2026-10-06')).toEqual([]);               // Tue — weekly on Mon now
    expect(await titles('2026-10-12')).toEqual(['Walk']);         // next Mon
  });

  it('cancelling the scope question keeps the modal open and changes nothing', async () => {
    await openEdit();
    set('#modal-task-title', 'Walk');
    set('#modal-repeat', 'daily');
    $('#modal-save-btn').click();
    await tick(60);
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    set('#modal-task-title', 'Changed');
    $('#modal-save-btn').click();
    await pick('Cancel');
    expect(await titles()).toEqual(['Walk']);
    expect(app.querySelector('.modal-overlay').classList.contains('open')).toBe(true);
  });
});

describe('Edit tab — delete / clear', () => {
  async function addOneOff(title) {
    await store.dispatch('TASK_SAVE', { form: { title, notes: '', date: D, time: '', repeat: { freq: 'none' } } });
  }

  it('selected one-time task: confirm, then delete', async () => {
    await addOneOff('Bins');
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    $('#modal-delete-btn').click();
    await tick();
    expect(dialogText()).toContain('Delete task?');
    await pick('Delete');
    expect(await titles()).toEqual([]);
  });

  it('selected repeat copy: just this one / future / all', async () => {
    await store.dispatch('TASK_SAVE', { form: { title: 'Walk', notes: '', date: D, time: '', repeat: { freq: 'daily' } } });
    const seriesId = store.state.tasks[0].seriesId;
    await store.dispatch('NAV_TO_DATE', { date: '2026-10-03' });
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    $('#modal-delete-btn').click();
    await pick('Just this one');
    expect(await titles('2026-10-03')).toEqual([]);
    expect(await titles('2026-10-04')).toEqual(['Walk']);

    await store.dispatch('NAV_TO_DATE', { date: '2026-10-02' });
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    await openEdit();
    $('#modal-delete-btn').click();
    await pick('All of them');
    expect(await titles(D)).toEqual([]);
    expect((await getSeries(seriesId)).deleted).toBe(true);
  });

  it('nothing selected: clear the viewed day', async () => {
    await addOneOff('A'); await addOneOff('B');
    await openEdit();
    expect($('#modal-delete-btn').textContent).toBe('Clear…');
    $('#modal-delete-btn').click();
    await tick();
    expect(dialogText()).toContain('Thursday, Oct 1');
    expect(dialogText()).toContain('2 tasks');
    await pick('Clear Thursday');
    expect(await titles()).toEqual([]);
    expect(document.querySelector('.toast').textContent).toContain('Cleared 2 tasks');
  });

  it('wipe entire calendar needs a second, red warning', async () => {
    await addOneOff('A');
    await store.dispatch('TASK_SAVE', { form: { title: 'Daily', notes: '', date: D, time: '', repeat: { freq: 'daily' } } });
    await openEdit();
    $('#modal-delete-btn').click();
    await pick('Wipe entire calendar');
    await tick();
    expect(document.querySelector('.dialog-overlay--danger')).not.toBeNull();
    expect(dialogText()).toContain('major deletion');
    await pick('Keep my tasks');
    expect(await titles()).toHaveLength(2);

    await openEdit();
    $('#modal-delete-btn').click();
    await pick('Wipe entire calendar');
    await pick('Yes, delete everything');
    expect(await db.tasks.count()).toBe(0);
    expect(await db.series.count()).toBe(0);
  });
});

describe('Edit tab — sync button', () => {
  it('signed out: "Sign in to sync" goes to the Login tab', async () => {
    await openEdit();
    expect($('#modal-sync-btn').textContent).toBe('Sign in to sync');
    expect($('#modal-sync-status').textContent).toBe('Only on this device');
    $('#modal-sync-btn').click();
    await tick();
    expect(store.state.ui.modalTab).toBe('auth');
  });

  it('signed in: shows status', async () => {
    await store.dispatch('AUTH_SET', { user: { uid: 'u1', email: 'a@b.c' } });
    await store.dispatch('SYNC_STATUS', { status: 'idle', pending: 3 });
    await openEdit();
    expect($('#modal-sync-btn').textContent).toBe('Sync now');
    expect($('#modal-sync-status').textContent).toBe('3 changes waiting');
    await store.dispatch('SYNC_STATUS', { status: 'syncing' });
    expect($('#modal-sync-btn').disabled).toBe(true);
  });

  it('syncLabel', () => {
    expect(syncLabel({ status: 'offline', pending: 2 })).toBe('Offline · 2 waiting');
    expect(syncLabel({ status: 'offline', pending: 0 })).toBe('Offline');
    expect(syncLabel({ status: 'error' })).toBe('Sync problem — will retry');
    expect(syncLabel({ status: 'off' })).toBe('Sync is off on this device');
    expect(syncLabel({ status: 'idle', pending: 1 })).toBe('1 change waiting');
    expect(syncLabel({ status: 'idle', pending: 0, lastSyncedAt: Date.now() })).toBe('Synced just now');
    expect(syncLabel({ status: 'idle', pending: 0, lastSyncedAt: Date.now() - 5 * 60_000 })).toBe('Synced 5 min ago');
    expect(syncLabel({ status: 'idle', pending: 0, lastSyncedAt: Date.now() - 3 * 3_600_000 })).toBe('Synced 3 h ago');
    expect(syncLabel({ status: 'idle', pending: 0 })).toBe('Synced');
  });
});

describe('Dialog', () => {
  it('resolves with the chosen value, null on Escape / backdrop', async () => {
    let p = choose({ title: 'Q', message: 'M', options: [{ label: 'Yes', value: 1, hint: 'h' }] });
    expect(document.activeElement.textContent).toContain('Yes');
    document.querySelector('.dialog__option').click();
    expect(await p).toBe(1);
    expect(document.querySelector('.dialog')).toBeNull();

    p = choose({ title: 'Q', options: [] });
    document.querySelector('.dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();

    p = choose({ title: 'Danger', danger: true, options: [{ label: 'Do it', value: 'x', variant: 'danger' }] });
    expect(document.activeElement.textContent).toBe('Cancel');          // safe default focus
    document.querySelector('.dialog-overlay').click();
    expect(await p).toBeNull();
  });
});
