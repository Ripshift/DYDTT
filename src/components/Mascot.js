/**
 * DYDTT — Mascot: a pixel-art orange cat dozing on the top bar's line,
 * facing right, watching over the calendar (eyes closed).
 *
 * Drawn from character grids (1 cell = 1 pixel) into inline SVG, so it stays
 * crisp at any size and needs no image files.
 *  - Tail swishes slowly back and forth, then rests for a while.
 *  - Tap him: a heart (drawn at double his resolution) drifts up from his head.
 *  - Secret (like Android's "tap 7 times for developer options"): keep tapping.
 *      taps 1–8   hearts
 *      taps 9–13  fish
 *      tap 14     Android app: he opens his eyes, says "Purr", the secret page opens
 *                 Website:     eyes stay shut, he just purrs, and it starts over
 *    Pausing for more than TAP_RESET_MS starts the count again.
 */

import { isMotionReduced } from '../utils/motionPrefs.js';

/** Cat palette — one character per colour. '.' = transparent. */
export const PALETTE = {
  o: '#3B200C',   // outline
  O: '#E8862A',   // orange fur
  D: '#B85A16',   // dark stripes
  L: '#F4A64A',   // light fur (haunch)
  C: '#F8DDB0',   // cream muzzle / chest / paws
  c: '#D8AE78',   // chin shadow
  P: '#E98A93',   // pink nose / inner ears
  G: '#8BD16B',   // green eyes (only when he opens them)
  K: '#141414',   // pupils
};

/* 31 × 14. Tail space on the left, head on the right, front paws forward. */
export const BODY = [
  '......................o.....o..',
  '.....................oPo...oPo.',
  '....................oOPOoooOPOo',
  '....................oOOODODOOOo',
  '....................oOOOOOOOOOo',
  '.........ooooooooooooOooOOOooOo',   // closed eyes
  '.......ooOODOOODOOOOoCOOOPOOOCo',
  '......oOOODOOODOOOOOoCCCoCoCCCo',
  '.....oOOODDOOODDOOOOOoCCCCCCCo.',
  '.....oOOOODOOODOOOOOOOoccccco..',
  '.....oOOOOOOOOOOOOOOOOCCCCCoooo',
  '.....oOLLLOOOOOOOOOOOOCCCCCCCCo',
  '.....oLLLLLOOOOOOOOOOOCCCCCoCCo',
  '......ooooooooooooooooooooooooo',
];

/* Open eyes (looking right, at the calendar) — drawn over the closed ones. */
export const EYES_OPEN = [
  [4, 20, 'oOGKOOOGKOo'],
  [5, 20, 'oOGKOOOGKOo'],
];

/* Lidded, unimpressed eyes for when he's grumpy. */
export const EYES_GRUMPY = [
  [4, 20, 'oOooOOOooOo'],
  [5, 20, 'oOGKOOOGKOo'],
];

/* Tail: shared lower part + five upper poses, far left → far right. */
const TAIL_TOP_ROW = 3;
const TAIL_LOWER = ['...oDo.', '...oOo.', '...oOOO', '...oOOO', '....ooo'];
export const TAIL_POSES = {
  L2: ['.......', '.......', '.oo....', 'oDDo...', '.oOOo..', '..ooOo.'],
  L1: ['.......', '...oo..', '..oDDo.', '...oOo.', '...oDo.', '...oOo.'],
  C:  ['....o..', '...oDo.', '...oOo.', '...oDo.', '...oOo.', '...oOo.'],
  R1: ['.......', '....oo.', '...oDDo', '...oOo.', '...oDo.', '...oOo.'],
  R2: ['.......', '.......', '.....oo', '....oDD', '...oOo.', '...oOo.'],
};
export const REST_POSE = 'C';
/** One slow swish: right and back, left and back. */
export const SWISH = ['C', 'R1', 'R2', 'R1', 'C', 'L1', 'L2', 'L1'];
export const FRAME_MS = 660;               // slow, lazy swish
export const SWISHES = 2;                  // back-and-forths before resting
export const REST_MS = [3000, 7000];       // rest between swishes (random in range)
export const NAP_EVERY_MS = [45_000, 90_000]; // eyes-open cat: awake this long between naps
export const NAP_MS = [3_000, 15_000];          // …then closes his eyes for this long

/** Heart — drawn at double the cat's resolution (each pixel half the size). */
export const HEART_PALETTE = {
  r: '#7A1F2B',   // outline
  H: '#E5484D',   // red
  h: '#B8323A',   // shade
  W: '#FFC2C6',   // shine
};
export const HEART = [
  '.rrr...rrr.',
  'rHHHr.rHHHr',
  'rHWWHrHHHHr',
  'rHWHHHHHHhr',
  'rHHHHHHHHhr',
  '.rHHHHHHhr.',
  '..rHHHHhr..',
  '...rHHhr...',
  '....rhr....',
  '.....r.....',
];

/** Fish — same double resolution as the heart. */
export const FISH_PALETTE = {
  r: '#1E3550',   // outline
  B: '#6FA8DC',   // blue
  D: '#3F79B5',   // fin
  W: '#D6ECFA',   // belly
  w: '#FFFFFF',   // eye shine
  K: '#0E1620',   // eye
};
export const FISH = [
  '....rrrrr...r.',
  '..rrBBBBBr.rBr',
  '.rBwBBDBBBrBBr',
  'rBBKBBDBBBBBBr',
  'rWBBBBDBBBBBBr',
  '.rWWWWWWWBrBBr',
  '..rrWWWWWr.rBr',
  '....rrrrr...r.',
];

const FLOAT_LIFE_MS = 1600;

/* Secret tap sequence */
export const FISH_FROM = 9;                // 9th tap onwards: fish instead of hearts
export const SECRET_TAPS = 14;             // 14th tap: eyes open (app) / purr (web)
export const TAP_RESET_MS = 2000;          // pause longer than this → count restarts
export const EYES_TO_PURR_MS = 700;
export const PURR_TO_PAGE_MS = 1500;
export const BUBBLE_MS = 1600;             // speech bubble default (on screen, then fades)

export const WIDTH = BODY[0].length;
export const HEIGHT = BODY.length;
const HEAD_CENTRE_X = 25;                  // between the ears, in cat pixels

/** Grid rows → [{x, y, w, fill}] with horizontal runs merged. */
export function runs(rows, palette = PALETTE, { x0 = 0, y0 = 0 } = {}) {
  const out = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (!palette[ch]) { x++; continue; }
      let w = 1;
      while (row[x + w] === ch) w++;
      out.push({ x: x0 + x, y: y0 + y, w, fill: palette[ch] });
      x += w;
    }
  });
  return out;
}

/** Overlay [[row, col, cells]] → runs. */
export function overlayRuns(cells, palette = PALETTE) {
  return cells.flatMap(([r, c, s]) => runs([s], palette, { x0: c, y0: r }));
}

/** Full tail rows (top + lower) for a pose. */
export function tailRows(pose) {
  return [...TAIL_POSES[pose], ...TAIL_LOWER];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(w, h, scale) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w * scale);
  svg.setAttribute('height', h * scale);
  svg.setAttribute('shape-rendering', 'crispEdges');
  return svg;
}

function layer(rects, className) {
  const g = document.createElementNS(SVG_NS, 'g');
  if (className) g.setAttribute('class', className);
  for (const { x, y, w, fill } of rects) {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', 1);
    r.setAttribute('fill', fill);
    g.appendChild(r);
  }
  return g;
}

/** A standalone pixel-art <svg> from a grid. */
export function pixelSvg(grid, palette, scale, className = '') {
  const svg = svgEl(grid[0].length, grid.length, scale);
  svg.appendChild(layer(runs(grid, palette)));
  if (className) svg.setAttribute('class', className);
  return svg;
}

/**
 * Build the cat. Decorative (hidden from screen readers).
 * @param {object}   [opts]
 * @param {number}   [opts.scale=2]          CSS pixels per cat pixel
 * @param {boolean}  [opts.animate=true]     swish the tail
 * @param {boolean|'open'|'grumpy'} [opts.eyesOpen=false] resting eyes (closed by default)
 * @param {boolean}  [opts.secret=true]      count taps for the secret
 * @param {boolean}  [opts.canOpenEyes=false] the 14th tap opens his eyes (Android app)
 * @param {Function} [opts.onSecret]         called once he has purred with eyes open
 * @param {Function} [opts.onTap]            with secret off: what a tap does (default: a heart)
 * @param {string}   [opts.className]        extra class (e.g. 'mascot--big')
 * @param {object}   [opts.heartPalette]     colours for floating hearts (default red)
 * @param {object}   [opts.fishPalette]      colours for floating fish (default blue)
 * @param {'right'|'left'} [opts.facing='right'] which way he looks (art is mirrored for 'left')
 * @param {boolean}  [opts.naps=false]       eyes-open cat closes his eyes for a few seconds now and then
 * @param {number}   [opts.bubbleMs]         how long his speech bubble stays (default BUBBLE_MS)
 */
export function createMascot({
  scale = 2, animate = true, eyesOpen = false,
  secret = true, canOpenEyes = false, onSecret = null, onTap = null, className = '',
  heartPalette = HEART_PALETTE, fishPalette = FISH_PALETTE, facing = 'right', naps = false,
  bubbleMs = BUBBLE_MS,
} = {}) {
  const el = document.createElement('div');
  el.className = `mascot ${className}`.trim();
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--mascot-px', `${scale}px`);

  const svg = svgEl(WIDTH, HEIGHT, scale);
  svg.appendChild(layer(runs(BODY), 'mascot__body'));
  const eyeLayers = {
    open:   layer(overlayRuns(EYES_OPEN), 'mascot__eyes mascot__eyes--open'),
    grumpy: layer(overlayRuns(EYES_GRUMPY), 'mascot__eyes mascot__eyes--grumpy'),
  };
  svg.append(eyeLayers.open, eyeLayers.grumpy);
  const poses = {};
  for (const name of Object.keys(TAIL_POSES)) {
    poses[name] = layer(runs(tailRows(name), PALETTE, { y0: TAIL_TOP_ROW }), `mascot__tail mascot__tail--${name}`);
    svg.appendChild(poses[name]);
  }
  // Facing left: mirror the art; hearts / bubbles follow his head
  if (facing === 'left') svg.style.transform = 'scaleX(-1)';
  el.dataset.facing = facing;
  const headX = facing === 'left' ? WIDTH - HEAD_CENTRE_X : HEAD_CENTRE_X;
  el.appendChild(svg);

  /** true / 'open', 'grumpy', or false / 'closed' */
  const setEyes = (mode) => {
    const m = mode === true ? 'open' : (mode || 'closed');
    for (const [k, g] of Object.entries(eyeLayers)) g.style.display = k === m ? '' : 'none';
    el.dataset.eyes = m;
  };
  let restingEyes = eyesOpen;
  setEyes(restingEyes);

  const showPose = (name) => {
    for (const [n, g] of Object.entries(poses)) g.style.display = n === name ? '' : 'none';
    el.dataset.pose = name;
  };
  showPose(REST_POSE);

  // ── Tail: swish slowly, then rest ─────────────────────────────────────
  let tailTimer = null;
  const rest = () => {
    showPose(REST_POSE);
    const [min, max] = REST_MS;
    tailTimer = setTimeout(swish, min + Math.random() * (max - min));
  };
  const swish = () => {
    // Stay still while motion is reduced or the app is in the background
    if (isMotionReduced() || document.hidden) { rest(); return; }
    const frames = [...Array(SWISHES)].flatMap(() => SWISH).concat(REST_POSE);
    let i = 0;
    const step = () => {
      showPose(frames[i++]);
      if (i < frames.length) tailTimer = setTimeout(step, FRAME_MS);
      else rest();
    };
    step();
  };
  if (animate) rest();

  // ── Floating things + speech ──────────────────────────────────────────
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };

  const float = (grid, palette, kind) => {
    const half = scale / 2;                        // double resolution
    const w = grid[0].length;
    const item = svgEl(w, grid.length, half);
    item.appendChild(layer(runs(grid, palette)));
    item.classList.add('mascot__float', `mascot__${kind}`);
    const jitter = Math.round((Math.random() - 0.5) * 4) * half;
    item.style.left = `${headX * scale - (w * half) / 2 + jitter}px`;
    el.appendChild(item);
    later(() => item.remove(), FLOAT_LIFE_MS);
  };

  const say = (text) => {
    const bubble = document.createElement('div');
    bubble.className = 'mascot__bubble';
    bubble.textContent = text;
    bubble.style.left = `${headX * scale}px`;
    bubble.style.animationDuration = `${bubbleMs}ms`;
    el.appendChild(bubble);
    later(() => bubble.remove(), bubbleMs);
  };

  // ── Taps: hearts → fish → the secret ──────────────────────────────────
  let taps = 0;
  let lastTap = 0;
  let busy = false;                               // while he's purring / revealing

  const reveal = () => {
    busy = true;
    if (canOpenEyes) {
      setEyes(true);
      later(() => say('Purr'), EYES_TO_PURR_MS);
      later(() => {
        onSecret?.();
        setEyes(restingEyes);
        busy = false;
      }, EYES_TO_PURR_MS + PURR_TO_PAGE_MS);
    } else {
      say('Purr');                                // web: eyes stay shut, then start over
      later(() => { busy = false; }, bubbleMs);
    }
  };

  el.addEventListener('click', () => {
    if (busy) return;
    if (!secret) {
      wake();                                     // a tap wakes him from a nap
      (onTap ?? (() => float(HEART, heartPalette, 'heart')))();
      return;
    }
    const now = Date.now();
    if (now - lastTap > TAP_RESET_MS) taps = 0;
    lastTap = now;
    taps += 1;
    el.dataset.taps = String(taps);
    if (taps >= SECRET_TAPS) { taps = 0; reveal(); return; }
    if (taps >= FISH_FROM) float(FISH, fishPalette, 'fish');
    else float(HEART, heartPalette, 'heart');
  });

  // ── Naps (eyes-open cat): eyes shut for 3–15 s every 45–90 s ──────────
  let napTimer = null;
  let napping = false;
  const between = ([min, max]) => min + Math.random() * (max - min);
  const scheduleNap = () => {
    clearTimeout(napTimer);
    napTimer = setTimeout(startNap, between(NAP_EVERY_MS));
  };
  const startNap = () => {
    const open = restingEyes && restingEyes !== 'closed';
    if (!open || busy || isMotionReduced() || document.hidden) { scheduleNap(); return; }
    napping = true;
    el.dataset.napping = 'true';
    setEyes('closed');
    clearTimeout(napTimer);
    napTimer = setTimeout(wake, between(NAP_MS));
  };
  function wake() {
    if (!napping) return;
    napping = false;
    delete el.dataset.napping;
    if (!busy) setEyes(restingEyes);
    if (naps) scheduleNap();
  }
  if (naps) scheduleNap();

  el.stopMascot = () => {
    clearTimeout(tailTimer);
    tailTimer = null;
    clearTimeout(napTimer);
    napTimer = null;
    timers.forEach(clearTimeout);
    timers.clear();
  };
  el.showPose = showPose;
  el.setEyes = setEyes;
  /** Change his resting eyes (e.g. grumpy when neglected). */
  el.setRestingEyes = (mode) => { restingEyes = mode; if (!busy && !napping) setEyes(mode); };
  el.wake = wake;
  el.say = say;
  el.float = (kind) => (kind === 'fish' ? float(FISH, fishPalette, 'fish') : float(HEART, heartPalette, 'heart'));
  /** Quick excited tail swish (used when playing). */
  el.excite = () => {
    clearTimeout(tailTimer);
    const frames = ['R1', 'R2', 'R1', 'C', 'L1', 'L2', 'L1', 'C', 'R1', 'R2', 'R1', 'C', 'L1', 'L2', 'L1', 'C'];
    let i = 0;
    const step = () => {
      showPose(frames[i++]);
      if (i < frames.length) tailTimer = setTimeout(step, 110);
      else if (animate) rest();
    };
    step();
  };
  return el;
}
