import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, db } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { todayStr, addDays } from '../src/utils/dateHelpers.js';
import { initGlobalSwipe, swipeDirection } from '../src/components/GlobalSwipe.js';
import WeekGridView from '../src/components/WeekGridView.js';

const TODAY = todayStr();
const html = document.documentElement;
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

/** A finger drag from (x0,y0) to (x1,y1) starting on `el`. */
function fingerSwipe(el, x0, y0, x1, y1) {
  const t0 = { clientX: x0, clientY: y0, target: el };
  const t1 = { clientX: x1, clientY: y1, target: el };
  el.dispatchEvent(Object.assign(new Event('touchstart', { bubbles: true }), { touches: [t0], changedTouches: [t0] }));
  // the task list scrolling would cancel pointer events here — touch events carry on
  el.dispatchEvent(Object.assign(new Event('pointercancel', { bubbles: true }), { pointerType: 'touch' }));
  el.dispatchEvent(Object.assign(new Event('touchend', { bubbles: true }), { touches: [], changedTouches: [t1] }));
}
function mouseDrag(el, x0, x1) {
  el.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse', button: 0, clientX: x0, clientY: 100 }));
  el.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), { pointerType: 'mouse', button: 0, clientX: x1, clientY: 100 }));
}

let stop;
beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await store.dispatch('NAV_TO_DATE', { date: TODAY });
  stop = initGlobalSwipe();
});
afterEach(async () => {
  stop();
  html.classList.remove('desktop-mode');
  document.querySelectorAll('.secret-page, .x-test').forEach(n => n.remove());
  if (store.state.ui.modalOpen) await store.dispatch('MODAL_CLOSE');
});

describe('swipe anywhere to change day', () => {
  it('works out direction and ignores short or steep drags', () => {
    expect(swipeDirection(300, 100, 100, 110)).toBe('left');
    expect(swipeDirection(100, 100, 300, 90)).toBe('right');
    expect(swipeDirection(100, 100, 130, 100)).toBeNull();     // too short
    expect(swipeDirection(100, 100, 160, 300)).toBeNull();     // mostly vertical (scrolling)
  });

  it('a finger swipe on a task list (even while it scrolls) changes the day', async () => {
    const list = document.createElement('div');
    list.className = 'task-list x-test';
    list.innerHTML = '<div class="task-item"><span>Task</span></div>';
    document.getElementById('app').appendChild(list);
    fingerSwipe(list.querySelector('span'), 300, 200, 80, 215);
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    fingerSwipe(list, 80, 200, 300, 190);
    fingerSwipe(list, 80, 200, 300, 190);
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, -1));
  });

  it('works on the 3×3 grid page too', async () => {
    const box = document.createElement('div');
    box.className = 'x-test';
    document.getElementById('app').appendChild(box);
    const view = new WeekGridView({ container: box });
    await store.dispatch('REFRESH');
    fingerSwipe(box.querySelector('.wgv__tasks') ?? box, 400, 300, 150, 300);
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    fingerSwipe(box.querySelector('.wgv__grid'), 100, 100, 320, 100);
    await tick();
    expect(store.state.currentDate).toBe(TODAY);
    view.destroy();
  });

  it('not while the menu or the cat\'s room is open, or in a text box', async () => {
    const el = document.getElementById('app');
    await store.dispatch('MODAL_OPEN');
    fingerSwipe(el, 300, 100, 50, 100);
    await store.dispatch('MODAL_CLOSE');
    const room = document.createElement('div');
    room.className = 'secret-page';
    document.body.appendChild(room);
    fingerSwipe(room, 300, 100, 50, 100);
    room.remove();
    const input = document.createElement('input');
    input.className = 'x-test';
    el.appendChild(input);
    fingerSwipe(input, 300, 100, 50, 100);
    await tick();
    expect(store.state.currentDate).toBe(TODAY);
  });

  it('mouse drags count, except in Desktop Mode (arrows there)', async () => {
    const el = document.getElementById('app');
    mouseDrag(el, 300, 100);
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    html.classList.add('desktop-mode');
    mouseDrag(el, 300, 100);
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
  });
});
