import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, openDb } from '../src/db/schema.js';
import { store } from '../src/store.js';
import { todayStr, addDays } from '../src/utils/dateHelpers.js';
import DayView            from '../src/components/DayView.js';
import FortyEightHourView from '../src/components/FortyEightHourView.js';
import WeekGridView       from '../src/components/WeekGridView.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const TODAY = todayStr();
let container, view;

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await store.dispatch('TASK_DESELECT');
  await store.dispatch('NAV_TO_DATE', { date: TODAY });
  container = document.createElement('div');
  document.getElementById('app').appendChild(container);
});
afterEach(() => view?.destroy());

const titles = (root = container) => [...root.querySelectorAll('.task-item__title')].map(e => e.textContent);

describe('DayView', () => {
  it('shows the empty state, then tasks as they are added', async () => {
    view = new DayView({ container });
    expect(container.querySelector('.task-list__empty-msg').textContent).toMatch(/Nothing planned/);
    expect(container.querySelector('.day-header__weekday').textContent).toMatch(/Today/);

    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'First',  order: 1 });
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'Second', order: 2 });
    expect(titles()).toEqual(['First', 'Second']);
    expect(container.querySelector('.task-list--empty')).toBeNull();
  });

  it('updates, highlights and removes items in place', async () => {
    view = new DayView({ container });
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'Walk dog' });
    const id = store.state.tasks[0].id;

    await store.dispatch('TASK_TOGGLE', { id });
    expect(container.querySelector('.task-item').classList.contains('task-item--done')).toBe(true);

    await store.dispatch('TASK_SELECT', { id });
    expect(container.querySelector('.task-item').classList.contains('task-item--selected')).toBe(true);

    await store.dispatch('TASK_DELETE', { id });
    expect(titles()).toEqual([]);
    expect(container.querySelector('.task-list--empty')).not.toBeNull();
  });

  it('arrow keys change the day and update the header + title', async () => {
    view = new DayView({ container });
    const swipe = container.querySelector('.swipe-container');
    swipe.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    expect(document.title).toMatch(/^Tomorrow/);
    swipe.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await tick();
    expect(store.state.currentDate).toBe(TODAY);
  });
});

describe('FortyEightHourView', () => {
  it('shows today and tomorrow side by side', async () => {
    await store.dispatch('TASK_UPSERT', { date: TODAY,             title: 'Today task' });
    await store.dispatch('TASK_UPSERT', { date: addDays(TODAY, 1), title: 'Tomorrow task' });
    view = new FortyEightHourView({ container });
    await tick();
    const [p0, p1] = container.querySelectorAll('.fhv__panel');
    expect(titles(p0)).toEqual(['Today task']);
    expect(titles(p1)).toEqual(['Tomorrow task']);
    expect(p0.querySelector('.day-header__weekday').textContent).toMatch(/Today/);
    expect(p1.querySelector('.day-header__weekday').textContent).toMatch(/Tomorrow/);
  });

  it('shows empty states and follows selection + navigation', async () => {
    view = new FortyEightHourView({ container });
    await tick();
    expect(container.querySelectorAll('.task-list--empty')).toHaveLength(2);

    await store.dispatch('TASK_UPSERT', { date: addDays(TODAY, 1), title: 'Later' });
    await tick();
    const id = (await db.tasks.toArray())[0].id;
    await store.dispatch('TASK_SELECT', { id });
    expect(container.querySelector('.task-item--selected')).not.toBeNull();

    await store.dispatch('NAV_NEXT_DAY');
    await tick();
    const [p0] = container.querySelectorAll('.fhv__panel');
    expect(titles(p0)).toEqual(['Later']);
    expect(p0.querySelector('.day-header__weekday').textContent).toMatch(/Tomorrow/);
  });
});

describe('WeekGridView (9 Day)', () => {
  it('renders 9 cells centred on the selected day with task dots', async () => {
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'A', done: true });
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'B' });
    view = new WeekGridView({ container });
    const cells = container.querySelectorAll('.week-cell');
    expect(cells).toHaveLength(9);
    expect(cells[4].classList.contains('today')).toBe(true);
    expect(cells[4].classList.contains('selected')).toBe(true);
    expect(cells[4].querySelectorAll('.week-cell__dot')).toHaveLength(2);
    expect(cells[4].querySelectorAll('.week-cell__dot.done')).toHaveLength(1);
    expect(container.querySelector('.wgv__task-count').textContent).toBe('2 tasks');
    expect(container.querySelector('.wgv__title').textContent).not.toBe('');
  });

  it('clicking or pressing Enter on a cell selects that day', async () => {
    view = new WeekGridView({ container });
    container.querySelectorAll('.week-cell')[5].click();
    await tick();
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    expect(container.querySelector('.wgv__day-label').textContent).toMatch(/,/);
    expect(container.querySelector('.task-list__empty-msg')).not.toBeNull();

    container.querySelectorAll('.week-cell')[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(store.state.currentDate).toBe(TODAY);
  });

  it('lists, highlights and removes tasks for the selected day', async () => {
    view = new WeekGridView({ container });
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'Only one' });
    expect(titles()).toEqual(['Only one']);
    expect(container.querySelector('.wgv__task-count').textContent).toBe('1 task');
    const id = store.state.tasks[0].id;
    await store.dispatch('TASK_SELECT', { id });
    expect(container.querySelector('.task-item--selected')).not.toBeNull();
    await store.dispatch('TASK_DELETE', { id });
    expect(titles()).toEqual([]);
  });
});
