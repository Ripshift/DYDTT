/**
 * DYDTT Phase 1 — BurgerMenu Component
 * Single hamburger button. Animates to X when open.
 * Emits: open | close
 */

export default class BurgerMenu {
  #btn      = null;
  #expanded = false;
  #handlers = new Map();

  constructor({ container }) {
    this.#render(container);
  }

  #render(container) {
    this.#btn = document.createElement('button');
    this.#btn.className = 'burger-btn';
    this.#btn.setAttribute('aria-label',    'Open menu');
    this.#btn.setAttribute('aria-expanded', 'false');
    this.#btn.setAttribute('aria-controls', 'main-modal');
    this.#btn.setAttribute('aria-haspopup', 'dialog');

    for (let i = 0; i < 3; i++) {
      const bar = document.createElement('span');
      bar.className = 'burger-btn__bar';
      bar.setAttribute('aria-hidden', 'true');
      this.#btn.appendChild(bar);
    }

    this.#btn.addEventListener('click', () => this.toggle());
    container.appendChild(this.#btn);
  }

  toggle() {
    this.#expanded ? this.close() : this.open();
  }

  open() {
    if (this.#expanded) return;
    this.#applyState(true);
    this.#emit('open');
  }

  close() {
    if (!this.#expanded) return;
    this.#applyState(false);
    this.#emit('close');
  }

  /**
   * Sync the button's visual/ARIA state WITHOUT emitting events.
   * Use this when the modal was opened/closed from elsewhere, so the
   * burger follows along without triggering another open/close.
   */
  setExpanded(val) { this.#applyState(Boolean(val)); }

  #applyState(expanded) {
    this.#expanded = expanded;
    this.#btn.setAttribute('aria-expanded', String(expanded));
    this.#btn.setAttribute('aria-label',    expanded ? 'Close menu' : 'Open menu');
    this.#btn.classList.toggle('is-open', expanded);
  }

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }

  #emit(event) {
    this.#handlers.get(event)?.forEach(fn => fn());
  }
}
