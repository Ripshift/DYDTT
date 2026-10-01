/**
 * DYDTT — Repeating task rules (pure functions, no DB)
 *
 * A series (repeating task) has a `rule`:
 *   {
 *     freq:      'daily' | 'weekly' | 'interval' | 'monthly',
 *     interval:  number,          // 'interval' only: every N days (≥ 1)
 *     weekdays:  number[],        // 'weekly' only: 0 = Sun … 6 = Sat
 *     monthDay:  number,          // 'monthly' only: 1–31 (short months use their last day)
 *     times:     string[],        // 'HH:MM' reminder times; 2+ = several times a day; [] = no time
 *     startDate: 'YYYY-MM-DD',
 *     endDate:   'YYYY-MM-DD' | null,   // last possible day (inclusive)
 *     count:     number | null,          // stop after this many days with occurrences
 *   }
 *
 * Each day the rule matches produces one occurrence per time ("slot").
 * Occurrences are ordinary task records with a deterministic id, so every
 * device generates the same ids and sync can merge them.
 */

import { addDays, buildReminderTs } from './dateHelpers.js';

export const FREQS = ['daily', 'weekly', 'interval', 'monthly'];
export const MAX_TIMES = 12;
const DAY_MS = 86_400_000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local-midnight Date for a YYYY-MM-DD string. */
function toDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

/** Whole days from a → b (DST-safe). */
export function daysBetween(a, b) {
  const da = toDate(a), db = toDate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

/** Fill in defaults and normalise a rule (e.g. from the edit form). */
export function normaliseRule(rule) {
  const start = rule.startDate;
  const d     = toDate(start);
  const times = [...new Set((rule.times ?? []).filter(t => /^\d{2}:\d{2}$/.test(t)))].sort().slice(0, MAX_TIMES);
  const freq = FREQS.includes(rule.freq) ? rule.freq : 'daily';
  // Only keep the settings that belong to this repeat type
  const out = {
    freq,
    interval:  freq === 'interval' ? Math.min(365, Math.max(1, Math.floor(Number(rule.interval) || 1))) : 1,
    weekdays:  freq === 'weekly'
      ? [...new Set((rule.weekdays ?? []).map(Number).filter(n => n >= 0 && n <= 6))].sort()
      : [],
    monthDay:  freq === 'monthly'
      ? Math.min(31, Math.max(1, Math.floor(Number(rule.monthDay) || d.getDate())))
      : d.getDate(),
    times,
    startDate: start,
    endDate:   rule.endDate || null,
    count:     rule.count ? Math.max(1, Math.floor(Number(rule.count))) : null,
  };
  if (out.freq === 'weekly' && out.weekdays.length === 0) out.weekdays = [d.getDay()];
  return out;
}

/** Does the rule's pattern match this date? (ignores start/end/count) */
function patternMatches(rule, dateStr) {
  const d = toDate(dateStr);
  switch (rule.freq) {
    case 'daily':    return true;
    case 'weekly':   return rule.weekdays.includes(d.getDay());
    case 'interval': return daysBetween(rule.startDate, dateStr) % rule.interval === 0;
    case 'monthly': {
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(rule.monthDay, lastDay);
    }
    default:         return false;
  }
}

/**
 * Number of matching days from startDate up to (but not including) dateStr.
 * Used for "ends after N times".
 */
export function countBefore(rule, dateStr) {
  let n = 0;
  for (let d = rule.startDate; d < dateStr; d = addDays(d, 1)) {
    if (patternMatches(rule, d)) n++;
  }
  return n;
}

/** Does the series have an occurrence on this date? */
export function occursOn(rule, dateStr) {
  if (!rule?.startDate || dateStr < rule.startDate) return false;
  if (rule.endDate && dateStr > rule.endDate) return false;
  if (!patternMatches(rule, dateStr)) return false;
  if (rule.count && countBefore(rule, dateStr) >= rule.count) return false;
  return true;
}

/** Days since 1970-01-01 for a YYYY-MM-DD date (timezone-free). Stored as `day` for sharing rules. */
export function epochDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Deterministic occurrence id — the same on every device. */
export function occurrenceId(seriesId, dateStr, slot) {
  return `${seriesId}_${dateStr}_${slot}`;
}

/**
 * Build the task records a series produces on a date ([] if none).
 * @param {object} series  { id, title, notes, rule, createdAt, updatedAt }
 */
export function occurrencesFor(series, dateStr) {
  if (series.deleted || !occursOn(series.rule, dateStr)) return [];
  const times = series.rule.times?.length ? series.rule.times : [null];
  return times.map((time, slot) => ({
    id:         occurrenceId(series.id, dateStr, slot),
    seriesId:   series.id,
    slot,
    date:       dateStr,
    title:      series.title,
    notes:      series.notes ?? '',
    private:    Boolean(series.private),
    done:       false,
    reminderAt: time ? buildReminderTs(dateStr, time) : null,
    // Keep a series' occurrences together, in time order
    order:      (series.createdAt ?? 0) + slot,
    createdAt:  series.updatedAt ?? 0,
    updatedAt:  series.updatedAt ?? 0,
  }));
}

/** Short human description, e.g. "Every Mon, Wed · 9:00 AM, 1:00 PM". */
export function describeRule(rule) {
  if (!rule) return '';
  let what;
  switch (rule.freq) {
    case 'daily':    what = 'Daily'; break;
    case 'weekly':   what = rule.weekdays.length === 7 ? 'Daily'
                        : `Every ${rule.weekdays.map(w => WEEKDAY_SHORT[w]).join(', ')}`; break;
    case 'interval': what = rule.interval === 1 ? 'Daily' : `Every ${rule.interval} days`; break;
    case 'monthly':  what = `Monthly on the ${ordinal(rule.monthDay)}`; break;
    default:         what = 'Repeats';
  }
  const times = (rule.times ?? []).map(formatHHMM);
  if (times.length > 1) what += ` · ${times.length}× a day`;
  if (rule.endDate)     what += ` · until ${shortDate(rule.endDate)}`;
  else if (rule.count)  what += ` · ${rule.count} times`;
  return what;
}

/** True if two rules produce the same pattern (ignores startDate/count bookkeeping). */
export function sameRule(a, b) {
  if (!a || !b) return a === b;
  const pick = r => JSON.stringify([r.freq, r.interval, r.weekdays, r.monthDay, r.times, r.endDate, r.count]);
  return pick(normaliseRule(a)) === pick(normaliseRule(b));
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatHHMM(t) {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

function shortDate(dateStr) {
  return toDate(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
