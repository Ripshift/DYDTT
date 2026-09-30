/**
 * DYDTT Phase 1 — Date Helpers
 * All date logic. No external dependency — pure JS Date API.
 */

// ── Basic ─────────────────────────────────────────────────────────────────

/**
 * Return today's date as a YYYY-MM-DD string in local time.
 */
export function todayStr() {
  const d = new Date();
  return localDateStr(d);
}

/**
 * Convert a Date object to a YYYY-MM-DD string in local time.
 * @param {Date} date
 */
export function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a YYYY-MM-DD string into a plain object of display-ready parts.
 * Always interprets as local midnight to avoid timezone drift.
 * @param {string} dateStr  YYYY-MM-DD
 */
export function parseDisplayDate(dateStr) {
  const date   = new Date(dateStr + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const isToday    = date.getTime() === today.getTime();
  const isTomorrow = date.getTime() === today.getTime() + 86_400_000;
  const isYesterday= date.getTime() === today.getTime() - 86_400_000;

  return {
    dateStr,
    date,
    day:       date.getDate(),
    weekday:   date.toLocaleString('en', { weekday: 'long'       }),
    month:     date.toLocaleString('en', { month:   'long'       }),
    monthAbbr: date.toLocaleString('en', { month:   'short'      }),
    year:      date.getFullYear(),
    isToday,
    isTomorrow,
    isYesterday,
  };
}

/**
 * Return a human-friendly relative label for a date string.
 * @param {string} dateStr  YYYY-MM-DD
 */
export function relativeLabel(dateStr) {
  const { isToday, isTomorrow, isYesterday, weekday, monthAbbr, day } =
    parseDisplayDate(dateStr);
  if (isToday)     return 'Today';
  if (isTomorrow)  return 'Tomorrow';
  if (isYesterday) return 'Yesterday';
  return `${weekday}, ${monthAbbr} ${day}`;
}

/**
 * Format a Unix timestamp as a locale time string (e.g. 9:30 AM).
 * @param {number} ts  Unix ms
 */
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Navigation ────────────────────────────────────────────────────────────

/**
 * Add n days to a YYYY-MM-DD string. Returns new YYYY-MM-DD string.
 * @param {string} dateStr
 * @param {number} n  Positive = future, negative = past
 */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

// ── Week grid ─────────────────────────────────────────────────────────────

/**
 * Return 9 date strings centred on the given date (-4 to +4 days).
 * Used to populate the 3x3 grid in the 9 Day view (WeekGridView).
 * @param {string} centreDate  YYYY-MM-DD
 * @returns {string[]}  Array of 9 YYYY-MM-DD strings
 */
export function getWeekGridDates(centreDate) {
  return [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(n => addDays(centreDate, n));
}

// ── Reminder helpers ──────────────────────────────────────────────────────

/**
 * Build a reminder timestamp from a date string and a HH:MM time string.
 * Returns null if either is missing.
 * @param {string} dateStr  YYYY-MM-DD
 * @param {string} timeStr  HH:MM
 * @returns {number|null}
 */
export function buildReminderTs(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * Return true if a reminder timestamp is in the future.
 * @param {number|null} ts
 */
export function isUpcoming(ts) {
  return typeof ts === 'number' && ts > Date.now();
}

/**
 * Return human-friendly "in X minutes / hours" countdown.
 * @param {number} ts
 */
export function countdownLabel(ts) {
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(diff / 3_600_000);
  return `in ${hrs}h`;
}
