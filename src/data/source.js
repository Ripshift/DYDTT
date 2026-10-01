/**
 * DYDTT — Where the visible calendar's tasks come from
 * Normally this device's own tasks; while viewing a friend's or family
 * member's calendar, their shared tasks (see src/social/sharedCalendar.js).
 */

import { getLiveTasksForDate, getWeeklySummary } from '../db/schema.js';

let shared = null;

export function setSharedSource(source) { shared = source; }
export function getSharedSource()       { return shared; }

/** Live tasks for a day, sorted. */
export async function dayTasks(date) {
  return shared ? shared.tasksForDate(date) : getLiveTasksForDate(date);
}

/** { [date]: { total, done } } */
export async function summary(dates) {
  if (!shared) return getWeeklySummary(dates);
  const out = {};
  for (const d of dates) {
    const t = shared.tasksForDate(d);
    out[d] = { total: t.length, done: t.filter(x => x.done).length };
  }
  return out;
}

/** Is this date visible? (Friends only share yesterday / today / tomorrow.) */
export function canShowDate(date) {
  return shared ? shared.inRange(date) : true;
}
