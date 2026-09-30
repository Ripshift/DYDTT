/**
 * DYDTT Phase 1 — Motion Preference Utilities
 * Reads system preference + in-app override and applies to <html>.
 */

const CLASS = 'reduce-motion';

/**
 * Apply the reduced-motion class to <html> based on the setting value
 * and the system media query. In-app toggle takes precedence.
 *
 * @param {boolean|null} inAppSetting  true = force reduce, false = force full, null = follow system
 */
export function applyMotionPref(inAppSetting) {
  const systemReduces = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldReduce  = inAppSetting === true || (inAppSetting !== false && systemReduces);

  if (shouldReduce) {
    document.documentElement.classList.add(CLASS);
  } else {
    document.documentElement.classList.remove(CLASS);
  }
}

/**
 * Return true if motion should currently be reduced.
 */
export function isMotionReduced() {
  return document.documentElement.classList.contains(CLASS);
}

/**
 * Listen for system-level prefers-reduced-motion changes.
 * Re-applies preference based on the current in-app setting.
 *
 * @param {() => boolean|null} getInAppSetting  Getter for the current store value
 * @returns {() => void}  Cleanup function
 */
export function watchSystemMotionPref(getInAppSetting) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

  const handler = () => applyMotionPref(getInAppSetting());
  mq.addEventListener('change', handler);

  return () => mq.removeEventListener('change', handler);
}

/**
 * Return a safe CSS duration string — returns '0ms' when motion is reduced.
 * Useful for JS-driven animations.
 *
 * @param {string} duration  e.g. '240ms'
 */
export function safeDuration(duration) {
  return isMotionReduced() ? '0ms' : duration;
}
