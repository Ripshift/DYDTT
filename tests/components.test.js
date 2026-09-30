import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, openDb } from '../src/db/schema.js';
import { store } from '../src/store.js';
import TaskItem        from '../src/components/TaskItem.js';
import SwipeController from '../src/components/SwipeController.js';

beforeEach(async () => { await openDb(); await db.tasks.clear(); });

describe('TaskItem', () => {
  const base = { id: 't1', title: 'Walk dog', done: false };

  it('renders title, meta and state classes', () => {
    const item = new TaskItem({ ...base, done: true, priority: 1, reminderAt: new Date(2026, 9, 1, 9, 30).getTime(), tags: ['home'] }, true);
    const el = item.el;
    expect(el.querySelector('.task-item__title').textContent).toBe('Walk dog');
    expect(el.querySelector('.task-item__meta').textContent).toBe('9:30 AM · home');
    expect(el.className).toContain('task-item--done');
    expect(el.className).toContain('task-item--high-priority');
    expect(el.className).toContain('task-item--selected');
    expect(el.getAttribute('aria-label')).toBe('Walk dog — selected — done');
    expect(el.querySelector('.task-checkbox').getAttribute('aria-checked')).toBe('true');
  });

  it('low priority, no meta when nothing to show', () => {
    const el = new TaskItem({ ...base, priority: 2 }).el;
    expect(el.className).toContain('task-item--low-priority');
    expect(el.querySelector('.task-item__meta')).toBeNull();
  });

  it('checkbox toggles (without selecting); row click + Enter/Space select', () => {
    const spy = vi.spyOn(store, 'dispatch').mockResolvedValue();
    const item = new TaskItem(base);
    const onToggle = vi.fn(), onSelect = vi.fn();
    item.on('toggle', onToggle);
    const off = item.on('select', onSelect);

    item.el.querySelector('.task-checkbox').click();
    expect(spy).toHaveBeenCalledWith('TASK_TOGGLE', { id: 't1' });
    expect(onToggle).toHaveBeenCalledWith(base);
    expect(spy).not.toHaveBeenCalledWith('TASK_SELECT', expect.anything());

    item.el.click();
    item.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    item.el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    item.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(spy.mock.calls.filter(c => c[0] === 'TASK_SELECT')).toHaveLength(3);
    expect(onSelect).toHaveBeenCalledTimes(3);

    off();
    item.el.click();
    expect(onSelect).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('update() re-renders in place; setSelected() toggles the highlight', () => {
    const parent = document.createElement('div');
    const item = new TaskItem(base);
    parent.appendChild(item.el);
    item.update({ ...base, title: 'Walk dog twice' }, false);
    expect(parent.children).toHaveLength(1);
    expect(parent.textContent).toContain('Walk dog twice');
    item.setSelected(true);
    expect(item.el.getAttribute('aria-pressed')).toBe('true');
    item.setSelected(false);
    expect(item.el.classList.contains('task-item--selected')).toBe(false);
  });
});

describe('SwipeController', () => {
  const pointer = (el, type, x, y) =>
    el.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y }));

  function setup(opts) {
    const el = document.createElement('div');
    const sc = new SwipeController(el, opts);
    const left = vi.fn(), right = vi.fn();
    sc.on('swipe-left', left);
    sc.on('swipe-right', right);
    return { el, sc, left, right };
  }

  it('horizontal drags past the threshold emit swipes', () => {
    const { el, left, right } = setup();
    pointer(el, 'pointerdown', 300, 100); pointer(el, 'pointermove', 200, 100); pointer(el, 'pointerup', 100, 110);
    pointer(el, 'pointerdown', 100, 100); pointer(el, 'pointerup', 300, 90);
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(1);
  });

  it('ignores short, vertical, cancelled and stray pointer-ups', () => {
    const { el, left, right } = setup({ threshold: 80 });
    pointer(el, 'pointerdown', 100, 100); pointer(el, 'pointerup', 160, 100);   // too short
    pointer(el, 'pointerdown', 100, 100); pointer(el, 'pointerup', 200, 300);   // too steep
    pointer(el, 'pointerdown', 100, 100); pointer(el, 'pointercancel', 0, 0); pointer(el, 'pointerup', 300, 100);
    pointer(el, 'pointerup', 300, 100);                                          // no down
    expect(left).not.toHaveBeenCalled();
    expect(right).not.toHaveBeenCalled();
  });

  it('arrow keys are the keyboard fallback; destroy() detaches', () => {
    const { el, sc, left, right } = setup();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(1);
    sc.destroy();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe works', () => {
    const el = document.createElement('div');
    const sc = new SwipeController(el);
    const fn = vi.fn();
    sc.on('swipe-left', fn)();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(fn).not.toHaveBeenCalled();
  });
});
