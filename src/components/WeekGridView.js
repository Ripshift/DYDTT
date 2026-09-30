/**
 * DYDTT Phase 1 — WeekGridView Component
 * Inline 3×3 week grid with selected day tasks below.
 */

import { store }                                         from '../store.js';
import { getWeekGridDates, parseDisplayDate, todayStr }  from '../utils/dateHelpers.js';
import TaskItem                                           from './TaskItem.js';
import { announce }                                       from '../utils/a11y.js';

const DAY_ABBR = ['Su','Mo','Tu','We','Th','Fr','Sa'];

export default class WeekGridView {
  #container = null;
  #grid      = null;
  #taskPanel = null;
  #itemMap   = new Map();
  #unsubs    = [];

  constructor({ container }) {
    this.#container = container;
    this.#render();
    this.#subscribe();
  }

  #render() {
    const root = document.createElement('div');
    root.className = 'wgv';

    const header = document.createElement('div');
    header.className = 'wgv__header';
    const title = document.createElement('span');
    title.className = 'wgv__title';
    title.id = 'wgv-title';
    header.appendChild(title);
    root.appendChild(header);

    this.#grid = document.createElement('div');
    this.#grid.className = 'week-grid wgv__grid';
    this.#grid.setAttribute('role', 'grid');
    this.#grid.setAttribute('aria-labelledby', 'wgv-title');
    root.appendChild(this.#grid);

    this.#taskPanel = document.createElement('div');
    this.#taskPanel.className = 'wgv__tasks';
    root.appendChild(this.#taskPanel);

    this.#container.appendChild(root);
  }

  #subscribe() {
    this.#unsubs.push(
      store.subscribe('currentDate',   () => this.#refreshGrid()),
      store.subscribe('weeklySummary', () => this.#refreshGrid()),
      store.subscribe('tasks',         (tasks) => this.#refreshTasks(tasks)),
      store.subscribe('ui',            (ui) => this.#syncSelection(ui.selectedTaskId)),
    );
  }

  #refreshGrid() {
    const today   = todayStr();
    const centre  = store.state.currentDate;
    const dates   = getWeekGridDates(centre);
    const summary = store.state.weeklySummary ?? {};

    this.#grid.innerHTML = '';

    dates.forEach((dateStr) => {
      const parsed  = parseDisplayDate(dateStr);
      const isToday = dateStr === today;
      const isSel   = dateStr === centre;
      const { total = 0, done = 0 } = summary[dateStr] ?? {};

      const cell = document.createElement('div');
      cell.className = ['week-cell', isToday ? 'today' : '', isSel ? 'selected' : '']
        .filter(Boolean).join(' ');
      cell.setAttribute('role',     'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label',
        `${parsed.weekday} ${parsed.day} ${parsed.monthAbbr}: ${done} of ${total} tasks${isToday ? ' (today)' : ''}`);

      const dayEl = document.createElement('div');
      dayEl.className   = 'week-cell__day';
      dayEl.textContent = DAY_ABBR[new Date(dateStr + 'T00:00:00').getDay()];

      const numEl = document.createElement('div');
      numEl.className   = 'week-cell__num';
      numEl.textContent = String(parsed.day);

      cell.append(dayEl, numEl);

      if (total > 0) {
        const dots = document.createElement('div');
        dots.className = 'week-cell__dots';
        for (let i = 0; i < Math.min(total, 5); i++) {
          const dot = document.createElement('div');
          dot.className = `week-cell__dot${i < done ? ' done' : ''}`;
          dots.appendChild(dot);
        }
        cell.appendChild(dots);
      }

      const navigate = () => {
        store.dispatch('NAV_TO_DATE', { date: dateStr });
        announce(`${parsed.weekday} ${parsed.day} ${parsed.monthAbbr}`);
      };
      cell.addEventListener('click', navigate);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); }
      });

      this.#grid.appendChild(cell);
    });

    const d0 = parseDisplayDate(dates[0]);
    const d8 = parseDisplayDate(dates[8]);
    const titleEl = this.#container.querySelector('.wgv__title');
    if (titleEl) {
      titleEl.textContent = d0.monthAbbr === d8.monthAbbr
        ? `${d0.monthAbbr} ${d0.year}`
        : `${d0.monthAbbr} · ${d8.monthAbbr} ${d8.year}`;
    }
  }

  #refreshTasks(tasks) {
    const panel      = this.#taskPanel;
    const selectedId = store.state.ui.selectedTaskId;
    const centre     = store.state.currentDate;
    const parsed     = parseDisplayDate(centre);

    let dayHeader = panel.querySelector('.wgv__day-header');
    if (!dayHeader) {
      dayHeader = document.createElement('div');
      dayHeader.className = 'wgv__day-header';
      panel.prepend(dayHeader);
    }
    dayHeader.innerHTML = `
      <span class="wgv__day-label">
        ${parsed.isToday ? 'Today · ' : ''}${parsed.weekday}, ${parsed.monthAbbr} ${parsed.day}
      </span>
      <span class="wgv__task-count">${tasks.length} task${tasks.length !== 1 ? 's' : ''}</span>`;

    let taskList = panel.querySelector('.task-list');
    if (!taskList) {
      taskList = document.createElement('div');
      taskList.className = 'task-list';
      taskList.setAttribute('role', 'list');
      panel.appendChild(taskList);
    }

    const currentIds = new Set(tasks.map(t => t.id));
    for (const [id, item] of this.#itemMap) {
      if (!currentIds.has(id)) { item.el.remove(); this.#itemMap.delete(id); }
    }

    tasks.forEach((task) => {
      const isSelected = task.id === selectedId;
      if (this.#itemMap.has(task.id)) {
        this.#itemMap.get(task.id).update(task, isSelected);
      } else {
        const item = new TaskItem(task, isSelected);
        item.el.setAttribute('role', 'listitem');
        this.#itemMap.set(task.id, item);
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
        msg.textContent = 'Nothing planned · enjoy the day';
        empty.appendChild(msg);
        panel.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
  }

  #syncSelection(selectedId) {
    for (const [id, item] of this.#itemMap) item.setSelected(id === selectedId);
  }

  destroy() { this.#unsubs.forEach(u => u()); }
}
