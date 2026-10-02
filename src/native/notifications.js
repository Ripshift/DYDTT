/**
 * DYDTT — Android reminders (OS-scheduled notifications)
 *
 * In the Android app, reminders are handed to Android's alarm system, so
 * they appear on time even when the app is closed or the phone restarted.
 * We keep the next HORIZON_DAYS of reminders scheduled and re-sync whenever
 * tasks change or the app comes back to the foreground.
 */

import { LocalNotifications } from '@capacitor/local-notifications';

export const HORIZON_DAYS = 7;
export const MAX_SCHEDULED = 200;             // well under Android's per-app alarm limit
export const CHANNEL_ID = 'reminders';
export const ACTION_TYPE = 'TASK';
export const TITLE = 'Did you do that today?';

/** Stable positive 31-bit id for a task's reminder at a specific time. */
export function notificationId(taskId, reminderAt) {
  const s = `${taskId}|${reminderAt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}

/** Build the notification for a task. */
export function toNotification(task) {
  return {
    id:           notificationId(task.id, task.reminderAt),
    title:        TITLE,
    body:         task.title,
    schedule:     { at: new Date(task.reminderAt), allowWhileIdle: true },
    channelId:    CHANNEL_ID,
    actionTypeId: ACTION_TYPE,
    smallIcon:    'ic_stat_dydtt',
    iconColor:    '#C9A84C',
    autoCancel:   true,
    extra:        { taskId: task.id, date: task.date, reminderAt: task.reminderAt },
  };
}

/** One-time setup: channel + the "Done" button. */
export async function setupNotifications() {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Task reminders',
    description: 'Reminders for your tasks',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#C9A84C',
  });
  await LocalNotifications.registerActionTypes({
    types: [{ id: ACTION_TYPE, actions: [{ id: 'done', title: 'Done' }] }],
  });
}

/**
 * Make Android's scheduled reminders match `tasks` (upcoming, not done).
 * Cancels ones that are no longer wanted, schedules new ones.
 * @returns {{ scheduled: number, cancelled: number }}
 */
export async function syncNativeReminders(tasks, { enabled = true, now = Date.now() } = {}) {
  const wanted = enabled
    ? tasks
        .filter(t => typeof t.reminderAt === 'number' && t.reminderAt > now && !t.done)
        .sort((a, b) => a.reminderAt - b.reminderAt)
        .slice(0, MAX_SCHEDULED)
        .map(toNotification)
    : [];
  const wantedIds = new Set(wanted.map(n => n.id));

  const { notifications: pending = [] } = await LocalNotifications.getPending();
  const pendingIds = new Set(pending.map(n => n.id));

  const cancel = pending.filter(n => !wantedIds.has(n.id)).map(n => ({ id: n.id }));
  const add    = wanted.filter(n => !pendingIds.has(n.id));

  if (cancel.length) await LocalNotifications.cancel({ notifications: cancel });
  if (add.length)    await LocalNotifications.schedule({ notifications: add });
  return { scheduled: add.length, cancelled: cancel.length };
}

/** 'granted' | 'denied' | 'default' */
export async function notificationPermission(request = false) {
  const res = request ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'default';
}

/** Android 12+: are exact alarms allowed (reminders on the minute)? */
export async function exactAlarmsAllowed() {
  try {
    const res = await LocalNotifications.checkExactNotificationSetting();
    return res.exact_alarm === 'granted';
  } catch {
    return true;       // older Android: always allowed
  }
}

export async function openExactAlarmSettings() {
  await LocalNotifications.changeExactNotificationSetting();
}
