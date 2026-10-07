/**
 * DYDTT — ‹ › day arrows (Desktop Mode only).
 * Small buttons at the left and right edges of the screen that go to the
 * previous / next day — the mouse-friendly replacement for swiping.
 * Hidden by CSS unless <html> has `desktop-mode`.
 */

import { store } from '../store.js';

export function createDayArrows() {
  const make = (dir) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `day-arrow day-arrow--${dir}`;
    b.setAttribute('aria-label', dir === 'prev' ? 'Previous day' : 'Next day');
    b.innerHTML = dir === 'prev'
      ? '<svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 12 20" width="12" height="20" aria-hidden="true"><path d="m2 2 8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    b.addEventListener('click', () => store.dispatch(dir === 'prev' ? 'NAV_PREV_DAY' : 'NAV_NEXT_DAY'));
    return b;
  };
  const wrap = document.createElement('div');
  wrap.className = 'day-arrows';
  wrap.append(make('prev'), make('next'));
  return wrap;
}
