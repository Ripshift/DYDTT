/**
 * DYDTT Phase 1 — FortyEightHourView Component
 * Shows today and tomorrow stacked. Swipe left/right shifts both days.
 */

import { store }                                        from '../store.js';
import { parseDisplayDate, addDays }                    from '../utils/dateHelpers.js';
import { getTasksForDate }                              from '../db/schema.js';
import TaskItem                                          from './TaskItem.js';
import SwipeController                                   from './SwipeController.js';

export default class FortyEightHourView {
  #container = null;
  #panels    = [];
  #itemMaps  = [new Map(), new Map()];
  #dates     = [];
  #swiper    = null;
  #unsubs    = [];

  constructor({ container }) {
    this.#container = container;
    this.#render();
    this.#subscribe();
  }

  #render() {
    const root = document.createElement('div');
    root.className = 'fhv';
    root.setAttribute('aria-label', '48-hour view — swipe to shift days');
    root.setAttribute('tabindex', '0');

    this.#panels = [0, 1].map(() => {
      const panel = document.createElement('div');
      panel.className = 'fhv__panel';
      root.appendChild(panel);
      return panel;
    });

    this.#container.appendChild(root);

    this.#swiper = new SwipeController(root);
    this.#swiper.on('swipe-left',  () => store.dispatch('NAV_NEXT_DAY'));
    this.#swiper.on('swipe-right', () => store.dispatch('NAV_PREV_DAY'));
  }

  #subscribe() {
    this.#unsubs.push(
      store.subscribe('currentDate', () => this.#refresh()),
      store.subscribe('tasks',       () => this.#refresh()),
      store.subscribe('ui',          (ui) => this.#syncSelection(ui.selectedTaskId)),
    );
  }

  async #refresh() {
    const d0 = store.state.currentDate;
    const d1 = addDays(d0, 1);
    this.#dates = [d0, d1];

    const [tasks0, tasks1] = await Promise.all([
      getTasksForDate(d0),
      getTasksForDate(d1),
    ]);

    const taskSets = [
      tasks0.filter(t => t.syncStatus !== 'pending-delete'),
      tasks1.filter(t => t.syncStatus !== 'pending-delete'),
    ];

    const selectedId = store.state.ui.selectedTaskId;
    [0, 1].forEach(i => this.#renderPanel(i, this.#dates[i], taskSets[i], selectedId));
  }

  #renderPanel(idx, dateStr, tasks, selectedId) {
    const panel   = this.#panels[idx];
    const parsed  = parseDisplayDate(dateStr);
    const itemMap = this.#itemMaps[idx];

    let header = panel.querySelector('.day-header');
    if (!header) {
      header = document.createElement('header');
      header.className = 'day-header fhv__header';
      panel.prepend(header);
    }
    header.innerHTML = `
      <div class="day-header__weekday">
        ${parsed.isToday ? 'Today · ' : parsed.isTomorrow ? 'Tomorrow · ' : ''}${parsed.weekday}
      </div>
      <h2 class="day-header__date day-header__date--sm">
        ${parsed.day}
        <span class="day-header__month">${parsed.monthAbbr}</span>
      </h2>`;

    let taskList = panel.querySelector('.task-list');
    if (!taskList) {
      taskList = document.createElement('div');
      taskList.className = 'task-list';
      taskList.setAttribute('role', 'list');
      panel.appendChild(taskList);
    }

    const currentIds = new Set(tasks.map(t => t.id));
    for (const [id, item] of itemMap) {
      if (!currentIds.has(id)) { item.el.remove(); itemMap.delete(id); }
    }

    tasks.forEach((task) => {
      const isSelected = task.id === selectedId;
      if (itemMap.has(task.id)) {
        itemMap.get(task.id).update(task, isSelected);
      } else {
        const item = new TaskItem(task, isSelected);
        item.el.setAttribute('role', 'listitem');
        itemMap.set(task.id, item);
        taskList.appendChild(item.el);
      }
    });

    let empty = panel.querySelector('.task-list--empty');
    if (tasks.length === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'task-list--empty';
        const msg = document.createElement('p');
        msg.className = 'task-list__empty-msg';
        msg.textContent = 'Nothing planned';
        empty.appendChild(msg);
        panel.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  #syncSelection(selectedId) {
    for (const itemMap of this.#itemMaps) {
      for (const [id, item] of itemMap) item.setSelected(id === selectedId);
    }
  }

  destroy() {
    this.#unsubs.forEach(u => u());
    this.#swiper?.destroy();
  }
}
