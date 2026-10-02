/**
 * DYDTT — String-wand minigame: the maths (no DOM).
 *
 * A dotted shape is shown; you drag the lure along it in one go. The score is
 * how much of the shape you covered and how closely you stayed on it.
 * Shapes live in a 0–1 box; the screen scales them.
 */

export const ROUNDS = 3;
export const SAMPLES = 120;            // points along each shape
export const TOLERANCE = 0.075;        // how far off the line still counts (share of the box)
export const COVER_WEIGHT = 0.7;       // covering the whole shape matters most…
export const STAY_WEIGHT = 0.3;        // …staying on the line matters a bit

/** Wand reward: fun × (MIN … MAX) depending on the average score. */
export const REWARD_MIN = 0.3;         // a scribble still cheers him up a little
export const REWARD_MAX = 2;           // a perfect game: about twice a normal wand play

const TAU = Math.PI * 2;
const param = (n, f) => [...Array(n + 1)].map((_, i) => f(i / n));

/** name → { label, points: [[x, y], …] } (unsampled) */
export const SHAPES = {
  circle: {
    label: 'Circle',
    points: param(80, (u) => [0.5 + 0.36 * Math.cos(-Math.PI / 2 + u * TAU), 0.5 + 0.36 * Math.sin(-Math.PI / 2 + u * TAU)]),
  },
  zigzag: {
    label: 'Zigzag',
    points: [[0.1, 0.32], [0.3, 0.68], [0.5, 0.32], [0.7, 0.68], [0.9, 0.32]],
  },
  wave: {
    label: 'Wave',
    points: param(80, (u) => [0.08 + 0.84 * u, 0.5 + 0.2 * Math.sin(u * TAU * 2)]),
  },
  infinity: {
    label: 'Infinity',
    points: param(100, (u) => [0.5 + 0.4 * Math.sin(u * TAU), 0.5 + 0.28 * Math.sin(u * TAU) * Math.cos(u * TAU)]),
  },
  heart: {
    label: 'Heart',
    points: param(100, (u) => {
      const t = u * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [0.5 + x / 40, 0.47 - y / 40];
    }),
  },
  star: {
    label: 'Star',
    points: param(10, (u) => {
      const i = Math.round(u * 10) % 10;
      const r = i % 2 === 0 ? 0.4 : 0.17;
      const a = -Math.PI / 2 + (i / 10) * TAU;
      return [0.5 + r * Math.cos(a), 0.53 + r * Math.sin(a)];
    }),
  },
};
export const SHAPE_NAMES = Object.keys(SHAPES);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Even spacing along a polyline. */
export function resample(points, n = SAMPLES) {
  if (points.length < 2) return points.slice();
  const seg = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const d = dist(points[i - 1], points[i]); seg.push(d); total += d; }
  if (total === 0) return [points[0]];
  const out = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const f = seg[i] ? Math.min(1, (target - acc) / seg[i]) : 0;
    const a = points[i];
    const b = points[i + 1];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** A shape's sampled points. */
export function shapePoints(name) {
  return resample(SHAPES[name].points);
}

/** Pick `count` different shapes. */
export function pickShapes(count = ROUNDS, rand = Math.random) {
  const pool = [...SHAPE_NAMES];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

const nearest = (p, pts) => pts.reduce((m, q) => Math.min(m, dist(p, q)), Infinity);

/**
 * Score one trace (both in the 0–1 box).
 * @returns {{ score: number, cover: number, stay: number }} all 0–1
 */
export function scoreTrace(shape, trace, tol = TOLERANCE) {
  if (!trace || trace.length < 2) return { score: 0, cover: 0, stay: 0 };
  const path = resample(trace, Math.min(SAMPLES * 2, Math.max(SAMPLES, trace.length)));
  const cover = shape.filter(p => nearest(p, path) <= tol).length / shape.length;
  const stay = path.filter(p => nearest(p, shape) <= tol).length / path.length;
  const score = Math.max(0, Math.min(1, cover * COVER_WEIGHT + stay * STAY_WEIGHT));
  return { score, cover, stay };
}

/** 0–3 stars for a round. */
export function stars(score) {
  if (score >= 0.85) return 3;
  if (score >= 0.6) return 2;
  if (score >= 0.3) return 1;
  return 0;
}

export function cheer(score) {
  return ['Missed it!', 'Close!', 'Nice!', 'Purrfect!'][stars(score)];
}

/** Average score → multiplier for the wand's fun. */
export function rewardFactor(avg) {
  const a = Math.max(0, Math.min(1, avg || 0));
  return REWARD_MIN + (REWARD_MAX - REWARD_MIN) * a;
}
