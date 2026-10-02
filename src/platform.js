/**
 * DYDTT — Where are we running?
 * Web / installed PWA, or the Android app (Capacitor).
 */

import { Capacitor } from '@capacitor/core';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export function platformName() {
  return Capacitor.getPlatform();        // 'web' | 'android' | 'ios'
}
