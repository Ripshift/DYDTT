/**
 * DYDTT Phase 1 — Dev Seed
 * Idempotent: only seeds if tasks table is empty.
 * Run with: pnpm seed
 */

import { openDb, upsertTask, setSetting } from './schema.js';
import { todayStr, addDays } from '../utils/dateHelpers.js';

const TODAY = todayStr();

function dateOffset(n) {
  return addDays(TODAY, n);
}

const SEED_TASKS = [
  // Today
  { date: TODAY,          title: 'Morning stand-up',          notes: 'Slack call 9am',   done: false, order: 1 },
  { date: TODAY,          title: 'Review Sprint 1 board',     notes: '',                  done: true,  order: 2 },
  { date: TODAY,          title: 'Write unit tests for store', notes: 'Focus on dispatch', done: false, order: 3 },
  { date: TODAY,          title: 'Lunch break — actually take it', notes: '',             done: false, order: 4 },
  { date: TODAY,          title: 'Push notification spike',   notes: 'VAPID setup',       done: false, order: 5 },

  // Yesterday
  { date: dateOffset(-1), title: 'Set up Vite project',       notes: '',  done: true,  order: 1 },
  { date: dateOffset(-1), title: 'Install Dexie and Workbox', notes: '',  done: true,  order: 2 },
  { date: dateOffset(-1), title: 'Storybook first run',       notes: '',  done: true,  order: 3 },
  { date: dateOffset(-1), title: 'Design token audit',        notes: '',  done: false, order: 4 },

  // Day before yesterday
  { date: dateOffset(-2), title: 'Kickoff planning session',  notes: '',  done: true,  order: 1 },
  { date: dateOffset(-2), title: 'Write SPRINT_BACKLOG.md',   notes: '',  done: true,  order: 2 },
  { date: dateOffset(-2), title: 'Repo setup and CI',         notes: '',  done: true,  order: 3 },

  // Tomorrow
  { date: dateOffset(1),  title: 'SwipeController tests',     notes: '',  done: false, order: 1 },
  { date: dateOffset(1),  title: 'Modal focus trap review',   notes: 'Axe audit', done: false, order: 2 },
  { date: dateOffset(1),  title: 'Lighthouse PWA audit',      notes: '',  done: false, order: 3 },
  { date: dateOffset(1),  title: 'Team sync 3pm',             notes: '',  done: false, order: 4 },

  // Day after tomorrow
  { date: dateOffset(2),  title: 'WeekGrid component build',  notes: '',  done: false, order: 1 },
  { date: dateOffset(2),  title: 'Background sync wiring',    notes: '',  done: false, order: 2 },
  { date: dateOffset(2),  title: 'Cross-browser smoke test',  notes: '',  done: false, order: 3 },

  // 3 days out
  { date: dateOffset(3),  title: 'Sprint 1 demo prep',        notes: '',  done: false, order: 1 },
  { date: dateOffset(3),  title: 'Record Loom walkthrough',   notes: '',  done: false, order: 2 },

  // 4 days out
  { date: dateOffset(4),  title: 'Sprint retrospective',      notes: '',  done: false, order: 1 },
  { date: dateOffset(4),  title: 'Update SPRINT_BACKLOG.md',  notes: '',  done: false, order: 2 },
  { date: dateOffset(4),  title: 'Sprint 2 planning',         notes: '',  done: false, order: 3 },

  // -3 days
  { date: dateOffset(-3), title: 'Initial wireframes review', notes: '',  done: true,  order: 1 },
  { date: dateOffset(-3), title: 'Token palette sign-off',    notes: '',  done: true,  order: 2 },
  { date: dateOffset(-3), title: 'Accessibility contract doc',notes: '',  done: true,  order: 3 },

  // -4 days
  { date: dateOffset(-4), title: 'Project kickoff meeting',   notes: '',  done: true,  order: 1 },
  { date: dateOffset(-4), title: 'Stack decision: Vanilla JS', notes: '', done: true,  order: 2 },

  // Extras for today
  { date: TODAY,          title: 'Update README',             notes: '',  done: false, order: 6 },
  { date: TODAY,          title: 'Evening walk — no screens', notes: '',  done: false, order: 7 },
];

const SEED_SETTINGS = [
  { key: 'reducedMotion',      value: false },
  { key: 'pushEnabled',        value: false },
  { key: 'defaultReminderMin', value: 30    },
  { key: 'userName',           value: ''    },
  { key: 'theme',              value: 'dark'},
];

export async function seed() {
  const db = await openDb();
  const count = await db.tasks.count();
  if (count > 0) {
    console.info('[Seed] Tasks already present — skipping seed.');
    return;
  }

  console.info('[Seed] Seeding tasks and settings...');

  for (const task of SEED_TASKS) {
    await upsertTask(task);
  }

  for (const { key, value } of SEED_SETTINGS) {
    await setSetting(key, value);
  }

  console.info(`[Seed] Done. ${SEED_TASKS.length} tasks seeded.`);
}

// Allow direct execution: pnpm seed
if (typeof process !== 'undefined' && process.argv[1]?.includes('seed')) {
  seed().catch(console.error);
}
