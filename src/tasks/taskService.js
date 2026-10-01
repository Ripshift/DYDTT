/**
 * DYDTT — Task service
 * Create / edit / delete one-time and repeating tasks from the edit form.
 *
 * Form shape (from the Edit tab):
 *   {
 *     title, notes, date,
 *     private: boolean,                 // hidden from friends & family
 *     time:   'HH:MM' | '',            // single reminder time
 *     repeat: {
 *       freq:     'none' | 'daily' | 'several' | 'weekly' | 'interval' | 'monthly',
 *       times:    ['HH:MM', …],        // 'several' only
 *       weekdays: [0-6], interval, monthDay,
 *       ends:     'never' | 'date' | 'count', endDate, count,
 *     }
 *   }
 *
 * Scopes for editing / deleting an occurrence of a repeating task:
 *   'this'   — only that day's copy
 *   'future' — that day and everything after (the series is split)
 *   'all'    — the whole series, past included (delete only)
 */

import {
  upsertTask, deleteTask, getTask, getSeries, upsertSeries, deleteSeries,
  getSeriesTasks, pruneGenerated, ensureOccurrences, isLive,
} from '../db/schema.js';
import { addDays, buildReminderTs } from '../utils/dateHelpers.js';
import { normaliseRule, countBefore, occursOn, occurrenceId } from '../utils/recurrence.js';

// ── Form ⇄ rule ───────────────────────────────────────────────────────────

/** Turn the form's repeat section into a series rule (null = does not repeat). */
export function ruleFromForm(form) {
  const r = form.repeat ?? { freq: 'none' };
  if (!r.freq || r.freq === 'none') return null;
  const times = r.freq === 'several'
    ? (r.times ?? []).filter(Boolean)
    : (form.time ? [form.time] : []);
  return normaliseRule({
    freq:      r.freq === 'several' ? 'daily' : r.freq,
    interval:  r.interval,
    weekdays:  r.weekdays,
    monthDay:  r.monthDay,
    times,
    startDate: form.date,
    endDate:   r.ends === 'date'  ? (r.endDate || null) : null,
    count:     r.ends === 'count' ? (Number(r.count) || null) : null,
  });
}

/** Turn a series (+ the occurrence being edited) back into form values. */
export function formFromSeries(series, occurrence) {
  const rule = series.rule;
  const several = rule.times.length > 1;
  return {
    title: occurrence?.title ?? series.title,
    notes: occurrence?.notes ?? series.notes ?? '',
    private: Boolean(series.private),
    date:  occurrence?.date ?? rule.startDate,
    time:  several ? '' : (rule.times[0] ?? ''),
    repeat: {
      freq:     several && rule.freq === 'daily' ? 'several' : rule.freq,
      times:    [...rule.times],
      weekdays: [...rule.weekdays],
      interval: rule.interval,
      monthDay: rule.monthDay,
      ends:     rule.endDate ? 'date' : rule.count ? 'count' : 'never',
      endDate:  rule.endDate ?? '',
      count:    rule.count ?? '',
    },
  };
}

// ── Create ────────────────────────────────────────────────────────────────

/** Create a one-time task or a repeating task from the form. Returns { task } or { series }. */
export async function createFromForm(form) {
  const rule = ruleFromForm(form);
  if (!rule) {
    const task = await upsertTask({
      date: form.date, title: form.title, notes: form.notes ?? '', private: Boolean(form.private),
      reminderAt: buildReminderTs(form.date, form.time),
    });
    return { task };
  }
  const series = await upsertSeries({ title: form.title, notes: form.notes ?? '', private: Boolean(form.private), rule });
  return { series };
}

// ── Edit ──────────────────────────────────────────────────────────────────

/** Edit a one-time task. Choosing a repeat turns it into a repeating task. */
export async function editOneTime(task, form) {
  const rule = ruleFromForm(form);
  if (!rule) {
    return { task: await upsertTask({
      id: task.id, date: form.date, title: form.title, notes: form.notes ?? '',
      private: Boolean(form.private),
      reminderAt: buildReminderTs(form.date, form.time),
    }) };
  }
  const series = await upsertSeries({ title: form.title, notes: form.notes ?? '', private: Boolean(form.private), rule });
  await deleteTask(task.id);
  if (task.done) await carryDone(series, [{ date: form.date, slot: 0 }]);
  return { series };
}

/**
 * Edit one occurrence of a repeating task.
 * scope 'this'   → just that copy (repeat settings are ignored)
 * scope 'future' → split the series at this occurrence's date
 */
export async function editOccurrence(occurrence, form, scope) {
  if (scope === 'this') {
    const series = await getSeries(occurrence.seriesId);
    const time = form.repeat?.freq === 'several'
      ? (form.repeat.times?.[occurrence.slot] ?? null)
      : form.time;
    const reminderAt = time ? buildReminderTs(form.date, time) : null;
    const task = await upsertTask({
      id: occurrence.id, date: form.date, title: form.title, notes: form.notes ?? '',
      reminderAt, seriesId: series?.id ?? occurrence.seriesId,
    });
    return { task };
  }
  return splitSeries(occurrence, form);
}

/**
 * Apply the form to this occurrence and every later one.
 * Earlier days keep the old series untouched.
 */
async function splitSeries(occurrence, form) {
  const old = await getSeries(occurrence.seriesId);
  const from = occurrence.date;
  if (!old) return editOneTime(occurrence, form);

  const done = await retireFrom(old.id, from);       // [{date, slot}] that were done
  let rule = ruleFromForm(form);

  // Keep "ends after N times" counting from the original start
  if (rule?.count && old.rule.count && rule.count === old.rule.count && from > old.rule.startDate) {
    rule = { ...rule, count: Math.max(1, old.rule.count - countBefore(old.rule, from)) };
  }

  // End the old series the day before (or remove it if nothing is left)
  if (from <= old.rule.startDate) {
    await deleteSeries(old.id);
  } else {
    await upsertSeries({ id: old.id, rule: { ...old.rule, endDate: addDays(from, -1), count: null } });
    await pruneGenerated(old.id);
  }

  if (!rule) {
    const task = await upsertTask({
      date: form.date, title: form.title, notes: form.notes ?? '', private: Boolean(form.private),
      reminderAt: buildReminderTs(form.date, form.time),
      done: done.some(d => d.date === from),
    });
    return { task };
  }

  const series = await upsertSeries({ title: form.title, notes: form.notes ?? '', private: Boolean(form.private), rule });
  await carryDone(series, done);
  return { series };
}

/**
 * Remove a series' occurrences on/after a date: drop generated copies, tombstone
 * edited ones. Returns which (date, slot) pairs were done so they can be carried over.
 */
async function retireFrom(seriesId, fromDate) {
  const rows = (await getSeriesTasks(seriesId)).filter(t => t.date >= fromDate && isLive(t));
  const done = rows.filter(t => t.done).map(t => ({ date: t.date, slot: t.slot ?? 0 }));
  for (const t of rows.filter(t => !t.generated)) await deleteTask(t.id);
  await pruneGenerated(seriesId, fromDate);
  return done;
}

/** Mark the new series' occurrences done where the old ones were. */
async function carryDone(series, done) {
  for (const { date, slot } of done) {
    if (!occursOn(series.rule, date)) continue;
    await ensureOccurrences(date);
    const id = occurrenceId(series.id, date, slot);
    if (await getTask(id)) await upsertTask({ id, done: true });
  }
}

// ── Delete ────────────────────────────────────────────────────────────────

/**
 * Delete a task.
 * One-time tasks: scope is ignored.
 * Repeating: 'this' | 'future' | 'all'.
 */
export async function removeTask(task, scope = 'this') {
  if (!task.seriesId || scope === 'this') {
    await deleteTask(task.id);
    return;
  }
  const series = await getSeries(task.seriesId);
  if (!series) { await deleteTask(task.id); return; }

  if (scope === 'all' || task.date <= series.rule.startDate) {
    await retireFrom(series.id, '0000-00-00');
    await deleteSeries(series.id);
    return;
  }
  // 'future'
  await retireFrom(series.id, task.date);
  await upsertSeries({ id: series.id, rule: { ...series.rule, endDate: addDays(task.date, -1), count: null } });
  await pruneGenerated(series.id);
}
