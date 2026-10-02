/**
 * DYDTT — Local reminder scheduler
 *
 * Fires task reminders while the app (or its tab) is open:
 *   • an in-app toast every time (with "Done" / "Dismiss")
 *   • plus a system notification when the user has turned on
 *     "Reminder notifications" in Settings and granted permission.
 *
 * Missed reminders (app was closed or the device was asleep) are shown once
 * on the next launch if they're less than CATCH_UP_MS old.
 *
 * Reminders are NOT delivered while the app is fully closed — that needs
 * server push (FCM + a scheduled function), planned as a later task.
 */

import { store }             from '../store.js';
import { getTask, getTasksWithRemindersBetween, ensureOccurrences, isLive,
         markReminderShown, wasReminderShown } from '../db/schema.js';
import { sendLocalNotification, getPermissionState, nativePermissionKnown } from './client.js';
import { formatTime, todayStr, addDays } from '../utils/dateHelpers.js';
import { showToast }         from '../utils/toast.js';
import { announce }          from '../utils/a11y.js';
import { isNative }          from '../platform.js';

export const HORIZON_MS  = 24 * 60 * 60 * 1000;   // schedule timers up to 24h ahead
export const CATCH_UP_MS = 12 * 60 * 60 * 1000;   // show missed reminders up to 12h old
const REFRESH_MS         = 60 * 60 * 1000;        // re-plan hourly (rolls the 24h window)
const DEBOUNCE_MS        = 150;

const timers = new Map();          // taskId -> timeout id
let chain    = Promise.resolve();  // serialises runs so a reminder can't fire twice
let debounce = null;
let pending  = null;               // { promise, resolve } shared by debounced callers
let started  = false;
const cleanups = [];

/** Plan (or re-plan) all reminders. Safe to call often — runs are debounced + serialised. */
export function scheduleReminders() {
  clearTimeout(debounce);
  if (!pending) {
    let resolve;
    pending = { promise: new Promise(r => { resolve = r; }), resolve };
  }
  const current = pending;
  debounce = setTimeout(() => {
    pending = null;
    chain = chain.then(plan).catch(err => console.error('[Reminders]', err));
    chain.then(current.resolve);
  }, DEBOUNCE_MS);
  return current.promise;
}

async function plan() {
  timers.forEach(clearTimeout);
  timers.clear();

  // Android app: hand the next week of reminders to the OS instead
  if (isNative()) return planNative();

  // Make sure repeating tasks have their copies for the reminder window
  const today = todayStr();
  for (const d of [addDays(today, -1), today, addDays(today, 1)]) await ensureOccurrences(d);

  const now   = Date.now();
  const tasks = await getTasksWithRemindersBetween(now - CATCH_UP_MS, now + HORIZON_MS);

  for (const task of tasks) {
    if (await wasReminderShown(task.id, task.reminderAt)) continue;
    const delay = task.reminderAt - now;
    if (delay <= 0) {
      await fire(task.id, task.reminderAt);
    } else {
      timers.set(task.id, setTimeout(() => {
        timers.delete(task.id);
        chain = chain.then(() => fire(task.id, task.reminderAt));
      }, delay));
    }
  }
}

/** Android: keep the OS alarms in step with the next HORIZON_DAYS of reminders. */
async function planNative() {
  if (!nativePermissionKnown()) return;        // app still starting — initNative re-plans when ready
  const { syncNativeReminders, HORIZON_DAYS } = await import('../native/notifications.js');
  const today = todayStr();
  for (let i = 0; i <= HORIZON_DAYS; i++) await ensureOccurrences(addDays(today, i));
  const now   = Date.now();
  const tasks = await getTasksWithRemindersBetween(now, now + (HORIZON_DAYS + 1) * 86_400_000);
  const enabled = Boolean(store.state.settings.pushEnabled) && getPermissionState() === 'granted';
  await syncNativeReminders(tasks, { enabled, now });
}

/** Re-check the task (it may have been edited/completed) and show the reminder once. */
async function fire(taskId, reminderAt) {
  const task = await getTask(taskId);
  if (!task || task.done || !isLive(task)) return;
  if (task.reminderAt !== reminderAt) return;                 // time was changed
  if (await wasReminderShown(taskId, reminderAt)) return;
  await markReminderShown(taskId, reminderAt);                // mark first → never twice

  const late = Date.now() - reminderAt > 60_000;
  const when = formatTime(reminderAt);
  const body = late ? `${task.title} (was due ${when})` : task.title;

  showToast({
    title:   'Did you do that today?',
    message: body,
    actions: [
      { label: 'Done', primary: true,
        onClick: () => store.dispatch('TASK_UPSERT', { id: task.id, done: true }) },
      { label: 'Open',
        onClick: () => openTask(task) },
      { label: 'Dismiss' },
    ],
  });
  announce(`Reminder: ${task.title}`, 'assertive');

  if (store.state.settings.pushEnabled && getPermissionState() === 'granted') {
    await sendLocalNotification({
      title:   'Did you do that today?',
      body,
      tag:     `task-${task.id}`,
      data:    { taskId: task.id, date: task.date, url: '/' },
      onClick: () => openTask(task),
    });
  }
}

/** Jump to the task's day and highlight it. */
export async function openTask({ id, date }) {
  if (date && date !== store.state.currentDate) {
    await store.dispatch('NAV_TO_DATE', { date });
  }
  if (id && store.state.ui.selectedTaskId !== id) {
    await store.dispatch('TASK_SELECT', { id });
  }
}

/** Start listening. Call once at boot. Returns a stop function. */
export function initReminders() {
  if (started) return stopReminders;
  started = true;

  // Any task change (add / edit / complete / delete) → re-plan
  cleanups.push(store.subscribe('tasks', () => scheduleReminders()));
  // Reminder notifications turned on / off
  let lastPush = store.state.settings.pushEnabled;
  cleanups.push(store.subscribe('settings', (s) => {
    if (s.pushEnabled !== lastPush) { lastPush = s.pushEnabled; scheduleReminders(); }
  }));

  // Roll the 24h window forward
  const interval = setInterval(scheduleReminders, REFRESH_MS);
  cleanups.push(() => clearInterval(interval));

  // Background tabs throttle/freeze timers — catch up when the user comes back
  const onVisible = () => { if (document.visibilityState === 'visible') scheduleReminders(); };
  document.addEventListener('visibilitychange', onVisible);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));

  // Clicking a system notification shown by the Service Worker
  if ('serviceWorker' in navigator) {
    const onMessage = (e) => {
      if (e.data?.type === 'REMINDER_CLICK') openTask({ id: e.data.taskId, date: e.data.date });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    cleanups.push(() => navigator.serviceWorker.removeEventListener('message', onMessage));
  }

  return stopReminders;
}

export function stopReminders() {
  cleanups.splice(0).forEach(fn => fn());
  timers.forEach(clearTimeout);
  timers.clear();
  clearTimeout(debounce);
  started = false;
}
