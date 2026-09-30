import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, openDb, upsertTask, getTask } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { scheduleReminders, initReminders, stopReminders } from '../src/push/reminders.js';

const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
const toasts = () => [...document.querySelectorAll('.toast')];
const MIN = 60_000, HOUR = 60 * MIN;

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await db.pushLog.clear();
  await store.dispatch('SETTING_SET', { key: 'pushEnabled', value: false });
  Notification.permission = 'default';
});
afterEach(() => stopReminders());

describe('local reminders', () => {
  it('shows a missed reminder (within 12h) once, even if planned repeatedly', async () => {
    await upsertTask({ date: '2026-10-01', title: 'Take meds', reminderAt: Date.now() - 30 * MIN });
    await Promise.all([scheduleReminders(), scheduleReminders(), scheduleReminders()]);
    await scheduleReminders();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain('Take meds');
    expect(toasts()[0].textContent).toContain('was due');
  });

  it('fires a future reminder when it comes due', async () => {
    await upsertTask({ date: '2026-10-01', title: 'Call mum', reminderAt: Date.now() + 400 });
    await scheduleReminders();
    expect(toasts()).toHaveLength(0);
    await sleep(700);
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].textContent).toContain('Call mum');
  });

  it('skips done tasks and reminders older than 12h', async () => {
    await upsertTask({ date: '2026-10-01', title: 'Already done', done: true, reminderAt: Date.now() - MIN });
    await upsertTask({ date: '2026-10-01', title: 'Too old', reminderAt: Date.now() - 13 * HOUR });
    await scheduleReminders();
    expect(toasts()).toHaveLength(0);
  });

  it('does not fire if the task was completed before the time', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'Water plants', reminderAt: Date.now() + 400 });
    await scheduleReminders();
    await upsertTask({ id: t.id, done: true });
    await sleep(700);
    expect(toasts()).toHaveLength(0);
  });

  it('re-arms when the reminder time is changed', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'Gym', reminderAt: Date.now() - MIN });
    await scheduleReminders();
    expect(toasts()).toHaveLength(1);
    await upsertTask({ id: t.id, reminderAt: Date.now() - 2 * MIN });   // new time → new reminder
    await scheduleReminders();
    expect(toasts()).toHaveLength(2);
  });

  it('"Done" on the toast completes the task', async () => {
    const t = await upsertTask({ date: '2026-10-01', title: 'Stretch', reminderAt: Date.now() - MIN });
    await scheduleReminders();
    toasts()[0].querySelector('.btn--primary').click();
    await sleep(50);
    expect((await getTask(t.id)).done).toBe(true);
  });

  it('also shows a system notification when enabled + permitted', async () => {
    const spy = vi.fn();
    vi.stubGlobal('Notification', class { static permission = 'granted'; constructor(title, opts) { spy(title, opts); } });
    await store.dispatch('SETTING_SET', { key: 'pushEnabled', value: true });
    await upsertTask({ date: '2026-10-01', title: 'Pay rent', reminderAt: Date.now() - MIN });
    await scheduleReminders();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].body).toContain('Pay rent');
  });

  it('no system notification when the setting is off', async () => {
    const spy = vi.fn();
    vi.stubGlobal('Notification', class { static permission = 'granted'; constructor() { spy(); } });
    await upsertTask({ date: '2026-10-01', title: 'Quiet', reminderAt: Date.now() - MIN });
    await scheduleReminders();
    expect(toasts()).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-plans automatically when tasks change in the store', async () => {
    initReminders();
    await store.dispatch('NAV_TO_DATE', { date: '2026-10-01' });
    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Auto', reminderAt: Date.now() - MIN });
    await sleep(400);
    expect(toasts().some(t => t.textContent.includes('Auto'))).toBe(true);
  });
});
