/**
 * DYDTT Phase 1 — DayView Component
 */

import { store }                          from '../store.js';
import { parseDisplayDate, relativeLabel } from '../utils/dateHelpers.js';
import SwipeController                     from './SwipeController.js';
import TaskItem                            from './TaskItem.js';
import { announce }                        from '../utils/a11y.js';

export default class DayView {
  #container = null;
  #track     = null;
  #panels    = [];
  #swiper    = null;
  #itemMap   = new Map();   // taskId -> TaskItem instance
  #unsubs    = [];

  constructor({ container }) {
    this.#container = container;
    this.#render();
    this.#subscribe();
  }

  #render() {
    const wrapper = document.createElement('div');
    wrapper.className = 'swipe-container';
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('aria-label', 'Day view — swipe left or right to navigate days');

    this.#track = document.createElement('div');
    this.#track.className = 'swipe-track';

    this.#panels = ['prev', 'current', 'next'].map(() => {
      const panel = document.createElement('div');
      panel.className = 'swipe-panel';
      this.#track.appendChild(panel);
      return panel;
    });

    wrapper.appendChild(this.#track);
    this.#container.appendChild(wrapper);

    const hints = document.createElement('div');
    hints.className = 'swipe-hint';
    hints.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = `swipe-hint__dot${i === 1 ? ' active' : ''}`;
      hints.appendChild(dot);
    }
    this.#container.appendChild(hints);

    this.#swiper = new SwipeController(wrapper);
    this.#swiper.on('swipe-left',  () => store.dispatch('NAV_NEXT_DAY'));
    this.#swiper.on('swipe-right', () => store.dispatch('NAV_PREV_DAY'));
  }

  #subscribe() {
    this.#unsubs.push(
      store.subscribe('tasks',       (tasks) => this.#renderTasks(tasks)),
      store.subscribe('currentDate', (date)  => this.#renderHeader(date)),
      // When selection changes, update item highlight without full re-render
      store.subscribe('ui', (ui) => this.#syncSelection(ui.selectedTaskId)),
    );
  }

  #renderHeader(date) {
    const panel  = this.#panels[1];
    const parsed = parseDisplayDate(date);
    const label  = relativeLabel(date);

    let header = panel.querySelector('.day-header');
    if (!header) {
      header = document.createElement('header');
      header.className = 'day-header';
      panel.prepend(header);
    }

    header.innerHTML = `
      <div class="day-header__weekday">
        ${parsed.isToday ? 'Today · ' : ''}${parsed.weekday}
      </div>
      <h1 class="day-header__date">
        ${parsed.day}
        <span class="day-header__month">${parsed.monthAbbr} ${parsed.year}</span>
      </h1>`;

    document.title = `${label} — DYDTT`;
    announce(`${label}, ${parsed.weekday} ${parsed.day} ${parsed.month}`);
  }

  #renderTasks(tasks) {
    const panel = this.#panels[1];
    const selectedId = store.state.ui.selectedTaskId;

    let taskList = panel.querySelector('.task-list');
    if (!taskList) {
      taskList = document.createElement('div');
      taskList.className = 'task-list';
      taskList.setAttribute('role', 'list');
      taskList.setAttribute('aria-label', 'Tasks for the day');
      panel.appendChild(taskList);
    }

    const currentIds = new Set(tasks.map(t => t.id));

    // Remove stale items
    for (const [id, item] of this.#itemMap) {
      if (!currentIds.has(id)) {
        item.el.remove();
        this.#itemMap.delete(id);
      }
    }

    // Add or update items
    tasks.forEach((task, idx) => {
      const isSelected = task.id === selectedId;
      if (this.#itemMap.has(task.id)) {
        this.#itemMap.get(task.id).update(task, isSelected);
      } else {
        const item = new TaskItem(task, isSelected);
        item.el.style.animationDelay = `${Math.min(idx * 40, 200)}ms`;
        item.el.setAttribute('role', 'listitem');
        this.#itemMap.set(task.id, item);
        taskList.appendChild(item.el);
      }
    });

    // Empty state
    let empty = panel.querySelector('.task-list--empty');
    if (tasks.length === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'task-list--empty';
        empty.setAttribute('aria-live', 'polite');
        const msg = document.createElement('p');
        msg.className = 'task-list__empty-msg';
        msg.textContent = 'Nothing planned · enjoy the day';
        empty.appendChild(msg);
        panel.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  /** Fast path: toggle selected class on items without full re-render. */
  #syncSelection(selectedId) {
    for (const [id, item] of this.#itemMap) {
      item.setSelected(id === selectedId);
    }
  }

  destroy() {
    this.#unsubs.forEach(u => u());
    this.#swiper.destroy();
  }
}
