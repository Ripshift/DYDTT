/**
 * DYDTT Phase 1 — Dexie Schema & Helpers
 */

import Dexie from 'dexie';

export const db = new Dexie('dydtt');

db.version(1).stores({
  tasks:     '++id, date, order, done, syncStatus, updatedAt',
  days:      'date',
  settings:  'key',
  syncQueue: '++id, createdAt, action',
  pushLog:   '++id, taskId, sentAt, status',
});

// ── UUID helper — works in both secure (HTTPS) and non-secure (HTTP) contexts
function generateId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback: UUID v4 via getRandomValues (available over plain HTTP)
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return [...b].map((v, i) =>
    ([4,6,8,10].includes(i) ? '-' : '') + v.toString(16).padStart(2,'0')
  ).join('');
}

// ── openDb ────────────────────────────────────────────────────────────────
export async function openDb() {
  await db.open();
  return db;
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export async function getTasksForDate(date) {
  return db.tasks.where('date').equals(date).sortBy('order');
}

export async function getTask(id) {
  return db.tasks.get(id);
}

/**
 * Create or update a task. When `task.id` matches an existing record, the
 * given fields are MERGED into it (fields that are undefined are ignored),
 * so partial updates never wipe done / order / createdAt / priority / tags.
 */
export async function upsertTask(task) {
  const now      = Date.now();
  const existing = task.id != null ? await db.tasks.get(task.id) : undefined;
  const changes  = Object.fromEntries(
    Object.entries(task).filter(([, v]) => v !== undefined),
  );
  const merged = { ...existing, ...changes };
  const record = {
    ...merged,
    id:         merged.id        ?? generateId(),
    createdAt:  merged.createdAt ?? now,
    updatedAt:  now,
    done:       merged.done      ?? false,
    order:      merged.order     ?? now,
    syncStatus: 'pending-upsert',
  };
  await db.tasks.put(record);
  return record;
}

export async function deleteTask(id) {
  await db.tasks.update(id, {
    syncStatus: 'pending-delete',
    updatedAt:  Date.now(),
  });
}

export async function hardDeleteTask(id) {
  await db.tasks.delete(id);
}

export async function getWeeklySummary(dates) {
  const result = {};
  await Promise.all(dates.map(async (date) => {
    const tasks  = await getTasksForDate(date);
    const active = tasks.filter(t => t.syncStatus !== 'pending-delete');
    result[date] = {
      total: active.length,
      done:  active.filter(t => t.done).length,
    };
  }));
  return result;
}

// ── Settings ──────────────────────────────────────────────────────────────

export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value, updatedAt: Date.now() });
}

// ── Sync Queue ────────────────────────────────────────────────────────────

export async function enqueueSyncAction(action, payload) {
  await db.syncQueue.add({ action, payload, createdAt: Date.now(), attempts: 0 });
}

export async function getPendingSyncActions() {
  return db.syncQueue.orderBy('createdAt').toArray();
}

export async function removeSyncAction(id) {
  await db.syncQueue.delete(id);
}

// ── Push Log ──────────────────────────────────────────────────────────────

export async function logPushSent(taskId, status = 'sent') {
  await db.pushLog.add({ taskId, sentAt: Date.now(), status });
}

export async function getPushLog(taskId) {
  return db.pushLog.where('taskId').equals(taskId).toArray();
}

/** Record that the reminder for this task at this exact time has been shown. */
export async function markReminderShown(taskId, reminderAt) {
  await db.pushLog.add({ taskId, reminderAt, sentAt: Date.now(), status: 'shown' });
}

/** True if this task's reminder (for this exact reminderAt) was already shown. */
export async function wasReminderShown(taskId, reminderAt) {
  const rows = await db.pushLog.where('taskId').equals(taskId).toArray();
  return rows.some(r => r.status === 'shown' && r.reminderAt === reminderAt);
}

/** Tasks with a reminder in [from, to] that are not done or deleted. */
export async function getTasksWithRemindersBetween(from, to) {
  return db.tasks
    .filter(t => typeof t.reminderAt === 'number'
              && t.reminderAt >= from && t.reminderAt <= to
              && !t.done && t.syncStatus !== 'pending-delete')
    .toArray();
}
