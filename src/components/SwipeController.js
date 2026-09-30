/**
 * DYDTT Phase 1 — SwipeController
 * Handles horizontal touch/pointer swipe for day navigation.
 * Keyboard arrow keys are the accessibility fallback.
 * Emits: swipe-left | swipe-right
 */

export default class SwipeController {
  #el        = null;
  #handlers  = new Map();
  #threshold = 50;
  #maxAngle  = 35;
  #startX    = 0;
  #startY    = 0;
  #active    = false;

  constructor(el, { threshold = 50 } = {}) {
    this.#el        = el;
    this.#threshold = threshold;
    this.#attach();
  }

  #attach() {
    const el = this.#el;
    el.addEventListener('pointerdown',   this.#onDown,   { passive: true });
    el.addEventListener('pointermove',   this.#onMove,   { passive: true });
    el.addEventListener('pointerup',     this.#onUp,     { passive: true });
    el.addEventListener('pointercancel', this.#onCancel, { passive: true });
    el.addEventListener('keydown',       this.#onKey);
  }

  #onDown = (e) => {
    this.#startX = e.clientX;
    this.#startY = e.clientY;
    this.#active = true;
  };

  #onMove = () => {};

  #onUp = (e) => {
    if (!this.#active) return;
    this.#active = false;
    const dx = e.clientX - this.#startX;
    const dy = e.clientY - this.#startY;
    if (Math.abs(dx) < this.#threshold) return;
    const angle        = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    const isHorizontal = angle < this.#maxAngle || angle > (180 - this.#maxAngle);
    if (!isHorizontal) return;
    if (dx < 0) this.#emit('swipe-left');
    else        this.#emit('swipe-right');
  };

  #onCancel = () => { this.#active = false; };

  #onKey = (e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); this.#emit('swipe-right'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.#emit('swipe-left');  }
  };

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }

  #emit(event) { this.#handlers.get(event)?.forEach(fn => fn()); }

  destroy() {
    const el = this.#el;
    el.removeEventListener('pointerdown',   this.#onDown);
    el.removeEventListener('pointermove',   this.#onMove);
    el.removeEventListener('pointerup',     this.#onUp);
    el.removeEventListener('pointercancel', this.#onCancel);
    el.removeEventListener('keydown',       this.#onKey);
  }
}
