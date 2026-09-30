import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { store } from '../src/store.js';
import { openDb } from '../src/db/schema.js';
import { router } from '../src/router.js';
import { registerSW, skipWaiting } from '../src/utils/sw.js';
import { urlBase64ToUint8Array, validateVapidKey, serialiseSubscription, printVapidKeygenHint } from '../src/push/vapid.js';
import { todayStr } from '../src/utils/dateHelpers.js';

const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'; // 87-char test key

describe('router launch params', () => {
  beforeEach(async () => { await openDb(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); history.replaceState(null, '', '/'); });

  it('?date= jumps to that day and is removed from the URL', async () => {
    history.replaceState(null, '', '/?date=2026-10-05&keep=1');
    const spy = vi.spyOn(store, 'dispatch');
    router.init();
    expect(spy).toHaveBeenCalledWith('NAV_TO_DATE', { date: '2026-10-05' });
    expect(location.search).toBe('?keep=1');
    spy.mockRestore();
  });

  it('ignores a malformed ?date=', () => {
    history.replaceState(null, '', '/?date=../../etc');
    const spy = vi.spyOn(store, 'dispatch');
    router.init();
    expect(spy).not.toHaveBeenCalled();
    expect(location.search).toBe('');
    spy.mockRestore();
  });

  it('?shortcut=today and ?shortcut=add', () => {
    const spy = vi.spyOn(store, 'dispatch').mockResolvedValue();
    history.replaceState(null, '', '/?shortcut=today');
    router.init();
    expect(spy).toHaveBeenCalledWith('NAV_TO_DATE', { date: todayStr() });

    spy.mockClear();
    history.replaceState(null, '', '/?shortcut=add');
    router.init();
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledWith('MODAL_OPEN', { tab: 'edit' });
    expect(location.search).toBe('');
    spy.mockRestore();
  });

  it('no params → nothing happens', () => {
    const spy = vi.spyOn(store, 'dispatch');
    router.init();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('service worker registration', () => {
  function fakeReg({ waiting = null } = {}) {
    const listeners = {};
    return {
      scope: '/', waiting, installing: null,
      addEventListener: (t, fn) => { listeners[t] = fn; },
      fire: (t) => listeners[t]?.(),
    };
  }

  it('shows the update toast for a waiting worker; Refresh sends SKIP_WAITING', async () => {
    const worker = { postMessage: vi.fn() };
    navigator.serviceWorker.register.mockResolvedValue(fakeReg({ waiting: worker }));
    await registerSW();
    const toast = document.querySelector('.toast');
    expect(toast.textContent).toContain('A new version is available');
    toast.querySelector('.btn--primary').click();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('shows the toast when an update installs later, only if a SW already controls the page', async () => {
    const reg = fakeReg();
    navigator.serviceWorker.register.mockResolvedValue(reg);
    navigator.serviceWorker.controller = {};
    await registerSW();
    const incoming = { state: 'installing', addEventListener: (t, fn) => { incoming.onchange = fn; } };
    reg.installing = incoming;
    reg.fire('updatefound');
    incoming.state = 'installed';
    incoming.onchange();
    expect(document.querySelector('.toast')).not.toBeNull();
    navigator.serviceWorker.controller = null;
  });

  it('updatefound with nothing installing is ignored; registration errors are caught', async () => {
    const reg = fakeReg();
    navigator.serviceWorker.register.mockResolvedValue(reg);
    await registerSW();
    reg.fire('updatefound');
    expect(document.querySelector('.toast')).toBeNull();

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    navigator.serviceWorker.register.mockRejectedValue(new Error('nope'));
    await registerSW();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('reloads on controllerchange only when replacing an existing SW', async () => {
    const reload = vi.fn();
    const realLocation = window.location;
    vi.stubGlobal('location', { ...realLocation, reload });
    navigator.serviceWorker.register.mockResolvedValue(fakeReg());

    navigator.serviceWorker.controller = null;                 // first install
    await registerSW();
    navigator.serviceWorker.addEventListener.mock.calls.at(-1)[1]();
    expect(reload).not.toHaveBeenCalled();

    navigator.serviceWorker.controller = {};                   // update
    await registerSW();
    const onChange = navigator.serviceWorker.addEventListener.mock.calls.at(-1)[1];
    onChange(); onChange();
    expect(reload).toHaveBeenCalledTimes(1);
    navigator.serviceWorker.controller = null;
    vi.stubGlobal('location', realLocation);   // (don't unstub all — setup.js stubs navigator/Notification)
  });

  it('skipWaiting posts the message', () => {
    const w = { postMessage: vi.fn() };
    skipWaiting(w);
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });
});

describe('vapid helpers', () => {
  it('urlBase64ToUint8Array decodes a 65-byte key', () => {
    const arr = urlBase64ToUint8Array(KEY);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBe(65);
    expect(() => urlBase64ToUint8Array('')).toThrow(/missing/);
  });
  it('validateVapidKey', () => {
    expect(validateVapidKey(KEY)).toEqual({ valid: true });
    expect(validateVapidKey('').valid).toBe(false);
    expect(validateVapidKey('abc').reason).toMatch(/length/);
    expect(validateVapidKey('!'.repeat(87)).reason).toMatch(/invalid/);
  });
  it('serialiseSubscription + keygen hint', () => {
    expect(serialiseSubscription({ toJSON: () => ({}) })).toEqual({ endpoint: '', keys: { p256dh: '', auth: '' } });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    printVapidKeygenHint();
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});

describe('push client', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('subscribeToPush returns null without a VAPID key', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    const c = await import('../src/push/client.js');
    expect(await c.subscribeToPush()).toBeNull();
  });

  it('subscribe / reuse / unsubscribe / current subscription with a key', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY);
    const c = await import('../src/push/client.js');
    Notification.requestPermission.mockResolvedValue('granted');
    const reg = await navigator.serviceWorker.ready;

    const sub = await c.subscribeToPush();
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(c.serialiseSubscription(sub).keys.p256dh).toBe('mock-p256dh');

    reg.pushManager.getSubscription.mockResolvedValueOnce(sub);
    expect(await c.subscribeToPush()).toBe(sub);                       // reuses existing

    reg.pushManager.getSubscription.mockResolvedValueOnce(sub);
    expect(await c.getCurrentSubscription()).toBe(sub);

    const unsub = { unsubscribe: vi.fn() };
    reg.pushManager.getSubscription.mockResolvedValueOnce(unsub);
    await c.unsubscribeFromPush();
    expect(unsub.unsubscribe).toHaveBeenCalled();

    reg.pushManager.subscribe.mockRejectedValueOnce(new Error('denied'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await c.subscribeToPush()).toBeNull();
    err.mockRestore();

    Notification.requestPermission.mockResolvedValue('denied');
    expect(await c.subscribeToPush()).toBeNull();
  });

  it('sendLocalNotification uses the SW registration when there is one; cancel closes it', async () => {
    const c = await import('../src/push/client.js');
    const shown = [];
    const close = vi.fn();
    const reg = { showNotification: vi.fn(async (t, o) => shown.push([t, o])), getNotifications: vi.fn(async () => [{ close }]) };
    navigator.serviceWorker.getRegistration = vi.fn(async () => reg);
    vi.stubGlobal('Notification', class { static permission = 'granted'; });

    expect(await c.sendLocalNotification({ title: 'T', body: 'B', data: { taskId: 'x' } })).toBe(true);
    expect(shown[0][1]).toMatchObject({ body: 'B', tag: 'dydtt', actions: expect.any(Array) });
    await c.cancelTaskReminder('x');
    expect(reg.getNotifications).toHaveBeenCalledWith({ tag: 'task-x' });
    expect(close).toHaveBeenCalled();

    navigator.serviceWorker.getRegistration = vi.fn(async () => undefined);
    await expect(c.cancelTaskReminder('x')).resolves.toBeUndefined();
    delete navigator.serviceWorker.getRegistration;
  });

  it('page Notification fallback + click handler; nothing without permission', async () => {
    const c = await import('../src/push/client.js');
    const made = [];
    vi.stubGlobal('Notification', class { static permission = 'granted'; constructor(t, o) { this.close = vi.fn(); made.push(this); this.t = t; this.o = o; } });
    const onClick = vi.fn();
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    await c.sendLocalNotification({ title: 'T', body: 'B', onClick });
    made[0].onclick();
    expect(onClick).toHaveBeenCalled();
    expect(made[0].close).toHaveBeenCalled();
    focus.mockRestore();

    vi.stubGlobal('Notification', class { static permission = 'default'; });
    expect(await c.sendLocalNotification({ title: 'T' })).toBe(false);
    expect(c.getPermissionState()).toBe('default');
  });

  it('requestPermission / getPermissionState when Notification is unsupported', async () => {
    const c = await import('../src/push/client.js');
    const saved = window.Notification;
    delete window.Notification; delete globalThis.Notification;
    expect(await c.requestPermission()).toBe('denied');
    expect(c.getPermissionState()).toBe('denied');
    globalThis.Notification = saved;
  });
});
