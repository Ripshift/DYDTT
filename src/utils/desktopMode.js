/**
 * DYDTT — Desktop Mode (Display ▸ Desktop Mode)
 *
 * A widescreen layout for using DYDTT with a mouse:
 *   • 1 day   — date sidebar on the left (cat in its top-left), tasks on the right
 *   • 48 hour — normal top bar, the two days side by side
 *   • 3×3     — normal top bar, the grid on the left, the day's tasks on the right
 *   • small ‹ › arrows at the screen edges change the day
 *   • swiping no longer changes the day (a mouse drag shouldn't)
 *
 * Setting `desktopMode`: true / false, or null = automatic (on for the website
 * on a wide screen with a mouse; never automatic in the Android app).
 *
 * <html> gets `desktop-mode` when it's on, and `data-view` = the current view,
 * so the CSS can lay each view out. The wide layouts only kick in at
 * DESKTOP_MIN_WIDTH — a narrow window keeps the phone layout (arrows still show).
 */

import { store } from '../store.js';
import { isNative } from '../platform.js';

export const DESKTOP_MIN_WIDTH = 900;
const AUTO_QUERY = '(pointer: fine) and (min-width: 1024px)';

const mq = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/** Would Desktop Mode switch itself on here? */
export function autoDesktop() {
  if (isNative()) return false;
  return Boolean(mq(AUTO_QUERY)?.matches);
}

/** Is Desktop Mode on (setting, or automatic)? */
export function isDesktopMode(settings = store.state.settings) {
  const v = settings?.desktopMode;
  return v === true || v === false ? v : autoDesktop();
}

/** Put the classes on <html>. */
export function applyDesktopMode(settings = store.state.settings) {
  const on = isDesktopMode(settings);
  document.documentElement.classList.toggle('desktop-mode', on);
  return on;
}

/** Tell the CSS which view is showing. */
export function setViewAttr(view) {
  document.documentElement.dataset.view = view;
}

let started = false;
export function initDesktopMode() {
  applyDesktopMode();
  if (started) return;
  started = true;
  store.subscribe('settings', (s) => applyDesktopMode(s));
  mq(AUTO_QUERY)?.addEventListener?.('change', () => applyDesktopMode());
}
