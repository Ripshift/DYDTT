/**
 * DYDTT — String-wand minigame ("Play" in the cat's room).
 *
 * Three rounds. Each shows a dotted shape; drag the lure along it in one swipe
 * while a little cat chases it. Each round gets 0–3 stars; the average score
 * decides how much fun he gets (see trace.js).
 *
 *   const game = createWandGame({ onFinish, onClose });
 *   page.appendChild(game.el);
 *   onFinish(avgScore) → Promise<{ fun?: number, say?: string }>
 */

import { createMascot, pixelSvg } from './Mascot.js';
import { ROOM, LURE } from '../pet/sprites.js';
import {
  ROUNDS, SHAPES, shapePoints, pickShapes, scoreTrace, stars as starsFor, cheer,
} from '../pet/trace.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NEXT_ROUND_MS = 1400;
const MIN_STEP = 0.004;                  // ignore jitter smaller than this (share of the board)
const CAT_SCALE = 3;
const LURE_SCALE = 3;
const CAT_EDGE = 0.2;                     // keep the chasing cat (and his bubble) inside the floor

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const toPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(2)} ${(y * 100).toFixed(2)}`).join(' ');

export function createWandGame({ onFinish, onClose, rand = Math.random } = {}) {
  const root = el('div', 'wand-game');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'String wand game');

  // ── Top: round · title · close ────────────────────────────────────────
  const top = el('div', 'wand-game__top');
  const round = el('span', 'wand-game__round');
  const title = el('h3', 'wand-game__title');
  const close = el('button', 'wand-game__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Stop playing');
  close.addEventListener('click', () => api.close());
  top.append(round, title, close);

  // ── Board ─────────────────────────────────────────────────────────────
  const stage = el('div', 'wand-game__stage');
  const board = svg('svg', { viewBox: '0 0 100 100', class: 'wand-game__board', preserveAspectRatio: 'none' });
  const guide = svg('path', { class: 'wand-game__guide' });
  const start = svg('circle', { class: 'wand-game__start', r: '3.2' });
  const trail = svg('path', { class: 'wand-game__trail' });
  const string = svg('line', { class: 'wand-game__string', y1: '-2' });
  board.append(guide, start, trail, string);
  const lure = el('div', 'wand-game__lure');
  lure.appendChild(pixelSvg(LURE, ROOM, LURE_SCALE));
  const cat = createMascot({ scale: CAT_SCALE, eyesOpen: 'open', secret: false, className: 'wand-game__cat' });
  const boardWrap = el('div', 'wand-game__board-wrap');   // square: shape + lure
  boardWrap.append(board, lure);
  const floor = el('div', 'wand-game__floor');            // the cat chases along here
  floor.appendChild(cat);
  stage.append(boardWrap, floor);

  const msg = el('p', 'wand-game__msg');
  msg.setAttribute('aria-live', 'polite');
  const tally = el('div', 'wand-game__stars');
  const finish = el('div', 'wand-game__finish');
  finish.hidden = true;
  root.append(top, stage, msg, tally, finish);

  // ── State ─────────────────────────────────────────────────────────────
  const shapes = pickShapes(ROUNDS, rand);
  const scores = [];
  let current = null;              // { name, pts }
  let trace = null;                // [[x, y], …] while dragging
  let locked = false;              // between rounds / finished
  let timer = null;

  const moveLure = ([x, y]) => {
    lure.style.left = `${x * 100}%`;
    lure.style.top = `${y * 100}%`;
    string.setAttribute('x1', String(x * 100));
    string.setAttribute('x2', String(x * 100));
    string.setAttribute('y2', String(y * 100));
    // The cat follows along the bottom and turns to face the lure
    cat.style.left = `${Math.max(CAT_EDGE, Math.min(1 - CAT_EDGE, x)) * 100}%`;   // stays fully on screen
    const catSvg = cat.querySelector('svg');
    if (catSvg) catSvg.style.transform = x < (Number(cat.dataset.x) || 0.5) ? 'scaleX(-1)' : '';
    cat.dataset.x = String(x);
  };

  const renderTally = () => {
    tally.replaceChildren(...shapes.map((_, i) => {
      const s = el('span', 'wand-game__tally');
      const n = scores[i] == null ? null : starsFor(scores[i]);
      s.textContent = n == null ? '·' : '★'.repeat(n) + '☆'.repeat(3 - n);
      s.dataset.done = String(n != null);
      return s;
    }));
  };

  function startRound(i) {
    const name = shapes[i];
    current = { name, pts: shapePoints(name) };
    round.textContent = `Round ${i + 1} of ${shapes.length}`;
    title.textContent = `Trace the ${SHAPES[name].label.toLowerCase()}`;
    guide.setAttribute('d', toPath(current.pts));
    const [sx, sy] = current.pts[0];
    start.setAttribute('cx', String(sx * 100));
    start.setAttribute('cy', String(sy * 100));
    trail.setAttribute('d', '');
    moveLure(current.pts[0]);
    msg.textContent = i === 0 ? 'Drag the lure along the dotted line — in one go!' : 'Next one!';
    root.dataset.round = String(i + 1);
    locked = false;
    renderTally();
  }

  /** Finish the drag: score it, cheer, move on. (Also the test hook.) */
  function endTrace(points) {
    if (locked || !current) return null;
    locked = true;
    const { score } = scoreTrace(current.pts, points);
    scores.push(score);
    const words = cheer(score);
    msg.textContent = `${words} ${'★'.repeat(starsFor(score))}${'☆'.repeat(3 - starsFor(score))}`;
    cat.say(words);
    if (starsFor(score) > 0) cat.excite();
    renderTally();
    timer = setTimeout(() => {
      if (scores.length < shapes.length) startRound(scores.length);
      else finishGame();
    }, NEXT_ROUND_MS);
    return score;
  }

  async function finishGame() {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const total = scores.reduce((a, s) => a + starsFor(s), 0);
    root.dataset.done = 'true';
    round.textContent = '';
    title.textContent = 'All done!';
    stage.hidden = true;
    msg.textContent = '';
    finish.replaceChildren(
      el('p', 'wand-game__big', `${total} of ${shapes.length * 3} ★`),
      el('p', 'wand-game__sub', '…'),
    );
    finish.hidden = false;
    const res = (await onFinish?.(avg)) ?? {};
    const sub = finish.querySelector('.wand-game__sub');
    sub.textContent = res.fun != null ? `He had fun! +${Math.round(res.fun)} fun` : (res.say || 'Thanks for playing!');
    const done = el('button', 'wand-game__done', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => api.close());
    finish.appendChild(done);
    done.focus();
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  const pointFrom = (e) => {
    const r = board.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  stage.addEventListener('pointerdown', (e) => {
    if (locked) return;
    const p = pointFrom(e);
    if (!p) return;
    e.preventDefault();
    stage.setPointerCapture?.(e.pointerId);
    trace = [p];
    moveLure(p);
    root.dataset.tracing = 'true';
  });
  stage.addEventListener('pointermove', (e) => {
    if (!trace) return;
    const p = pointFrom(e);
    if (!p) return;
    const last = trace[trace.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) return;
    trace.push(p);
    trail.setAttribute('d', toPath(trace));
    moveLure(p);
  });
  const up = () => {
    if (!trace) return;
    const pts = trace;
    trace = null;
    delete root.dataset.tracing;
    endTrace(pts);
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  // ── API ───────────────────────────────────────────────────────────────
  const api = {
    el: root,
    shapes,
    scores,
    /** Play a whole round from 0–1 points (tests, demos). */
    trace(points) {
      trail.setAttribute('d', toPath(points));
      if (points.length) moveLure(points[points.length - 1]);
      return endTrace(points);
    },
    /** Skip the pause between rounds (tests). */
    next() {
      clearTimeout(timer);
      if (scores.length < shapes.length) { startRound(scores.length); return null; }
      return finishGame();
    },
    current: () => current,
    close() {
      clearTimeout(timer);
      cat.stopMascot();
      root.remove();
      onClose?.();
    },
  };

  startRound(0);
  queueMicrotask(() => close.focus?.());
  return api;
}
