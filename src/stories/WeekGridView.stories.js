/**
 * DYDTT Phase 1 — Week grid (9 Day view) Storybook Stories
 * Static markup matching WeekGridView's grid, with sample task counts.
 */

import { todayStr, addDays } from '../utils/dateHelpers.js';

export default {
  title: 'Components/WeekGridView (9 Day)',
  tags:  ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '3x3 grid shown at the top of the 9 Day view, centred on the selected day. ' +
                   'Today is highlighted gold; dots show tasks done vs total. Tap a cell to select that day.',
      },
    },
    layout: 'fullscreen',
  },
};

const TODAY = todayStr();

function dateOffset(n) {
  return addDays(TODAY, n);
}

const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DATES = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(n => dateOffset(n));

const SUMMARY = {
  [dateOffset(-4)]: { total: 2, done: 2 },
  [dateOffset(-3)]: { total: 3, done: 3 },
  [dateOffset(-2)]: { total: 3, done: 3 },
  [dateOffset(-1)]: { total: 4, done: 3 },
  [TODAY]:          { total: 7, done: 2 },
  [dateOffset(1)]:  { total: 4, done: 0 },
  [dateOffset(2)]:  { total: 3, done: 0 },
  [dateOffset(3)]:  { total: 2, done: 0 },
  [dateOffset(4)]:  { total: 3, done: 0 },
};

function buildGrid(summary = SUMMARY) {
  const root = document.createElement('div');
  root.className = 'wgv';
  root.style.padding = '16px';

  const header = document.createElement('div');
  header.className = 'wgv__header';
  const title = document.createElement('span');
  title.className = 'wgv__title';
  const d0 = new Date(DATES[0] + 'T00:00:00');
  const d8 = new Date(DATES[8] + 'T00:00:00');
  title.textContent = d0.getMonth() === d8.getMonth()
    ? d0.toLocaleString('en', { month: 'short', year: 'numeric' })
    : `${d0.toLocaleString('en', { month: 'short' })} · ${d8.toLocaleString('en', { month: 'short', year: 'numeric' })}`;
  header.appendChild(title);
  root.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'week-grid wgv__grid';
  grid.setAttribute('role', 'grid');

  DATES.forEach((dateStr) => {
    const isToday = dateStr === TODAY;
    const dow     = new Date(dateStr + 'T00:00:00').getDay();
    const day     = new Date(dateStr + 'T00:00:00').getDate();
    const { total = 0, done = 0 } = summary[dateStr] ?? {};

    const cell = document.createElement('div');
    cell.className = `week-cell${isToday ? ' today selected' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label',
      `${DAY_ABBR[dow]} ${day}: ${done} of ${total} done${isToday ? ' (today)' : ''}`);

    const dayEl = document.createElement('div');
    dayEl.className = 'week-cell__day';
    dayEl.textContent = DAY_ABBR[dow];

    const numEl = document.createElement('div');
    numEl.className = 'week-cell__num';
    numEl.textContent = String(day);

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

    grid.appendChild(cell);
  });

  root.appendChild(grid);
  return root;
}

export const Default = {
  name: 'Default (mixed week)',
  render: () => buildGrid(SUMMARY),
};

export const EmptyWeek = {
  name: 'Empty week (no tasks)',
  render: () => buildGrid({}),
};

export const FullWeek = {
  name: 'All tasks done',
  render: () => {
    const full = {};
    DATES.forEach(d => { full[d] = { total: 5, done: 5 }; });
    return buildGrid(full);
  },
};

export const TodayOnly = {
  name: 'Tasks on today only',
  render: () => buildGrid({ [TODAY]: { total: 7, done: 3 } }),
};
