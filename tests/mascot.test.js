import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BODY, TAIL_POSES, SWISH, SWISHES, FRAME_MS, REST_MS, REST_POSE,
  HEART, HEART_PALETTE, FISH, FISH_PALETTE, PALETTE, WIDTH, HEIGHT, EYES_OPEN,
  FISH_FROM, SECRET_TAPS, TAP_RESET_MS, EYES_TO_PURR_MS, PURR_TO_PAGE_MS, NAP_EVERY_MS, NAP_MS, BUBBLE_MS,
  runs, tailRows, createMascot,
} from '../src/components/Mascot.js';

describe('Mascot art', () => {
  it('body grid is WIDTH × HEIGHT and uses only palette colours', () => {
    expect(BODY).toHaveLength(HEIGHT);
    for (const row of BODY) {
      expect(row).toHaveLength(WIDTH);
      for (const ch of row) expect(ch === '.' || ch in PALETTE).toBe(true);
    }
  });

  it('eyes are closed (no eye colours in the art)', () => {
    expect(BODY.join('')).not.toMatch(/[GK]/);
  });

  it('every tail pose has the same height and stays inside the grid', () => {
    const heights = new Set(Object.keys(TAIL_POSES).map(p => tailRows(p).length));
    expect(heights.size).toBe(1);
    for (const p of Object.keys(TAIL_POSES)) {
      for (const row of tailRows(p)) {
        for (const ch of row) expect(ch === '.' || ch in PALETTE).toBe(true);
      }
    }
    expect(3 + [...heights][0]).toBeLessThanOrEqual(HEIGHT);
    for (const p of SWISH) expect(TAIL_POSES[p]).toBeDefined();
  });

  it('heart and fish use their own palettes; open eyes sit on the head', () => {
    for (const row of HEART) for (const ch of row) expect(ch === '.' || ch in HEART_PALETTE).toBe(true);
    for (const row of FISH) {
      expect(row).toHaveLength(FISH[0].length);
      for (const ch of row) expect(ch === '.' || ch in FISH_PALETTE).toBe(true);
    }
    for (const [r, c, cells] of EYES_OPEN) {
      expect(c + cells.length).toBeLessThanOrEqual(WIDTH);
      expect(BODY[r].slice(c, c + cells.length)).toMatch(/^o.*o$/);   // same head outline
    }
  });

  it('the tail swish is slow (a third of the old speed)', () => {
    expect(FRAME_MS).toBe(660);
  });

  it('runs() merges same-colour pixels and skips transparent ones', () => {
    expect(runs(['.oo.OO'])).toEqual([
      { x: 1, y: 0, w: 2, fill: PALETTE.o },
      { x: 4, y: 0, w: 2, fill: PALETTE.O },
    ]);
    expect(runs(['zz'])).toEqual([]);
    expect(runs(['oo'], PALETTE, { x0: 2, y0: 3 })).toEqual([{ x: 2, y: 3, w: 2, fill: PALETTE.o }]);
  });
});

describe('createMascot', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('builds a decorative SVG at the given size, resting pose showing', () => {
    const el = createMascot({ scale: 2, animate: false });
    expect(el.getAttribute('aria-hidden')).toBe('true');
    const svg = el.querySelector('svg');
    expect(svg.getAttribute('width')).toBe(String(WIDTH * 2));
    expect(el.dataset.pose).toBe(REST_POSE);
    const visible = [...el.querySelectorAll('.mascot__tail')].filter(g => g.style.display !== 'none');
    expect(visible).toHaveLength(1);
    expect(visible[0].classList.contains(`mascot__tail--${REST_POSE}`)).toBe(true);
  });

  it('swishes the tail slowly through every pose, then rests', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);          // shortest rest
    const el = createMascot();
    const seen = [];
    expect(el.dataset.pose).toBe(REST_POSE);
    vi.advanceTimersByTime(REST_MS[0]);                     // rest over → swish starts
    for (let i = 0; i < SWISH.length * SWISHES; i++) {
      seen.push(el.dataset.pose);
      vi.advanceTimersByTime(FRAME_MS);
    }
    expect(seen).toEqual([...Array(SWISHES)].flatMap(() => SWISH));
    expect(el.dataset.pose).toBe(REST_POSE);                // back to resting
    vi.advanceTimersByTime(REST_MS[0] - 1);
    expect(el.dataset.pose).toBe(REST_POSE);                // sits still a while
    el.stopMascot();
  });

  it('stays still when motion is reduced', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    document.documentElement.classList.add('reduce-motion');
    const el = createMascot();
    for (let t = 0; t < 20000; t += FRAME_MS) {
      vi.advanceTimersByTime(FRAME_MS);
      expect(el.dataset.pose).toBe(REST_POSE);
    }
    el.stopMascot();
  });

  it('tapping him sends up a double-resolution heart that disappears', () => {
    vi.useFakeTimers();
    const el = createMascot({ scale: 2, animate: false });
    el.click();
    el.click();
    const hearts = el.querySelectorAll('.mascot__heart');
    expect(hearts).toHaveLength(2);                         // each tap: its own heart
    // Heart pixels are half the size of the cat's
    expect(hearts[0].getAttribute('width')).toBe(String(HEART[0].length * 1));
    vi.advanceTimersByTime(1700);
    expect(el.querySelectorAll('.mascot__heart')).toHaveLength(0);
  });

  const tap = (el, n, gap = 300) => {
    for (let i = 0; i < n; i++) { el.click(); vi.advanceTimersByTime(gap); }
  };
  const count = (el, kind) => el.querySelectorAll(`.mascot__${kind}`).length;

  it('taps 1–8 send hearts, 9–13 send fish', () => {
    vi.useFakeTimers();
    const el = createMascot({ animate: false });
    tap(el, FISH_FROM - 1, 100);
    expect(count(el, 'heart')).toBe(FISH_FROM - 1);
    expect(count(el, 'fish')).toBe(0);
    tap(el, SECRET_TAPS - FISH_FROM, 100);
    expect(count(el, 'fish')).toBe(SECRET_TAPS - FISH_FROM);
    expect(el.dataset.taps).toBe(String(SECRET_TAPS - 1));
    el.stopMascot();
  });

  it('a pause starts the count again', () => {
    vi.useFakeTimers();
    const el = createMascot({ animate: false });
    tap(el, 10);
    vi.advanceTimersByTime(TAP_RESET_MS + 1);
    el.click();
    expect(el.dataset.taps).toBe('1');
    el.stopMascot();
  });

  it('Android: 14th tap opens his eyes, he purrs, then the secret page opens', () => {
    vi.useFakeTimers();
    const onSecret = vi.fn();
    const el = createMascot({ animate: false, canOpenEyes: true, onSecret });
    expect(el.dataset.eyes).toBe('closed');
    tap(el, SECRET_TAPS - 1);
    el.click();                                             // 14th
    expect(el.dataset.eyes).toBe('open');
    expect(el.querySelector('.mascot__bubble')).toBeNull();
    vi.advanceTimersByTime(EYES_TO_PURR_MS);
    expect(el.querySelector('.mascot__bubble').textContent).toBe('Purr');
    el.click();                                             // ignored while he's busy
    expect(el.querySelectorAll('.mascot__heart, .mascot__fish').length).toBeLessThanOrEqual(SECRET_TAPS);
    expect(onSecret).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PURR_TO_PAGE_MS);
    expect(onSecret).toHaveBeenCalledTimes(1);
    expect(el.dataset.eyes).toBe('closed');                 // dozing again behind the page
    el.click();                                             // count starts over
    expect(el.dataset.taps).toBe('1');
    el.stopMascot();
  });

  it('website: 14th tap — eyes stay shut, he just purrs, and it starts over', () => {
    vi.useFakeTimers();
    const onSecret = vi.fn();
    const el = createMascot({ animate: false, canOpenEyes: false, onSecret });
    tap(el, SECRET_TAPS);
    expect(el.dataset.eyes).toBe('closed');
    expect(el.querySelector('.mascot__bubble').textContent).toBe('Purr');
    vi.advanceTimersByTime(5000);
    expect(onSecret).not.toHaveBeenCalled();
    expect(el.dataset.eyes).toBe('closed');
    el.click();
    expect(el.dataset.taps).toBe('1');
    expect(count(el, 'heart')).toBe(1);
    el.stopMascot();
  });

  it('can face left: art mirrored, hearts still come from his head', () => {
    const right = createMascot({ animate: false, secret: false });
    const left = createMascot({ animate: false, secret: false, facing: 'left' });
    expect(left.dataset.facing).toBe('left');
    expect(left.querySelector('svg').style.transform).toBe('scaleX(-1)');
    expect(right.querySelector('svg').style.transform).toBe('');
    right.click(); left.click();
    const x = (el) => parseFloat(el.querySelector('.mascot__heart').style.left);
    expect(x(left)).toBeLessThan(x(right));
    right.stopMascot(); left.stopMascot();
  });

  it('eyes-open cat naps: eyes shut 3–15 s every 45–90 s; a tap wakes him', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);                 // shortest waits
    const el = createMascot({ animate: false, secret: false, eyesOpen: 'open', naps: true });
    expect(NAP_EVERY_MS).toEqual([45_000, 90_000]);
    expect(NAP_MS).toEqual([3_000, 15_000]);
    vi.advanceTimersByTime(NAP_EVERY_MS[0] - 1);
    expect(el.dataset.eyes).toBe('open');
    vi.advanceTimersByTime(1);
    expect(el.dataset.eyes).toBe('closed');
    expect(el.dataset.napping).toBe('true');
    el.setRestingEyes('grumpy');                                 // mood changes mid-nap: stays asleep
    expect(el.dataset.eyes).toBe('closed');
    vi.advanceTimersByTime(NAP_MS[0]);
    expect(el.dataset.eyes).toBe('grumpy');                      // wakes after 3 s
    vi.advanceTimersByTime(NAP_EVERY_MS[0]);
    expect(el.dataset.eyes).toBe('closed');
    el.click();                                                  // tap wakes him
    expect(el.dataset.eyes).toBe('grumpy');
    expect(el.dataset.napping).toBeUndefined();
    document.documentElement.classList.add('reduce-motion');
    vi.advanceTimersByTime(NAP_EVERY_MS[1] * 2);
    expect(el.dataset.eyes).toBe('grumpy');                      // no naps with reduced motion
    el.stopMascot();
  });

  it('speech bubble length can be set (default stays short)', () => {
    vi.useFakeTimers();
    const el = createMascot({ animate: false, secret: false, bubbleMs: BUBBLE_MS * 2 });
    el.say('Purr');
    expect(el.querySelector('.mascot__bubble').style.animationDuration).toBe(`${BUBBLE_MS * 2}ms`);
    vi.advanceTimersByTime(BUBBLE_MS + 10);
    expect(el.querySelector('.mascot__bubble')).not.toBeNull();
    vi.advanceTimersByTime(BUBBLE_MS);
    expect(el.querySelector('.mascot__bubble')).toBeNull();
    el.stopMascot();
  });

  it('with the secret off, every tap is a heart', () => {
    vi.useFakeTimers();
    const el = createMascot({ animate: false, secret: false, eyesOpen: true });
    expect(el.dataset.eyes).toBe('open');
    tap(el, 20, 10);
    expect(count(el, 'heart')).toBe(20);
    expect(count(el, 'fish')).toBe(0);
    el.stopMascot();
  });
});
