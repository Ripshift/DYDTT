/**
 * DYDTT — Swipe anywhere to change day
 *
 * One listener for the whole screen (top bar, date, task lists, the 3×3 grid,
 * both 48-hour columns…): swipe left → next day, swipe right → previous day.
 *
 * Uses touch events for fingers, because the browser cancels pointer events
 * as soon as a finger starts scrolling a task list — that's why swipes used to
 * work only on parts of the screen. A mouse drag counts too, except in Desktop
 * Mode (website), where the ‹ › arrows change the day.
 *
 * Ignored while the menu, a dialog or the cat's room is open, and when the
 * gesture starts in a text field.
 */

import { store } from '../store.js';

export const SWIPE_MIN_PX = 50;
export const SWIPE_MAX_ANGLE = 35;      // degrees off horizontal

const BLOCKERS = '.secret-page, .modal-overlay, .dialog-overlay, .toast, input, textarea, select, [contenteditable="true"], .no-swipe';

/** Is a gesture from (x0,y0) to (x1,y1) a horizontal swipe? → 'left' | 'right' | null */
export function swipeDirection(x0, y0, x1, y1, min = SWIPE_MIN_PX, maxAngle = SWIPE_MAX_ANGLE) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < min) return null;
  const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
  if (!(angle < maxAngle || angle > 180 - maxAngle)) return null;
  return dx < 0 ? 'left' : 'right';
}

function blocked(target) {
  if (store.state.ui?.modalOpen) return true;
  if (document.querySelector('.secret-page, .dialog-overlay')) return true;
  return Boolean(target?.closest?.(BLOCKERS));
}

let started = false;

/**
 * Start listening. Returns a stop function.
 * @param {{ target?: EventTarget, onSwipe?: (dir: 'left'|'right') => void }} [opts]
 */
export function initGlobalSwipe({ target = document, onSwipe } = {}) {
  const go = onSwipe ?? ((dir) => store.dispatch(dir === 'left' ? 'NAV_NEXT_DAY' : 'NAV_PREV_DAY'));
  let start = null;                       // { x, y, kind }

  const begin = (x, y, kind, el) => { start = blocked(el) ? null : { x, y, kind }; };
  const end = (x, y, kind) => {
    const s = start;
    start = null;
    if (!s || s.kind !== kind) return;
    const dir = swipeDirection(s.x, s.y, x, y);
    if (dir) go(dir);
  };

  // Fingers
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) { start = null; return; }   // pinch etc.
    const t = e.touches[0];
    begin(t.clientX, t.clientY, 'touch', e.target);
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    if (t) end(t.clientX, t.clientY, 'touch');
  };
  const onTouchCancel = () => { start = null; };

  // Mouse / pen (fingers are handled above)
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return;
    if (e.button !== undefined && e.button !== 0) return;
    if (document.documentElement.classList.contains('desktop-mode')) { start = null; return; }
    begin(e.clientX, e.clientY, 'pointer', e.target);
  };
  const onPointerUp = (e) => {
    if (e.pointerType === 'touch') return;
    end(e.clientX, e.clientY, 'pointer');
  };

  const opts = { passive: true };
  target.addEventListener('touchstart', onTouchStart, opts);
  target.addEventListener('touchend', onTouchEnd, opts);
  target.addEventListener('touchcancel', onTouchCancel, opts);
  target.addEventListener('pointerdown', onPointerDown, opts);
  target.addEventListener('pointerup', onPointerUp, opts);
  started = true;

  return () => {
    target.removeEventListener('touchstart', onTouchStart, opts);
    target.removeEventListener('touchend', onTouchEnd, opts);
    target.removeEventListener('touchcancel', onTouchCancel, opts);
    target.removeEventListener('pointerdown', onPointerDown, opts);
    target.removeEventListener('pointerup', onPointerUp, opts);
    started = false;
  };
}

export function isGlobalSwipeOn() { return started; }
