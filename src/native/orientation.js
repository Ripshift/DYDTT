/**
 * DYDTT — Screen rotation in the Android app
 * The app stays upright unless Display ▸ Landscape Mode is on, even if the
 * phone has auto-rotate turned on. With Landscape Mode on it turns freely
 * (following the phone's own auto-rotate setting).
 * The manifest also asks for portrait, so the app never flashes sideways
 * before this runs.
 */

import { ScreenOrientation } from '@capacitor/screen-orientation';

let current = null;   // 'portrait' | 'free'

/** Lock to portrait, or let the screen turn. Only calls Android when it changes. */
export async function syncOrientation(allowSideways) {
  const want = allowSideways ? 'free' : 'portrait';
  if (want === current) return;
  current = want;
  try {
    if (allowSideways) await ScreenOrientation.unlock();
    else await ScreenOrientation.lock({ orientation: 'portrait' });
  } catch (err) {
    current = null;                             // try again next time
    console.warn('[orientation]', err);
  }
}

/** For tests. */
export function _resetOrientation() { current = null; }
