/**
 * DYDTT — Cloud sync engine
 *
 * Keeps this device's IndexedDB (Dexie) and the signed-in account in step.
 * Storage-agnostic: talks to the cloud through an adapter (Firestore in the
 * app, an in-memory fake in tests):
 *
 *   adapter.push(uid, { tasks: [], series: [] })         → Promise
 *   adapter.fetchAll(uid)                                 → Promise<{ tasks, series }>
 *   adapter.subscribe(uid, { task: sinceMs, series: sinceMs }, onDocs, onError) → unsubscribe()
 *        onDocs(kind: 'task' | 'series', docs[], latestSyncedAtMs)
 *
 * Behaviour (see sync-decisions.md):
 *   • signed out → local-only; nothing is queued
 *   • first sign-in on a device with tasks → ask: upload or discard; and for
 *     tasks already in the account: replace / keep newest / keep the account's
 *   • normal sync → latest edit wins (updatedAt)
 *   • sign out → device is cleared (after trying to upload pending changes)
 */

import {
  db, getSetting, setSetting, setSyncActive, isLive,
  getQueuedChanges, removeQueued, queuedCount, queueChange,
  pruneGenerated, clearLocalData,
} from '../db/schema.js';
import { occurrenceId } from '../utils/recurrence.js';

export const TASK_FIELDS = ['id', 'date', 'title', 'notes', 'done', 'order', 'reminderAt', 'remindedAt',
  'priority', 'tags', 'createdAt', 'updatedAt', 'deleted', 'seriesId', 'slot'];
export const SERIES_FIELDS = ['id', 'title', 'notes', 'rule', 'createdAt', 'updatedAt', 'deleted'];

const RETRY_MS = 30_000;
// Server time of the newest change pulled, per collection
const PULLED = { task: 'lastPulledAt:task', series: 'lastPulledAt:series' };
async function resetPulled() {
  await setSetting(PULLED.task, null);
  await setSetting(PULLED.series, null);
}

/** Strip local-only fields (syncStatus, generated…) and undefined values before upload. */
export function toRemote(record, fields) {
  const out = {};
  for (const k of fields) {
    const v = record[k];
    if (v !== undefined) out[k] = v;
  }
  if ('title' in out) out.title = String(out.title ?? '').slice(0, 255);
  if ('notes' in out) out.notes = String(out.notes ?? '').slice(0, 5000);
  if (!('deleted' in out)) out.deleted = false;
  return out;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function createSyncEngine({ adapter, onStatus = () => {}, onRemoteChange = () => {}, askFirstSync, confirm }) {
  let uid = null;
  let unsubscribe = null;
  let retryTimer = null;
  let draining = null;
  let status = { status: 'off', pending: 0, lastSyncedAt: null, error: null };

  const setStatus = (p) => { status = { ...status, ...p }; onStatus(status); };
  const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

  async function refreshPending() {
    setStatus({ pending: await queuedCount() });
  }

  // ── Start / stop ────────────────────────────────────────────────────────

  /** Called when a user signs in (or the app opens already signed in). */
  async function start(newUid) {
    if (uid === newUid) return;
    stopListening();
    const linked = await getSetting('syncUid');

    if (linked && linked !== newUid) {
      // Another account's data is on this device — it belongs to that account's cloud.
      await clearLocalData();
      await setSetting('syncUid', null);
      await resetPulled();
    }

    if (linked !== newUid) {
      const ok = await firstSync(newUid);
      if (!ok) { setStatus({ status: 'off' }); return false; }
    }

    uid = newUid;
    setSyncActive(true);
    setStatus({ status: 'idle', error: null });
    await drain();
    listen();
    return true;
  }

  /** Stop syncing without touching local data (e.g. the session expired). */
  function stop() {
    stopListening();
    clearTimeout(retryTimer);
    uid = null;
    setSyncActive(false);
    setStatus({ status: 'off', error: null });
  }

  /**
   * Sign-out: try to upload pending changes, then clear the device.
   * Returns false if the user chose to stay signed in.
   */
  async function signOut() {
    if (uid) {
      try { await withTimeout(drain(), 10_000); } catch { /* reported below */ }
      const left = await queuedCount();
      if (left > 0 && confirm) {
        const ok = await confirm({
          title:   'Some changes haven\'t synced',
          message: `${left} change${left === 1 ? '' : 's'} on this device ${left === 1 ? 'hasn\'t' : 'haven\'t'} reached your account yet (you may be offline). Signing out now will lose ${left === 1 ? 'it' : 'them'}.`,
          confirmLabel: 'Sign out anyway',
        });
        if (!ok) return false;
      }
    }
    stop();
    await clearLocalData();
    await setSetting('syncUid', null);
    await resetPulled();
    onRemoteChange();
    return true;
  }

  // ── First sign-in on this device ──────────────────────────────────────────

  async function firstSync(newUid) {
    const localTasks  = (await db.tasks.toArray()).filter(t => isLive(t) && !t.generated);
    const localSeries = (await db.series.toArray()).filter(isLive);
    const localCount  = localTasks.length + localSeries.length;

    // Drop leftovers (tombstones, generated copies) — the account is the source now.
    const keepTask   = new Set(localTasks.map(t => t.id));
    const keepSeries = new Set(localSeries.map(s => s.id));
    await db.tasks.filter(t => !keepTask.has(t.id)).delete();
    await db.series.filter(s => !keepSeries.has(s.id)).delete();
    await db.syncQueue.clear();

    let toUpload = { tasks: [], series: [] };

    if (localCount > 0) {
      setStatus({ status: 'syncing' });
      const remote = await adapter.fetchAll(newUid);
      const { matches, fresh } = matchDuplicates(localTasks, localSeries, remote);

      const choice = askFirstSync
        ? await askFirstSync({ localCount, duplicateCount: matches.length })
        : { upload: true, duplicates: 'newest' };
      if (!choice) return false;                       // cancelled → stay unlinked

      if (choice.upload) {
        toUpload = { tasks: [...fresh.tasks], series: [...fresh.series] };
        for (const m of matches) {
          const keepLocal = choice.duplicates === 'replace'
            || (choice.duplicates === 'newest' && (m.local.updatedAt ?? 0) > (m.remote.updatedAt ?? 0));
          if (keepLocal) toUpload[m.kind === 'task' ? 'tasks' : 'series'].push({ ...m.local, id: m.remote.id });
        }
      }
      // Local copies are replaced by whatever the account has (pulled below).
      await db.tasks.clear();
      await db.series.clear();
    }

    await setSetting('syncUid', newUid);
    await resetPulled();
    setSyncActive(true);

    // Put the uploads back locally as pending, and queue them
    for (const s of toUpload.series) {
      await db.series.put({ ...s, syncStatus: 'pending-upsert' });
      await queueChange('series', s.id);
    }
    for (const t of toUpload.tasks) {
      await db.tasks.put({ ...t, generated: false, syncStatus: 'pending-upsert' });
      await queueChange('task', t.id);
    }
    return true;
  }

  /**
   * Pair local records with ones already in the account:
   * same id, or (one-time tasks) same date + title, or (series) same title + repeat type.
   */
  function matchDuplicates(localTasks, localSeries, remote) {
    const matches = [];
    const fresh = { tasks: [], series: [] };
    const rTasks  = (remote.tasks  ?? []).filter(isLive);
    const rSeries = (remote.series ?? []).filter(isLive);
    const byId    = new Map(rTasks.map(t => [t.id, t]));
    const byKey   = new Map(rTasks.filter(t => !t.seriesId).map(t => [`${t.date}|${norm(t.title)}`, t]));
    const sById   = new Map(rSeries.map(s => [s.id, s]));
    const sByKey  = new Map(rSeries.map(s => [`${norm(s.title)}|${s.rule?.freq}`, s]));

    // Series first, so copies of a matched series can be re-pointed at the account's series
    const seriesMap = new Map();
    for (const s of localSeries) {
      const r = sById.get(s.id) ?? sByKey.get(`${norm(s.title)}|${s.rule?.freq}`);
      if (r) { matches.push({ kind: 'series', local: s, remote: r }); seriesMap.set(s.id, r.id); }
      else fresh.series.push(s);
    }
    for (const orig of localTasks) {
      const mapped = orig.seriesId && seriesMap.has(orig.seriesId);
      const t = mapped
        ? { ...orig, seriesId: seriesMap.get(orig.seriesId), id: occurrenceId(seriesMap.get(orig.seriesId), orig.date, orig.slot ?? 0) }
        : orig;
      const r = byId.get(t.id) ?? (!t.seriesId ? byKey.get(`${t.date}|${norm(t.title)}`) : undefined);
      if (r) matches.push({ kind: 'task', local: t, remote: r });
      else fresh.tasks.push(t);
    }
    return { matches, fresh };
  }

  // ── Upload ──────────────────────────────────────────────────────────────

  /** Upload queued changes. Safe to call often; concurrent calls share one run. */
  function drain() {
    if (!draining) draining = doDrain().finally(() => { draining = null; });
    return draining;
  }

  async function doDrain() {
    if (!uid) return;
    if (!online()) { setStatus({ status: 'offline' }); await refreshPending(); return; }
    clearTimeout(retryTimer);
    setStatus({ status: 'syncing' });
    try {
      for (;;) {
        const queued = await getQueuedChanges(400);
        if (!queued.length) break;
        const taskIds   = [...new Set(queued.filter(q => q.kind === 'task').map(q => q.recordId))];
        const seriesIds = [...new Set(queued.filter(q => q.kind === 'series').map(q => q.recordId))];
        const tasks  = (await db.tasks.bulkGet(taskIds)).filter(Boolean).filter(t => !t.generated);
        const series = (await db.series.bulkGet(seriesIds)).filter(Boolean);

        await adapter.push(uid, {
          tasks:  tasks.map(t => toRemote(t, TASK_FIELDS)),
          series: series.map(s => toRemote(s, SERIES_FIELDS)),
        });

        await removeQueued(queued.map(q => q.id));
        // Mark as synced unless they changed again while uploading
        for (const t of tasks) {
          const cur = await db.tasks.get(t.id);
          if (cur && cur.updatedAt === t.updatedAt) await db.tasks.update(t.id, { syncStatus: 'synced' });
        }
        for (const s of series) {
          const cur = await db.series.get(s.id);
          if (cur && cur.updatedAt === s.updatedAt) await db.series.update(s.id, { syncStatus: 'synced' });
        }
      }
      setStatus({ status: 'idle', error: null, lastSyncedAt: Date.now() });
    } catch (err) {
      console.error('[Sync] upload failed', err);
      setStatus({ status: online() ? 'error' : 'offline', error: err?.message ?? String(err) });
      retryTimer = setTimeout(() => drain(), RETRY_MS);
    }
    await refreshPending();
  }

  // ── Download ────────────────────────────────────────────────────────────

  function listen() {
    stopListening();
    if (!uid) return;
    const myUid = uid;
    Promise.all([getSetting(PULLED.task), getSetting(PULLED.series)]).then(([t, sr]) => {
      if (uid !== myUid) return;
      unsubscribe = adapter.subscribe(myUid, { task: t ?? 0, series: sr ?? 0 },
        (kind, docs, latest) => applyRemote(kind, docs, latest),
        (err) => setStatus({ status: 'error', error: err?.message ?? String(err) }));
    });
  }

  function stopListening() {
    unsubscribe?.();
    unsubscribe = null;
  }

  /** Merge docs from the account into the device. Latest edit wins. */
  async function applyRemote(kind, docs, latest) {
    let changed = false;
    const table = kind === 'series' ? db.series : db.tasks;
    for (const raw of docs) {
      // eslint-disable-next-line no-unused-vars
      const { syncedAt, ...doc } = raw;
      const local = await table.get(doc.id);
      const localPending = local && local.syncStatus !== 'synced';
      if (local && localPending && (local.updatedAt ?? 0) > (doc.updatedAt ?? 0)) continue;  // ours is newer
      if (local && (local.updatedAt ?? 0) === (doc.updatedAt ?? 0)
          && !local.generated && Boolean(local.deleted) === Boolean(doc.deleted)) {
        // Same version we already have (often our own upload coming back)
        if (localPending) await table.update(doc.id, { syncStatus: 'synced' });
        continue;
      }
      await table.put({ ...doc, ...(kind === 'task' ? { generated: false } : {}), syncStatus: 'synced' });
      if (kind === 'series') await pruneGenerated(doc.id);   // regenerate copies from the new rule
      changed = true;
    }
    if (latest) {
      const prev = (await getSetting(PULLED[kind])) ?? 0;
      if (latest > prev) await setSetting(PULLED[kind], latest);
    }
    setStatus({ lastSyncedAt: Date.now() });
    if (changed) onRemoteChange();
  }

  /** "Sync now": upload, then re-read everything changed since the last pull. */
  async function syncNow() {
    if (!uid) return;
    await drain();
    listen();
  }

  return {
    start, stop, signOut, drain, syncNow, applyRemote,
    get uid() { return uid; },
    get status() { return status; },
  };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
