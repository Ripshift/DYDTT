/**
 * DYDTT Phase 1 — Web Push Client
 * Handles subscription lifecycle and local notifications.
 * Reminder timing lives in ./reminders.js.
 */

import { urlBase64ToUint8Array } from './vapid.js';
import { logPushSent }           from '../db/schema.js';

/** The active SW registration, or null (e.g. in `pnpm dev`, where no SW is registered). */
async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration?.()) ?? null;
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

// ── Permission ────────────────────────────────────────────────────────────

/**
 * Request notification permission.
 * Returns 'granted' | 'denied' | 'default'.
 */
export async function requestPermission() {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export function getPermissionState() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ── Subscription ──────────────────────────────────────────────────────────

/**
 * Subscribe to Web Push. Returns PushSubscription or null.
 */
export async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return null;

  const permission = await requestPermission();
  if (permission !== 'granted') return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    return subscription;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return null;
  }
}

/**
 * Unsubscribe from Web Push.
 */
export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}

/**
 * Get the current push subscription, or null if not subscribed.
 */
export async function getCurrentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Close a shown reminder notification by task id.
 * @param {string} taskId
 */
export async function cancelTaskReminder(taskId) {
  const reg = await getRegistration();
  if (!reg) return;
  const notifications = await reg.getNotifications({ tag: `task-${taskId}` });
  notifications.forEach(n => n.close());
}

// ── Local Notifications ───────────────────────────────────────────────────

/**
 * Show a system notification. Uses the Service Worker when one is active
 * (needed on Android), otherwise falls back to the page Notification API.
 * Requires notification permission. Returns true if something was shown.
 *
 * @param {{ title: string, body?: string, tag?: string, icon?: string,
 *           data?: object, onClick?: () => void }} opts
 */
export async function sendLocalNotification({ title, body, tag, icon, data = {}, onClick }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  const options = {
    body,
    tag:   tag  ?? 'dydtt',
    icon:  icon ?? '/icons/icon-192x192.png',
    badge: '/icons/icon-monochrome.png',
    data,
  };

  const reg = await getRegistration();
  if (reg) {
    await reg.showNotification(title, {
      ...options,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: 'Open task' },
        { action: 'dismiss', title: 'Dismiss'   },
      ],
    });
  } else {
    const n = new Notification(title, options);
    n.onclick = () => { window.focus(); onClick?.(); n.close(); };
  }

  await logPushSent(data.taskId ?? 'local', 'shown');
  return true;
}

// ── Subscription Serialisation ────────────────────────────────────────────

/**
 * Convert a PushSubscription to a plain object for sending to the server.
 */
export function serialiseSubscription(sub) {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth:   json.keys?.auth   ?? '',
    },
  };
}
