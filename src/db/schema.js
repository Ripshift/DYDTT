/**
 * DYDTT Phase 1 — Dexie Schema & Helpers
 */

import Dexie from 'dexie';
import { normaliseRule, occurrencesFor } from '../utils/recurrence.js';

export const db = new Dexie('dydtt');

db.version(1).stores({
  tasks:     '++id, date, order, done, syncStatus, updatedAt',
  days:      'date',
  settings:  'key',
  syncQueue: '++id, createdAt, action',
  pushLog:   '++id, taskId, sentAt, status',
});

// v2 — repeating tasks (series) + sync queue keyed by record
db.version(2).stores({
  tasks:     '++id, date, order, done, syncStatus, updatedAt, seriesId',
  series:    'id, updatedAt',
  syncQueue: '++id, createdAt, kind, recordId',
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
  syncActive = Boolean(await getSetting('syncUid'));
  return db;
}

export { generateId };

// ── Sync gate ─────────────────────────────────────────────────────────────
// Changes are only queued for upload while an account is linked to this device.
let syncActive = false;
export function setSyncActive(on) { syncActive = Boolean(on); }
export function isSyncActive()    { return syncActive; }

/** A record that should be shown (not deleted / tombstoned). */
export function isLive(t) {
  return Boolean(t) && !t.deleted && t.syncStatus !== 'pending-delete';
}

const OCCURRENCE_RE = /_(\d{4}-\d{2}-\d{2})_\d+$/;
const dropUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ── Tasks ─────────────────────────────────────────────────────────────────

/**
 * Tasks for a day, sorted by order. Repeating-task occurrences for that day
 * are created on first read (pass { materialize: false } to skip).
 * Includes tombstones — filter with isLive() for display.
 */
export async function getTasksForDate(date, { materialize = true } = {}) {
  if (materialize) await ensureOccurrences(date);
  return db.tasks.where('date').equals(date).sortBy('order');
}

export async function getLiveTasksForDate(date) {
  return (await getTasksForDate(date)).filter(isLive);
}

export async function getTask(id) {
  return db.tasks.get(id);
}

/**
 * Create or update a task. When `task.id` matches an existing record, the
 * given fields are MERGED into it (fields that are undefined are ignored),
 * so partial updates never wipe done / order / createdAt / priority / tags.
 * Editing a generated repeat occurrence turns it into a real (synced) record.
 */
export async function upsertTask(task) {
  const now = Date.now();
  let existing = task.id != null ? await db.tasks.get(task.id) : undefined;
  // A repeat copy that was just regenerated (e.g. its series changed) — recreate it first
  const occ = !existing && typeof task.id === 'string' && task.id.match(OCCURRENCE_RE);
  if (occ) {
    await ensureOccurrences(occ[1]);
    existing = await db.tasks.get(task.id);
  }
  const merged   = { ...existing, ...dropUndefined(task) };
  const record = {
    ...merged,
    id:         merged.id        ?? generateId(),
    createdAt:  merged.createdAt ?? now,
    updatedAt:  now,
    done:       merged.done      ?? false,
    order:      merged.order     ?? now,
    deleted:    merged.deleted   ?? false,
    generated:  false,
    syncStatus: 'pending-upsert',
  };
  await db.tasks.put(record);
  await queueChange('task', record.id);
  return record;
}

/** Soft-delete (tombstone) so other devices learn about it and repeats don't regenerate it. */
export async function deleteTask(id) {
  const t = await db.tasks.get(id);
  if (!t) return;
  await db.tasks.put({ ...t, deleted: true, generated: false, syncStatus: 'pending-delete', updatedAt: Date.now() });
  await queueChange('task', id);
}

export async function deleteTasks(ids) {
  for (const id of ids) await deleteTask(id);
}

export async function hardDeleteTask(id) {
  await db.tasks.delete(id);
}

export async function getWeeklySummary(dates) {
  const result = {};
  for (const date of dates) {
    const active = (await getTasksForDate(date)).filter(isLive);
    result[date] = {
      total: active.length,
      done:  active.filter(t => t.done).length,
    };
  }
  return result;
}

// ── Repeating tasks (series) ──────────────────────────────────────────────

export async function getSeries(id) {
  return db.series.get(id);
}

export async function getLiveSeries() {
  return (await db.series.toArray()).filter(isLive);
}

/** Create or update a series (merge semantics like upsertTask). */
export async function upsertSeries(series) {
  const now      = Date.now();
  const existing = series.id ? await db.series.get(series.id) : undefined;
  const merged   = { ...existing, ...dropUndefined(series) };
  const record = {
    ...merged,
    id:         merged.id ?? generateId(),
    rule:       normaliseRule(merged.rule),
    notes:      merged.notes ?? '',
    createdAt:  merged.createdAt ?? now,
    updatedAt:  now,
    deleted:    merged.deleted ?? false,
    syncStatus: 'pending-upsert',
  };
  await db.series.put(record);
  await queueChange('series', record.id);
  return record;
}

export async function deleteSeries(id) {
  const s = await db.series.get(id);
  if (!s) return;
  await db.series.put({ ...s, deleted: true, syncStatus: 'pending-delete', updatedAt: Date.now() });
  await queueChange('series', id);
}

/** Create any missing occurrences of live series on this date. Never overwrites existing records. */
export async function ensureOccurrences(date) {
  const series = await getLiveSeries();
  if (!series.length) return;
  const wanted = series.flatMap(s => occurrencesFor(s, date));
  if (!wanted.length) return;
  const existing = new Set((await db.tasks.bulkGet(wanted.map(w => w.id))).filter(Boolean).map(t => t.id));
  const missing  = wanted.filter(w => !existing.has(w.id))
    .map(w => ({ ...w, deleted: false, generated: true, syncStatus: 'synced' }));
  if (!missing.length) return;
  try {
    await db.tasks.bulkAdd(missing);
  } catch (err) {
    // Another call created some of them first — fine, existing records win.
    if (err?.name !== 'BulkError') throw err;
  }
}

/** All task records (incl. tombstones) belonging to a series. */
export async function getSeriesTasks(seriesId) {
  return db.tasks.where('seriesId').equals(seriesId).toArray();
}

/**
 * Remove generated (never edited) occurrences of a series from `fromDate` on,
 * so they are re-created from the series' current rule on next read.
 * Local-only — generated occurrences are never uploaded.
 */
export async function pruneGenerated(seriesId, fromDate = '0000-00-00') {
  const rows = await getSeriesTasks(seriesId);
  const ids  = rows.filter(t => t.generated && t.date >= fromDate).map(t => t.id);
  await db.tasks.bulkDelete(ids);
  return ids.length;
}

// ── Bulk clears ───────────────────────────────────────────────────────────

/** Tombstone every live task on a day (repeats won't regenerate there). Returns count. */
export async function clearDay(date) {
  const live = (await getTasksForDate(date)).filter(isLive);
  await deleteTasks(live.map(t => t.id));
  return live.length;
}

/**
 * Remove everything. Signed out: hard delete. Signed in: tombstones so the
 * deletion syncs to the account and other devices.
 */
export async function wipeAll() {
  if (!syncActive) {
    await db.transaction('rw', db.tasks, db.series, db.syncQueue, db.pushLog, async () => {
      await db.tasks.clear();
      await db.series.clear();
      await db.syncQueue.clear();
      await db.pushLog.clear();
    });
    return;
  }
  const now = Date.now();
  // Generated occurrences only exist locally — just drop them.
  await db.tasks.filter(t => t.generated).delete();
  const tasks  = (await db.tasks.toArray()).filter(isLive);
  const series = (await db.series.toArray()).filter(isLive);
  await db.tasks.bulkPut(tasks.map(t => ({ ...t, deleted: true, syncStatus: 'pending-delete', updatedAt: now })));
  await db.series.bulkPut(series.map(s => ({ ...s, deleted: true, syncStatus: 'pending-delete', updatedAt: now })));
  for (const t of tasks)  await queueChange('task', t.id);
  for (const s of series) await queueChange('series', s.id);
}

/** Drop all local task data (used on sign-out). Settings are kept. */
export async function clearLocalData() {
  await db.transaction('rw', db.tasks, db.series, db.syncQueue, db.pushLog, async () => {
    await db.tasks.clear();
    await db.series.clear();
    await db.syncQueue.clear();
    await db.pushLog.clear();
  });
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
// Holds which records changed; the sync engine uploads their latest state.

export async function queueChange(kind, recordId) {
  if (!syncActive) return;
  await db.syncQueue.add({ kind, recordId, createdAt: Date.now() });
}

export async function getQueuedChanges(limit = 400) {
  return db.syncQueue.orderBy('createdAt').limit(limit).toArray();
}

export async function removeQueued(ids) {
  await db.syncQueue.bulkDelete(ids);
}

export async function queuedCount() {
  return db.syncQueue.count();
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
              && !t.done && isLive(t))
    .toArray();
}
