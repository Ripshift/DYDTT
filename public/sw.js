/**
 * DYDTT Phase 1 — Service Worker
 * Workbox injectManifest strategy. Vite injects __WB_MANIFEST at build time.
 */

import { clientsClaim }               from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute }          from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin }            from 'workbox-expiration';
import { CacheableResponsePlugin }     from 'workbox-cacheable-response';
import { BackgroundSyncPlugin }        from 'workbox-background-sync';

clientsClaim();
// No unconditional self.skipWaiting(): a new version waits until the user
// taps "Refresh" in the update toast (see src/utils/sw.js → SKIP_WAITING).

// ── Precache app shell (injected by Vite at build time) ───────────────────
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ── Navigation: serve index.html for all routes ───────────────────────────
registerRoute(new NavigationRoute(
  new NetworkFirst({
    cacheName: 'dydtt-navigation',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
));

// ── Google Fonts ──────────────────────────────────────────────────────────
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 }),
    ],
  })
);

// ── Static assets (JS, CSS, images) ──────────────────────────────────────
registerRoute(
  ({ request }) => ['style', 'script', 'worker', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'dydtt-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// ── Background Sync for offline writes ───────────────────────────────────
const bgSyncPlugin = new BackgroundSyncPlugin('dydtt-sync-queue', {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
});

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'dydtt-api',
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

// ── Push notifications ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'DYDTT', body: event.data.text() }; }

  const { title = 'DYDTT', body = '', icon, tag, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  icon  ?? '/icons/icon-192x192.png',
      badge:        '/icons/icon-monochrome.png',
      tag:   tag   ?? 'dydtt-reminder',
      data:  data  ?? {},
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: 'Open task' },
        { action: 'dismiss', title: 'Dismiss'   },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data ?? {};

  event.waitUntil((async () => {
    // Reuse an open DYDTT window and tell it which task to show
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clientList.find(c => 'focus' in c);
    if (client) {
      await client.focus();
      client.postMessage({ type: 'REMINDER_CLICK', taskId: data.taskId, date: data.date });
      return;
    }
    // Otherwise open the app on the task's day
    return clients.openWindow(data.date ? `/?date=${data.date}` : (data.url ?? '/'));
  })());
});

// ── Skip-waiting message ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
