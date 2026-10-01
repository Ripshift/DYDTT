/**
 * DYDTT Phase 1 — TaskItem Component
 * Renders a single task row.
 * Click = select/highlight the task (toggle).
 * Checkbox = toggle done state.
 */

import { formatTime } from '../utils/dateHelpers.js';
import { store }      from '../store.js';

export default class TaskItem {
  #el       = null;
  #task     = null;
  #selected = false;
  #handlers = new Map();

  constructor(task, isSelected = false) {
    this.#task     = task;
    this.#selected = isSelected;
    this.#el       = this.#render();
  }

  get el() { return this.#el; }

  update(task, isSelected = false) {
    this.#task     = task;
    this.#selected = isSelected;
    const newEl = this.#render();
    this.#el.replaceWith(newEl);
    this.#el = newEl;
  }

  /** Fast path: just toggle the selected class without a full re-render. */
  setSelected(isSelected) {
    this.#selected = isSelected;
    this.#el.classList.toggle('task-item--selected', isSelected);
    this.#el.setAttribute('aria-pressed', String(isSelected));
  }

  #render() {
    const t    = this.#task;
    const item = document.createElement('div');

    item.className = [
      'task-item',
      t.done            ? 'task-item--done'          : '',
      t.priority === 1  ? 'task-item--high-priority'  : '',
      t.priority === 2  ? 'task-item--low-priority'   : '',
      this.#selected    ? 'task-item--selected'        : '',
    ].filter(Boolean).join(' ');

    item.setAttribute('data-task-id', t.id);
    item.setAttribute('role',         'button');
    item.setAttribute('tabindex',     '0');
    item.setAttribute('aria-pressed', String(this.#selected));
    item.setAttribute('aria-label',
      `${t.title}${t.seriesId ? ' — repeating' : ''}${this.#selected ? ' — selected' : ''}${t.done ? ' — done' : ''}`);

    // ── Checkbox ───────────────────────────────────────────────────────────
    const checkbox = document.createElement('button');
    checkbox.className = `task-checkbox${t.done ? ' checked' : ''}`;
    checkbox.setAttribute('role',         'checkbox');
    checkbox.setAttribute('aria-checked', String(t.done));
    checkbox.setAttribute('aria-label',   `Mark "${t.title}" as ${t.done ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      store.dispatch('TASK_TOGGLE', { id: t.id });
      this.#emit('toggle', t);
    });

    // ── Body ───────────────────────────────────────────────────────────────
    const body  = document.createElement('div');
    body.className = 'task-item__body';

    const title = document.createElement('div');
    title.className   = 'task-item__title';
    title.textContent = t.title;
    body.appendChild(title);

    const metaParts = [];
    if (t.seriesId)     metaParts.push('↻');
    if (t.reminderAt)   metaParts.push(formatTime(t.reminderAt));
    if (t.tags?.length) metaParts.push(t.tags[0]);
    if (metaParts.length) {
      const meta = document.createElement('div');
      meta.className   = 'task-item__meta';
      meta.textContent = metaParts.join(' · ').replace(/^↻ · /, '↻ ');
      body.appendChild(meta);
    }

    // ── Selection indicator dot ────────────────────────────────────────────
    const dot = document.createElement('div');
    dot.className = 'task-item__sel-dot';
    dot.setAttribute('aria-hidden', 'true');

    item.append(checkbox, body, dot);

    // ── Click = select / deselect ──────────────────────────────────────────
    item.addEventListener('click', () => {
      store.dispatch('TASK_SELECT', { id: t.id });
      this.#emit('select', t);
    });

    // Keyboard: Enter or Space also selects
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        store.dispatch('TASK_SELECT', { id: t.id });
        this.#emit('select', t);
      }
    });

    return item;
  }

  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }

  #emit(event, data) { this.#handlers.get(event)?.forEach(fn => fn(data)); }
}
