/**
 * DYDTT Phase 1 — Service Worker Registration Utility
 * Handles SW registration, update detection, and skip-waiting.
 */

import { showToast } from './toast.js';

/**
 * Register the Vite-generated service worker.
 * Shows a "Refresh to update" toast when a new SW is waiting.
 */
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.info('[SW] Registered:', reg.scope);

    // Detect update waiting on page load
    if (reg.waiting) {
      showUpdateToast(reg.waiting);
    }

    // Detect update arriving after page loaded
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;

      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateToast(incoming);
        }
      });
    });

    // Reload when a NEW SW takes control (not on the very first install,
    // where clientsClaim() also fires controllerchange)
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });

  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

/**
 * Tell the waiting SW to skip waiting and activate immediately.
 * @param {ServiceWorker} worker
 */
export function skipWaiting(worker) {
  worker.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Show a non-blocking "Refresh to update" toast.
 * @param {ServiceWorker} worker
 */
function showUpdateToast(worker) {
  showToast({
    message: 'A new version is available',
    actions: [
      { label: 'Refresh', primary: true, onClick: () => skipWaiting(worker) },
      { label: 'Later' },
    ],
  });
}
