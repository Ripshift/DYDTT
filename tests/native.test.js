import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Fakes for the Capacitor plugins ────────────────────────────────────────
const ln = vi.hoisted(() => ({
  pending: [],
  listeners: {},
  createChannel: vi.fn(async () => {}),
  registerActionTypes: vi.fn(async () => {}),
  getPending: vi.fn(async () => ({ notifications: ln.pending.map(n => ({ id: n.id })) })),
  schedule: vi.fn(async ({ notifications }) => { ln.pending.push(...notifications); }),
  cancel: vi.fn(async ({ notifications }) => { const ids = new Set(notifications.map(n => n.id)); ln.pending = ln.pending.filter(n => !ids.has(n.id)); }),
  checkPermissions: vi.fn(async () => ({ display: 'granted' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
  changeExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
  addListener: vi.fn((ev, fn) => { ln.listeners[ev] = fn; return { remove() {} }; }),
}));
const app = vi.hoisted(() => ({ listeners: {}, addListener: vi.fn((ev, fn) => { app.listeners[ev] = fn; }), minimizeApp: vi.fn() }));
const platform = vi.hoisted(() => ({ native: true }));

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('../src/platform.js', () => ({ isNative: () => platform.native, platformName: () => 'android' }));
vi.mock('../src/auth/authManager.js', () => ({}));

import { db, openDb, getSetting, setSetting } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { notificationId, toNotification, syncNativeReminders, notificationPermission, exactAlarmsAllowed, MAX_SCHEDULED } from '../src/native/notifications.js';
import { initNative } from '../src/native/index.js';
import { scheduleReminders } from '../src/push/reminders.js';
import { setNativePermission, getPermissionState, requestPermission } from '../src/push/client.js';
import { todayStr, addDays } from '../src/utils/dateHelpers.js';
import { createFromForm } from '../src/tasks/taskService.js';

const H = 3_600_000;

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear(), db.settings.clear()]);
  ln.pending = [];
  vi.clearAllMocks();
});

describe('native notifications', () => {
  it('ids are stable, positive and differ per time', () => {
    const a = notificationId('t1', 1000), b = notificationId('t1', 2000);
    expect(a).toBe(notificationId('t1', 1000));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(2 ** 31);
    expect(a).not.toBe(b);
  });

  it('builds the notification', () => {
    const n = toNotification({ id: 't1', title: 'Walk dog', date: '2026-10-01', reminderAt: 1_790_000_000_000 });
    expect(n).toMatchObject({ title: 'Did you do that today?', body: 'Walk dog', channelId: 'reminders',
      actionTypeId: 'TASK', smallIcon: 'ic_stat_dydtt', extra: { taskId: 't1', date: '2026-10-01' } });
    expect(n.schedule).toMatchObject({ allowWhileIdle: true });
    expect(n.schedule.at.getTime()).toBe(1_790_000_000_000);
  });

  it('sync: schedules new, cancels stale, skips past/done, caps the count', async () => {
    const now = Date.now();
    const t = (id, at, o = {}) => ({ id, title: id, date: '2026-10-01', reminderAt: at, done: false, ...o });
    let r = await syncNativeReminders([t('a', now + H), t('b', now + 2 * H), t('past', now - H), t('done', now + H, { done: true })], { now });
    expect(r).toEqual({ scheduled: 2, cancelled: 0 });
    r = await syncNativeReminders([t('a', now + H)], { now });                 // b removed
    expect(r).toEqual({ scheduled: 0, cancelled: 1 });
    r = await syncNativeReminders([t('a', now + 3 * H)], { now });             // time changed → new id
    expect(r).toEqual({ scheduled: 1, cancelled: 1 });
    r = await syncNativeReminders([t('a', now + 3 * H)], { enabled: false, now });
    expect(r).toEqual({ scheduled: 0, cancelled: 1 });
    const many = Array.from({ length: MAX_SCHEDULED + 20 }, (_, i) => t(`m${i}`, now + (i + 1) * 60_000));
    r = await syncNativeReminders(many, { now });
    expect(r.scheduled).toBe(MAX_SCHEDULED);
  });

  it('permission + exact alarm helpers', async () => {
    expect(await notificationPermission()).toBe('granted');
    ln.checkPermissions.mockResolvedValueOnce({ display: 'prompt' });
    expect(await notificationPermission()).toBe('default');
    ln.requestPermissions.mockResolvedValueOnce({ display: 'denied' });
    expect(await notificationPermission(true)).toBe('denied');
    ln.checkExactNotificationSetting.mockResolvedValueOnce({ exact_alarm: 'denied' });
    expect(await exactAlarmsAllowed()).toBe(false);
    ln.checkExactNotificationSetting.mockRejectedValueOnce(new Error('old android'));
    expect(await exactAlarmsAllowed()).toBe(true);
  });

  it('push client uses the OS permission in the app', async () => {
    setNativePermission(null);
    expect(getPermissionState()).toBe('default');
    expect(await requestPermission()).toBe('granted');
    expect(getPermissionState()).toBe('granted');
  });
});

describe('reminders in the Android app', () => {
  it('schedules the next week of reminders with the OS (incl. repeats), not in-app timers', async () => {
    setNativePermission('granted');
    await store.dispatch('SETTING_SET', { key: 'pushEnabled', value: true });
    const today = todayStr();
    const soon = new Date(Date.now() + 2 * H);
    const hhmm = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
    await createFromForm({ title: 'Meds', notes: '', date: today, time: hhmm, repeat: { freq: 'daily' } });
    await createFromForm({ title: 'Far away', notes: '', date: addDays(today, 30), time: '09:00', repeat: { freq: 'none' } });
    await scheduleReminders();
    const bodies = ln.pending.map(n => n.body);
    expect(bodies.filter(b => b === 'Meds').length).toBeGreaterThanOrEqual(7);
    expect(bodies).not.toContain('Far away');
    expect(document.querySelector('.toast')).toBeNull();

    await store.dispatch('SETTING_SET', { key: 'pushEnabled', value: false });
    await scheduleReminders();
    expect(ln.pending).toEqual([]);
  });

  it('does nothing until the OS permission is known (app starting)', async () => {
    setNativePermission(null);
    await createFromForm({ title: 'X', notes: '', date: todayStr(), time: '23:59', repeat: { freq: 'none' } });
    await scheduleReminders();
    expect(ln.schedule).not.toHaveBeenCalled();
    expect(ln.cancel).not.toHaveBeenCalled();
  });
});

describe('initNative', () => {
  it('sets up channel + Done action, turns reminders on, asks permission, wires listeners', async () => {
    ln.checkPermissions.mockResolvedValueOnce({ display: 'prompt' });
    await initNative();
    expect(document.documentElement.classList.contains('native-app')).toBe(true);
    expect(ln.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'reminders', importance: 5 }));
    expect(ln.registerActionTypes).toHaveBeenCalledWith({ types: [{ id: 'TASK', actions: [{ id: 'done', title: 'Done' }] }] });
    expect(await getSetting('pushEnabled')).toBe(true);
    expect(ln.requestPermissions).toHaveBeenCalled();
    expect(app.listeners.backButton).toBeTypeOf('function');
  });

  it('asks once for exact alarms when Android has them off', async () => {
    ln.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
    await initNative();
    expect(document.querySelector('.toast').textContent).toContain('a few minutes late');
    document.querySelector('.toast .btn--primary').click();
    expect(ln.changeExactNotificationSetting).toHaveBeenCalled();
    document.querySelectorAll('.toast').forEach(t => t.remove());
    await initNative();
    expect(document.querySelector('.toast')).toBeNull();          // only once
    ln.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'granted' });
  });

  it('notification "Done" ticks the task; tapping opens its day', async () => {
    await initNative();
    const { task } = await createFromForm({ title: 'Walk', notes: '', date: addDays(todayStr(), 2), time: '', repeat: { freq: 'none' } });
    await ln.listeners.localNotificationActionPerformed({ actionId: 'done', notification: { extra: { taskId: task.id, date: task.date } } });
    expect((await db.tasks.get(task.id)).done).toBe(true);
    await ln.listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { extra: { taskId: task.id, date: task.date } } });
    expect(store.state.currentDate).toBe(task.date);
    expect(store.state.ui.selectedTaskId).toBe(task.id);
    await ln.listeners.localNotificationActionPerformed({ actionId: 'tap', notification: {} });   // ignored
  });

  it('back button: closes menu, else minimises', async () => {
    await initNative();
    await store.dispatch('MODAL_OPEN', { tab: 'edit' });
    await app.listeners.backButton();
    expect(store.state.ui.modalOpen).toBe(false);
    await app.listeners.backButton();
    expect(app.minimizeApp).toHaveBeenCalled();
  });

  it('cat: no hello until he has been found; then once a day, and tapping it opens his page', async () => {
    const { markFound, _resetPet } = await import('../src/pet/petStore.js');
    const { isSecretOpen, closeSecretPage } = await import('../src/components/SecretPage.js');
    const { PET_NOTIFICATION_ID, HELLO_DAY_KEY } = await import('../src/native/petNotify.js');
    _resetPet();
    const hellos = () => ln.schedule.mock.calls.flatMap(c => c[0].notifications).filter(n => n.id === PET_NOTIFICATION_ID);

    await initNative();
    expect(ln.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat' }));
    expect(hellos()).toHaveLength(0);                       // never found → never

    await markFound();                                      // found today → first hello tomorrow
    await app.listeners.appStateChange({ isActive: true });
    expect(hellos()).toHaveLength(0);

    await setSetting(HELLO_DAY_KEY, '2000-01-01');          // a new day
    await app.listeners.appStateChange({ isActive: true });
    expect(hellos()).toHaveLength(1);
    expect(hellos()[0]).toMatchObject({ title: 'Your cat', channelId: 'cat', extra: { pet: true } });
    await app.listeners.appStateChange({ isActive: true });
    expect(hellos()).toHaveLength(1);                       // only once a day

    await ln.listeners.localNotificationActionPerformed({ actionId: 'tap', notification: { extra: { pet: true } } });
    expect(isSecretOpen()).toBe(true);
    closeSecretPage();
    _resetPet();
  });

  it('back button closes the cat\'s secret page first', async () => {
    await initNative();
    const { openSecretPage, isSecretOpen } = await import('../src/components/SecretPage.js');
    await openSecretPage();
    await app.listeners.backButton();
    expect(isSecretOpen()).toBe(false);
    expect(app.minimizeApp).not.toHaveBeenCalled();
  });

  it('back button closes an open dialog first', async () => {
    await initNative();
    const { choose } = await import('../src/components/Dialog.js');
    const p = choose({ title: 'Q', options: [{ label: 'A', value: 1 }] });
    await app.listeners.backButton();
    expect(await p).toBeNull();
  });

  it('coming back to the front on a new day moves "today" forward', async () => {
    await initNative();
    await store.dispatch('NAV_TO_DATE', { date: todayStr() });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 24 * H));
    await app.listeners.appStateChange({ isActive: true });
    expect(store.state.currentDate).toBe(todayStr());
    vi.useRealTimers();
    await app.listeners.appStateChange({ isActive: false });
  });
});
