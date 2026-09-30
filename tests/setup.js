/**
 * DYDTT Phase 1 — Vitest Global Test Setup
 * Runs before every test file. Mocks browser APIs unavailable in jsdom.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ── IndexedDB — use fake-indexeddb ────────────────────────────────────────
import 'fake-indexeddb/auto';

// ── Crypto — randomUUID ───────────────────────────────────────────────────
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

// ── Service Worker ────────────────────────────────────────────────────────
vi.stubGlobal('navigator', {
  ...navigator,
  serviceWorker: {
    register:    vi.fn().mockResolvedValue({ scope: '/' }),
    ready:       Promise.resolve({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe:       vi.fn().mockResolvedValue({
          endpoint: 'https://fcm.googleapis.com/mock-endpoint',
          toJSON: () => ({
            endpoint: 'https://fcm.googleapis.com/mock-endpoint',
            keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' },
          }),
          unsubscribe: vi.fn().mockResolvedValue(true),
        }),
      },
      showNotification: vi.fn().mockResolvedValue(undefined),
      getNotifications: vi.fn().mockResolvedValue([]),
    }),
    addEventListener:    vi.fn(),
    removeEventListener: vi.fn(),
    controller: null,
  },
});

// ── Notification ──────────────────────────────────────────────────────────
vi.stubGlobal('Notification', class MockNotification {
  static permission = 'default';
  static requestPermission = vi.fn().mockResolvedValue('granted');
  constructor(title, options) {
    this.title   = title;
    this.options = options;
    this.close   = vi.fn();
  }
});

// ── matchMedia ────────────────────────────────────────────────────────────
vi.stubGlobal('matchMedia', (query) => ({
  matches:             false,
  media:               query,
  onchange:            null,
  addListener:         vi.fn(),
  removeListener:      vi.fn(),
  addEventListener:    vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent:       vi.fn(),
}));

// ── localStorage ─────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store = {};
  return {
    getItem:    (key)        => store[key]  ?? null,
    setItem:    (key, val)   => { store[key] = String(val); },
    removeItem: (key)        => { delete store[key]; },
    clear:      ()           => { store = {}; },
    get length()             { return Object.keys(store).length; },
    key:        (i)          => Object.keys(store)[i] ?? null,
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

// ── structuredClone (Node < 17 fallback) ──────────────────────────────────
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// ── DOM helpers ───────────────────────────────────────────────────────────
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';

  const live = document.createElement('div');
  live.id = 'aria-live';
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});
