/**
 * DYDTT — A friend's or family member's calendar, read from their account
 *
 *   friend → yesterday, today, tomorrow (72 hours), read-only
 *   family → every day, and can tick tasks done / not done
 *
 * Private tasks never arrive (the security rules refuse them).
 *
 * adapter:
 *   subscribeShared(ownerUid, { level, fromDay, toDay }, onDocs(kind, docs), onError) → unsubscribe
 *   setTaskDone(ownerUid, task, done)   — update an existing task doc
 *   createTask(ownerUid, task)          — first tick of a repeat copy that only existed on their devices
 */

import { addDays, todayStr } from '../utils/dateHelpers.js';
import { occurrencesFor, epochDay } from '../utils/recurrence.js';

export const FRIEND_DAYS = 1;   // days either side of today

export class SharedCalendar {
  #tasks  = new Map();
  #series = new Map();
  #unsub  = null;

  constructor({ ownerUid, level, adapter, onChange = () => {}, onError = () => {}, today = todayStr }) {
    this.ownerUid = ownerUid;
    this.level    = level === 'family' ? 'family' : 'friend';
    this.adapter  = adapter;
    this.onChange = onChange;
    this.onError  = onError;
    this.today    = today;
    this.loaded   = false;
  }

  get canCheck() { return this.level === 'family'; }

  /** First and last visible date (null = unlimited). */
  range() {
    if (this.level === 'family') return { from: null, to: null };
    const t = this.today();
    return { from: addDays(t, -FRIEND_DAYS), to: addDays(t, FRIEND_DAYS) };
  }

  inRange(date) {
    const { from, to } = this.range();
    return (!from || date >= from) && (!to || date <= to);
  }

  start() {
    const { from, to } = this.range();
    this.#unsub = this.adapter.subscribeShared(this.ownerUid, {
      level:   this.level,
      fromDay: from ? epochDay(from) : null,
      toDay:   to   ? epochDay(to)   : null,
    }, (kind, docs) => this.apply(kind, docs), (err) => this.onError(err));
    return this;
  }

  stop() {
    this.#unsub?.();
    this.#unsub = null;
  }

  /** Merge docs from their account. */
  apply(kind, docs) {
    const map = kind === 'series' ? this.#series : this.#tasks;
    for (const d of docs) {
      if (d.__removed) map.delete(d.id);
      else map.set(d.id, d);
    }
    this.loaded = true;
    this.onChange();
  }

  /** Visible tasks for a day: their repeat copies + real task docs, minus deleted/private. */
  tasksForDate(date) {
    if (!this.inRange(date)) return [];
    const byId = new Map();
    for (const s of this.#series.values()) {
      if (s.deleted || s.private || !s.rule) continue;
      for (const occ of occurrencesFor(s, date)) byId.set(occ.id, { ...occ, generated: true });
    }
    for (const t of this.#tasks.values()) {
      if (t.date === date) byId.set(t.id, t);
    }
    return [...byId.values()]
      .filter(t => !t.deleted && !t.private)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  findTask(id) {
    if (this.#tasks.has(id)) return this.#tasks.get(id);
    const date = /_(\d{4}-\d{2}-\d{2})_\d+$/.exec(id)?.[1];
    return date ? this.tasksForDate(date).find(t => t.id === id) ?? null : null;
  }

  /** Family only: tick / untick one of their tasks. */
  async toggle(id) {
    if (!this.canCheck) return false;
    const task = this.findTask(id);
    if (!task) return false;
    const done = !task.done;
    const updatedAt = Date.now();
    // Show it straight away; their listener brings back the confirmed version
    // eslint-disable-next-line no-unused-vars
    const { generated, ...doc } = { ...task, done, updatedAt, day: epochDay(task.date) };
    this.#tasks.set(id, doc);
    this.onChange();
    try {
      if (task.generated) await this.adapter.createTask(this.ownerUid, doc);
      else                await this.adapter.setTaskDone(this.ownerUid, task, done);
      return true;
    } catch (err) {
      if (task.generated) this.#tasks.delete(id); else this.#tasks.set(id, task);   // undo
      this.onChange();
      this.onError(err);
      return false;
    }
  }
}
