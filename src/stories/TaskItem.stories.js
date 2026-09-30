/**
 * DYDTT Phase 1 — TaskItem Storybook Stories
 */

import TaskItem from '../components/TaskItem.js';

export default {
  title: 'Components/TaskItem',
  tags:  ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Single task row. Checkbox toggles done state. ' +
                   'Clicking the row opens the edit modal.',
      },
    },
  },
  argTypes: {
    onToggle: { action: 'toggle' },
    onSelect: { action: 'select' },
  },
};

const BASE_TASK = {
  id:         'story-task-1',
  date:       '2026-09-28',
  title:      'Build the DYDTT SwipeController',
  notes:      'Touch + keyboard + pointer events',
  done:       false,
  priority:   0,
  order:      1,
  reminderAt: null,
  tags:       [],
  syncStatus: 'synced',
  createdAt:  Date.now(),
  updatedAt:  Date.now(),
};

function mount(task, args) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:420px;';
  const item = new TaskItem(task);
  item.on('toggle', () => args.onToggle?.());
  item.on('select', () => args.onSelect?.());
  wrap.appendChild(item.el);
  return wrap;
}

export const Default = {
  name: 'Default (not done)',
  render: (args) => mount({ ...BASE_TASK }, args),
};

export const Done = {
  name: 'Done (strikethrough)',
  render: (args) => mount({ ...BASE_TASK, id: 'story-task-2', done: true }, args),
};

export const WithReminder = {
  name: 'With reminder time',
  render: (args) => {
    const d = new Date(); d.setHours(9, 30, 0, 0);
    return mount({ ...BASE_TASK, id: 'story-task-3', reminderAt: d.getTime() }, args);
  },
};

export const HighPriority = {
  name: 'High priority',
  render: (args) => mount({ ...BASE_TASK, id: 'story-task-4', priority: 1 }, args),
};

export const LongTitle = {
  name: 'Long title (truncation)',
  render: (args) => mount({
    ...BASE_TASK,
    id:    'story-task-5',
    title: 'This is an extremely long task title that should truncate gracefully within the task item row',
  }, args),
};

export const List = {
  name: 'Task list (5 items)',
  render: () => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:420px;display:flex;flex-direction:column;gap:4px;';
    const items = [
      { ...BASE_TASK, id: 'l1', title: 'Morning stand-up',          done: true  },
      { ...BASE_TASK, id: 'l2', title: 'Review Sprint board',        done: true  },
      { ...BASE_TASK, id: 'l3', title: 'Write unit tests for store', done: false },
      { ...BASE_TASK, id: 'l4', title: 'Push notification spike',    done: false },
      { ...BASE_TASK, id: 'l5', title: 'Evening walk',               done: false },
    ];
    items.forEach(t => { const i = new TaskItem(t); wrap.appendChild(i.el); });
    return wrap;
  },
};
