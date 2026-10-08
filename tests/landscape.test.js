import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The Android app
vi.mock('../src/platform.js', () => ({ isNative: () => true, platformName: () => 'android' }));

const { openDb } = await import('../src/db/schema.js');
const { store } = await import('../src/store.js');
const { autoDesktop, applyDesktopMode, modeLabel, isSideways } = await import('../src/utils/desktopMode.js');
const SwipeController = (await import('../src/components/SwipeController.js')).default;
const Modal = (await import('../src/components/Modal.js')).default;

const html = document.documentElement;
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const clear = () => html.classList.remove('wide-layout', 'desktop-mode', 'landscape-mode');

beforeEach(async () => { await openDb(); clear(); });
afterEach(clear);

const realMatchMedia = globalThis.matchMedia;
/** Pretend the device is held sideways (or upright). */
const hold = (sideways) => {
  const fake = (q) => ({ matches: sideways && q.includes('landscape'), media: q, addEventListener() {} });
  globalThis.matchMedia = fake;
  window.matchMedia = fake;
};
afterEach(() => { globalThis.matchMedia = realMatchMedia; window.matchMedia = realMatchMedia; });

describe('Landscape Mode (Android app)', () => {
  it('is called Landscape Mode and is off by default', () => {
    expect(modeLabel()).toBe('Landscape Mode');
    expect(autoDesktop()).toBe(false);
    hold(true);
    expect(applyDesktopMode({ desktopMode: null })).toBe(false);   // even sideways
    expect(html.classList.contains('wide-layout')).toBe(false);
  });

  it('turned on, it follows the rotation: wide layouts sideways, phone layout upright', () => {
    hold(false);
    expect(isSideways()).toBe(false);
    expect(applyDesktopMode({ desktopMode: true })).toBe(false);
    expect(html.classList.contains('wide-layout')).toBe(false);

    hold(true);
    expect(applyDesktopMode({ desktopMode: true })).toBe(true);
    expect(html.classList.contains('wide-layout')).toBe(true);
    expect(html.classList.contains('landscape-mode')).toBe(true);

    hold(false);                                            // turned back upright
    expect(applyDesktopMode({ desktopMode: true })).toBe(false);
    expect(html.classList.contains('wide-layout')).toBe(false);
  });

  it('switched off: stays in the phone layout even sideways', () => {
    hold(true);
    expect(applyDesktopMode({ desktopMode: false })).toBe(false);
    expect(html.classList.contains('wide-layout')).toBe(false);
  });

  it('sideways: wide layouts, but no arrows and swiping still changes the day', () => {
    hold(true);
    applyDesktopMode({ desktopMode: true });
    expect(html.classList.contains('wide-layout')).toBe(true);
    expect(html.classList.contains('landscape-mode')).toBe(true);
    expect(html.classList.contains('desktop-mode')).toBe(false);   // arrows + swipe guard are website-only

    const el = document.createElement('div');
    const sw = new SwipeController(el);
    const seen = [];
    sw.on('swipe-left', () => seen.push('left'));
    el.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 300, clientY: 100 }));
    el.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: 100, clientY: 100 }));
    expect(seen).toEqual(['left']);
    sw.destroy();
  });

  it('Display tab shows the Landscape Mode switch with a sideways hint', async () => {
    const app = document.getElementById('app');
    new Modal({ container: app });
    await tick();
    const row = app.querySelector('#setting-desktopMode').closest('.toggle-row');
    expect(row.querySelector('.toggle-label').textContent).toBe('Landscape Mode');
    expect(row.nextElementSibling.textContent).toMatch(/turning your phone or tablet sideways/);
    expect(row.nextElementSibling.textContent).toMatch(/Swipe/);
    expect(row.nextElementSibling.textContent).not.toMatch(/Automatic/);
    expect(row.querySelector('#setting-desktopMode').checked).toBe(false);
    await store.dispatch('SETTING_SET', { key: 'desktopMode', value: null });
  });
});
