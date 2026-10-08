/**
 * DYDTT — Desktop Mode (website) / Landscape Mode (Android app)
 *
 * One setting, Display ▸ Desktop Mode — called "Landscape Mode" in the app.
 * Both switch on the widescreen layouts:
 *   • 1 day   — date sidebar on the left (cat in its top-left), tasks on the right
 *   • 48 hour — normal top bar, the two days side by side
 *   • 3×3     — normal top bar, the grid on the left, the day's tasks on the right
 * Desktop Mode (website, for a mouse) also adds:
 *   • small ‹ › arrows at the screen edges to change the day
 *   • swiping no longer changes the day
 * Landscape Mode (app, off by default) — once turned on, switches the layouts
 * on by itself whenever the phone or tablet is turned sideways, and back to the phone layout when it's upright.
 * It keeps swiping and has no arrows.
 *
 * Setting `desktopMode`: true / false, or null = automatic (on for the website
 * on a wide screen with a mouse; off in the app until you turn it on).
 *
 * <html> classes: `wide-layout` (the layouts), plus `desktop-mode` (website:
 * arrows, no swipe) or `landscape-mode` (app); `data-view` = the current view.
 * The wide layouts kick in at DESKTOP_MIN_WIDTH, or on any screen held sideways
 * that is at least LANDSCAPE_MIN_WIDTH wide (small phones included — a short
 * screen gets a compact version). Held upright, the phone layout stays.
 */

import { store } from '../store.js';
import { isNative } from '../platform.js';

export const DESKTOP_MIN_WIDTH = 900;
export const LANDSCAPE_MIN_WIDTH = 480;
const AUTO_QUERY = '(pointer: fine) and (min-width: 1024px)';
const SIDEWAYS_QUERY = '(orientation: landscape)';

const mq = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null);

/** Would Desktop Mode switch itself on here? */
export function autoDesktop() {
  if (isNative()) return false;                // the app: off until you turn it on
  return Boolean(mq(AUTO_QUERY)?.matches);
}

/** Is Desktop Mode on (setting, or automatic)? */
export function isDesktopMode(settings = store.state.settings) {
  const v = settings?.desktopMode;
  return v === true || v === false ? v : autoDesktop();
}

/** What the switch is called here. */
export function modeLabel() {
  return isNative() ? 'Landscape Mode' : 'Desktop Mode';
}

/** Is the device held sideways? */
export function isSideways() {
  return Boolean(mq(SIDEWAYS_QUERY)?.matches);
}

/** Put the classes on <html>. Returns whether the wide layouts are in use now
 *  (in the app only while the device is sideways). */
export function applyDesktopMode(settings = store.state.settings) {
  const app = isNative();
  const on = isDesktopMode(settings) && (!app || isSideways());
  const cl = document.documentElement.classList;
  cl.toggle('wide-layout', on);
  cl.toggle('desktop-mode', on && !app);       // arrows, no swiping
  cl.toggle('landscape-mode', on && app);      // swiping stays
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
  mq(SIDEWAYS_QUERY)?.addEventListener?.('change', () => applyDesktopMode());   // rotation
  window.addEventListener?.('orientationchange', () => applyDesktopMode());     // older WebViews
}
