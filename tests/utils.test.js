import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as D from '../src/utils/dateHelpers.js';
import { announce, createFocusTrap, focusFirst, containsFocus, focusElement } from '../src/utils/a11y.js';
import { applyMotionPref, isMotionReduced, watchSystemMotionPref, safeDuration } from '../src/utils/motionPrefs.js';
import { showToast } from '../src/utils/toast.js';

describe('dateHelpers (display)', () => {
  it('relativeLabel', () => {
    const t = D.todayStr();
    expect(D.relativeLabel(t)).toBe('Today');
    expect(D.relativeLabel(D.addDays(t, 1))).toBe('Tomorrow');
    expect(D.relativeLabel(D.addDays(t, -1))).toBe('Yesterday');
    expect(D.relativeLabel('2020-03-05')).toMatch(/^\w+, Mar 5$/);   // a date that's never today ± 1
  });
  it('parseDisplayDate', () => {
    expect(D.parseDisplayDate('2026-10-01')).toMatchObject({ day: 1, weekday: 'Thursday', month: 'October', monthAbbr: 'Oct', year: 2026 });
  });
  it('formatTime', () => {
    expect(D.formatTime(new Date(2026, 9, 1, 14, 5).getTime())).toBe('2:05 PM');
  });
  it('isUpcoming + countdownLabel', () => {
    const now = Date.now();
    expect(D.isUpcoming(now + 1000)).toBe(true);
    expect(D.isUpcoming(now - 1000)).toBe(false);
    expect(D.isUpcoming(null)).toBe(false);
    expect(D.countdownLabel(now - 1)).toBe('now');
    expect(D.countdownLabel(now + 10 * 60_000)).toBe('in 10m');
    expect(D.countdownLabel(now + 3 * 3_600_000)).toBe('in 3h');
  });
});

describe('a11y', () => {
  it('announce sets the live region text on the next frame', async () => {
    announce('Hello', 'assertive');
    const region = document.getElementById('aria-live');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    await new Promise(r => requestAnimationFrame(r));
    expect(region.textContent).toBe('Hello');
  });

  it('announce is a no-op without a live region', () => {
    document.getElementById('aria-live').remove();
    expect(() => announce('x')).not.toThrow();
  });

  it('focus trap: focuses first, wraps Tab / Shift+Tab, Escape, restores focus', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    const box = document.createElement('div');
    box.innerHTML = '<button id="a">a</button><input id="b"><button id="c" disabled>c</button><div hidden><button>h</button></div>';
    document.body.appendChild(box);
    const onEscape = vi.fn();
    const trap = createFocusTrap(box, { onEscape });
    trap.activate();
    expect(document.activeElement.id).toBe('a');

    const key = (k, shift = false) => box.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
    box.querySelector('#b').focus();
    key('Tab');
    expect(document.activeElement.id).toBe('a');           // wrapped forward
    key('Tab', true);
    expect(document.activeElement.id).toBe('b');           // wrapped backward
    key('Enter');                                          // ignored
    key('Escape');
    expect(onEscape).toHaveBeenCalled();

    trap.deactivate();
    expect(document.activeElement).toBe(outside);
  });

  it('focus trap with nothing focusable swallows Tab', () => {
    const box = document.createElement('div');
    document.body.appendChild(box);
    const trap = createFocusTrap(box);
    trap.activate();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    box.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    trap.deactivate();
  });

  it('focusFirst / containsFocus / focusElement', () => {
    const box = document.createElement('div');
    box.innerHTML = '<p id="p">text</p><h2 id="h" tabindex="3">Head</h2><a href="#x" id="l">link</a>';
    document.body.appendChild(box);
    focusFirst(box);
    expect(document.activeElement.id).toBe('h');
    expect(containsFocus(box)).toBe(true);

    focusElement(box.querySelector('#p'));
    expect(document.activeElement.id).toBe('p');
    expect(box.querySelector('#p').hasAttribute('tabindex')).toBe(false);   // restored
    focusElement(box.querySelector('#h'));
    expect(box.querySelector('#h').getAttribute('tabindex')).toBe('3');     // restored
    expect(() => focusElement(null)).not.toThrow();
  });
});

describe('motionPrefs', () => {
  afterEach(() => document.documentElement.classList.remove('reduce-motion'));

  it('in-app setting wins; null follows the system', () => {
    applyMotionPref(true);
    expect(isMotionReduced()).toBe(true);
    expect(safeDuration('240ms')).toBe('0ms');
    applyMotionPref(false);
    expect(isMotionReduced()).toBe(false);
    expect(safeDuration('240ms')).toBe('240ms');

    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    applyMotionPref(null);
    expect(isMotionReduced()).toBe(true);
  });

  it('watchSystemMotionPref re-applies on change and cleans up', () => {
    let handler;
    const mq = { matches: true, addEventListener: vi.fn((_, h) => { handler = h; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => mq);
    const stop = watchSystemMotionPref(() => null);
    handler();
    expect(isMotionReduced()).toBe(true);
    stop();
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', handler);
  });
});

describe('toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses after the timeout', () => {
    const { el } = showToast({ message: 'Saved', variant: 'success', timeout: 1000 });
    expect(el.className).toContain('toast--success');
    vi.advanceTimersByTime(1000);
    expect(el.className).toContain('toast--exit');
    vi.advanceTimersByTime(300);
    expect(el.isConnected).toBe(false);
  });

  it('action buttons run their handler and dismiss; dismiss twice is safe', () => {
    const onClick = vi.fn();
    const t = showToast({ title: 'Hi', message: 'There', actions: [{ label: 'Go', primary: true, onClick }] });
    expect(t.el.querySelector('.toast__title').textContent).toBe('Hi');
    t.el.querySelector('.btn--primary').click();
    expect(onClick).toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(() => t.dismiss()).not.toThrow();
    expect(document.querySelectorAll('.toast-container')).toHaveLength(1);
  });
});
