/**
 * DYDTT Phase 1 — Accessibility Utilities
 * Focus trap, live region announcements, focus helpers.
 */

// ── Live region ───────────────────────────────────────────────────────────

/**
 * Announce a message to screen readers via the aria-live region.
 * @param {string} message
 * @param {'polite'|'assertive'} priority
 */
export function announce(message, priority = 'polite') {
  const region = document.getElementById('aria-live');
  if (!region) return;

  region.setAttribute('aria-live', priority);

  // Clear then set — forces re-announcement even if same text
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}

// ── Focus trap ────────────────────────────────────────────────────────────

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Create a focus trap for a container element.
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void }} options
 * @returns {{ activate: () => void, deactivate: () => void }}
 */
export function createFocusTrap(container, { onEscape } = {}) {
  let previousFocus = null;

  function getFocusable() {
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
      el => !el.closest('[hidden]') && !el.closest('[aria-hidden="true"]')
    );
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = getFocusable();
    if (focusable.length === 0) { e.preventDefault(); return; }

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  return {
    activate() {
      previousFocus = document.activeElement;
      container.addEventListener('keydown', onKeyDown);
      const focusable = getFocusable();
      if (focusable.length) focusable[0].focus();
    },
    deactivate() {
      container.removeEventListener('keydown', onKeyDown);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
      previousFocus = null;
    },
  };
}

// ── Focus helpers ─────────────────────────────────────────────────────────

/**
 * Move focus to the first focusable element inside a container.
 * @param {HTMLElement} container
 */
export function focusFirst(container) {
  const el = container.querySelector(FOCUSABLE);
  el?.focus();
}

/**
 * Return true if the current focused element is inside the given container.
 * @param {HTMLElement} container
 */
export function containsFocus(container) {
  return container.contains(document.activeElement);
}

/**
 * Temporarily make an element programmatically focusable, focus it, then restore.
 * Useful for focusing non-interactive containers (e.g. heading after navigation).
 * @param {HTMLElement} el
 */
export function focusElement(el) {
  if (!el) return;
  const hadTabIndex = el.hasAttribute('tabindex');
  const prev = el.getAttribute('tabindex');
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
  if (!hadTabIndex) {
    el.removeAttribute('tabindex');
  } else {
    el.setAttribute('tabindex', prev);
  }
}
