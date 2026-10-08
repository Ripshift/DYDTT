import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, openDb, getSetting } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { todayStr, addDays } from '../src/utils/dateHelpers.js';
import { autoDesktop, isDesktopMode, applyDesktopMode, initDesktopMode, setViewAttr } from '../src/utils/desktopMode.js';
import { createDayArrows } from '../src/components/DayArrows.js';
import SwipeController from '../src/components/SwipeController.js';
import DayView from '../src/components/DayView.js';
import Modal from '../src/components/Modal.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const TODAY = todayStr();
const html = document.documentElement;
const realMatchMedia = globalThis.matchMedia;

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await store.dispatch('SETTING_SET', { key: 'desktopMode', value: null });
  await store.dispatch('NAV_TO_DATE', { date: TODAY });
  html.classList.remove('desktop-mode');
});
afterEach(() => {
  html.classList.remove('wide-layout', 'landscape-mode');
  globalThis.matchMedia = realMatchMedia;
  window.matchMedia = realMatchMedia;
  html.classList.remove('desktop-mode');
});

describe('Desktop Mode setting', () => {
  it('automatic: on only for a wide screen with a mouse (never in the app)', () => {
    expect(autoDesktop()).toBe(false);                       // test setup: matchMedia → false
    const fake = (q) => ({ matches: true, media: q, addEventListener() {} });
    globalThis.matchMedia = fake;
    window.matchMedia = fake;
    expect(autoDesktop()).toBe(true);
    expect(isDesktopMode({ desktopMode: null })).toBe(true);
    expect(isDesktopMode({ desktopMode: false })).toBe(false);
    expect(isDesktopMode({ desktopMode: true })).toBe(true);
  });

  it('puts desktop-mode on <html> and follows the setting', async () => {
    initDesktopMode();
    expect(html.classList.contains('desktop-mode')).toBe(false);
    await store.dispatch('SETTING_SET', { key: 'desktopMode', value: true });
    expect(html.classList.contains('desktop-mode')).toBe(true);
    expect(html.classList.contains('wide-layout')).toBe(true);
    expect(html.classList.contains('landscape-mode')).toBe(false);
    expect(await getSetting('desktopMode')).toBe(true);
    await store.dispatch('SETTING_SET', { key: 'desktopMode', value: false });
    expect(html.classList.contains('desktop-mode')).toBe(false);
    expect(applyDesktopMode({ desktopMode: true })).toBe(true);
    setViewAttr('48h');
    expect(html.dataset.view).toBe('48h');
  });

  it('Display tab has a Desktop Mode switch', async () => {
    const app = document.getElementById('app');
    new Modal({ container: app });
    await tick();
    const sw = app.querySelector('#setting-desktopMode');
    expect(sw).not.toBeNull();
    expect(sw.checked).toBe(false);
    expect(sw.closest('.toggle-row').querySelector('.toggle-label').textContent).toBe('Desktop Mode');
    expect(sw.closest('.toggle-row').nextElementSibling.textContent).toMatch(/Automatic/);
    sw.checked = true;
    sw.dispatchEvent(new Event('change'));
    await tick();
    expect(store.state.settings.desktopMode).toBe(true);
    expect(sw.closest('.toggle-row').nextElementSibling.textContent).not.toMatch(/Automatic/);
  });
});

describe('Desktop Mode navigation', () => {
  it('‹ › arrows go to the previous / next day', async () => {
    const arrows = createDayArrows();
    arrows.querySelector('.day-arrow--next').click();
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    arrows.querySelector('.day-arrow--prev').click();
    arrows.querySelector('.day-arrow--prev').click();
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, -1));
    expect(arrows.querySelector('.day-arrow--prev').getAttribute('aria-label')).toBe('Previous day');
  });

  it('swiping changes the day normally, but not in Desktop Mode (keys still work)', () => {
    const el = document.createElement('div');
    const sw = new SwipeController(el);
    const seen = [];
    sw.on('swipe-left', () => seen.push('left'));
    sw.on('swipe-right', () => seen.push('right'));
    const drag = (x0, x1) => {
      el.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: x0, clientY: 100 }));
      el.dispatchEvent(Object.assign(new Event('pointerup'), { clientX: x1, clientY: 100 }));
    };
    drag(300, 100);
    expect(seen).toEqual(['left']);
    html.classList.add('desktop-mode');
    drag(300, 100);
    drag(100, 300);
    expect(seen).toEqual(['left']);                          // mouse drags ignored
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(seen).toEqual(['left', 'right']);
    sw.destroy();
  });

  it('day header shows progress for the sidebar', async () => {
    const container = document.createElement('div');
    document.getElementById('app').appendChild(container);
    const view = new DayView({ container });
    const progress = () => container.querySelector('.day-header__progress').textContent;
    expect(progress()).toBe('Nothing planned');
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'One' });
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'Two' });
    expect(progress()).toBe('0 of 2 done');
    await store.dispatch('TASK_TOGGLE', { id: store.state.tasks[0].id });
    expect(progress()).toBe('1 of 2 done');
    await store.dispatch('TASK_TOGGLE', { id: store.state.tasks[1].id });
    expect(progress()).toBe('All 2 done');
    view.destroy();
  });
});
