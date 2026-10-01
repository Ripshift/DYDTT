/**
 * DYDTT Phase 1 — Observable Store
 */

import {
  getLiveTasksForDate, getTask, upsertTask, deleteTask, hardDeleteTask,
  getWeeklySummary, getSetting, setSetting, clearDay, wipeAll,
} from './db/schema.js';
import { createFromForm, editOneTime, editOccurrence, removeTask } from './tasks/taskService.js';
import { getWeekGridDates, todayStr, addDays } from './utils/dateHelpers.js';
import { applyMotionPref }            from './utils/motionPrefs.js';

const initialState = {
  currentDate:   todayStr(),
  tasks:         [],
  weeklySummary: {},
  user:          null,          // Firebase user object or null
  settings: {
    reducedMotion:      false,
    pushEnabled:        false,
    defaultReminderMin: 30,
    userName:           '',
    theme:              'dark',
    activeView:         'day',
  },
  ui: {
    modalOpen:      false,
    modalTab:       'edit',
    selectedTaskId: null,
    syncPending:    false,
  },
  // Cloud sync status (see src/sync/)
  sync: {
    status:       'off',     // off | idle | syncing | offline | error
    pending:      0,         // changes waiting to upload
    lastSyncedAt: null,
    error:        null,
  },
};

function createStore(initial) {
  let state = structuredClone(initial);
  const subs = new Map();

  function subscribe(key, fn) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(fn);
    fn(state[key]);
    return () => subs.get(key).delete(fn);
  }

  function notify(key) { subs.get(key)?.forEach(fn => fn(state[key])); }

  function patch(key, value) {
    state = { ...state, [key]: value };
    notify(key);
  }

  function patchUi(partial) {
    state = { ...state, ui: { ...state.ui, ...partial } };
    notify('ui');
  }

  async function dispatch(action, payload = {}) {
    switch (action) {

      // ── Auth ────────────────────────────────────────────────────────────
      case 'AUTH_SET':
        patch('user', payload.user ?? null);
        break;

      // ── Navigation ──────────────────────────────────────────────────────
      case 'NAV_NEXT_DAY':
        await dispatch('NAV_TO_DATE', { date: addDays(state.currentDate, 1) });
        break;
      case 'NAV_PREV_DAY':
        await dispatch('NAV_TO_DATE', { date: addDays(state.currentDate, -1) });
        break;
      case 'NAV_TO_DATE': {
        patch('currentDate', payload.date);
        patch('tasks', await getLiveTasksForDate(payload.date));
        patchUi({ selectedTaskId: null });
        await dispatch('REFRESH_WEEKLY_SUMMARY');
        break;
      }

      // Reload the visible day + summary (e.g. after a sync brought changes)
      case 'REFRESH': {
        patch('tasks', await getLiveTasksForDate(state.currentDate));
        if (state.ui.selectedTaskId && !state.tasks.some(t => t.id === state.ui.selectedTaskId)) {
          const sel = await getTask(state.ui.selectedTaskId);
          if (!sel || sel.deleted) patchUi({ selectedTaskId: null });
        }
        await dispatch('REFRESH_WEEKLY_SUMMARY');
        break;
      }

      // ── Task selection ───────────────────────────────────────────────────
      case 'TASK_SELECT': {
        const next = state.ui.selectedTaskId === payload.id ? null : payload.id;
        patchUi({ selectedTaskId: next });
        break;
      }
      case 'TASK_DESELECT':
        patchUi({ selectedTaskId: null });
        break;

      // ── Tasks ────────────────────────────────────────────────────────────
      case 'TASK_UPSERT': {
        await upsertTask(payload);
        await dispatch('REFRESH');
        break;
      }

      // Save the edit form. payload: { form, id?, scope? ('this' | 'future') }
      case 'TASK_SAVE': {
        const existing = payload.id ? await getTask(payload.id) : null;
        let result;
        if (!existing)              result = await createFromForm(payload.form);
        else if (existing.seriesId) result = await editOccurrence(existing, payload.form, payload.scope ?? 'this');
        else                        result = await editOneTime(existing, payload.form);
        patchUi({ selectedTaskId: null });
        await dispatch('REFRESH');
        return result;
      }

      // Delete with a scope for repeating tasks. payload: { id, scope ('this' | 'future' | 'all') }
      case 'TASK_REMOVE': {
        const task = await getTask(payload.id);
        if (task) await removeTask(task, payload.scope ?? 'this');
        patchUi({ selectedTaskId: null });
        await dispatch('REFRESH');
        break;
      }

      case 'DAY_CLEAR': {
        const n = await clearDay(payload.date ?? state.currentDate);
        patchUi({ selectedTaskId: null });
        await dispatch('REFRESH');
        return n;
      }

      case 'CALENDAR_WIPE': {
        await wipeAll();
        patchUi({ selectedTaskId: null });
        await dispatch('REFRESH');
        break;
      }

      case 'SYNC_STATUS':
        patch('sync', { ...state.sync, ...payload });
        break;
      case 'TASK_TOGGLE': {
        // Look in the DB too — the 48h view shows tasks outside currentDate
        const task = state.tasks.find(t => t.id === payload.id) ?? await getTask(payload.id);
        if (!task) break;
        await dispatch('TASK_UPSERT', { id: task.id, done: !task.done });
        break;
      }
      case 'TASK_DELETE': {
        await deleteTask(payload.id);
        if (state.ui.selectedTaskId === payload.id) patchUi({ selectedTaskId: null });
        await dispatch('REFRESH');
        break;
      }
      case 'TASK_HARD_DELETE':
        await hardDeleteTask(payload.id);
        break;

      // ── Weekly summary ───────────────────────────────────────────────────
      case 'REFRESH_WEEKLY_SUMMARY': {
        const dates   = getWeekGridDates(state.currentDate);
        const summary = await getWeeklySummary(dates);
        patch('weeklySummary', summary);
        break;
      }

      // ── Modal ────────────────────────────────────────────────────────────
      case 'MODAL_OPEN':
        patchUi({ modalOpen: true, modalTab: payload.tab ?? 'edit' });
        break;
      case 'MODAL_CLOSE':
        patchUi({ modalOpen: false });
        break;


      // ── Settings ─────────────────────────────────────────────────────────
      case 'SETTING_SET': {
        await setSetting(payload.key, payload.value);
        patch('settings', { ...state.settings, [payload.key]: payload.value });
        if (payload.key === 'reducedMotion') applyMotionPref(payload.value);
        break;
      }

      default:
        console.warn('[Store] Unknown action:', action);
    }
  }

  async function init() {
    const keys = Object.keys(initial.settings);
    const vals = await Promise.all(keys.map(k => getSetting(k)));
    const settings = { ...initial.settings };
    keys.forEach((k, i) => { if (vals[i] !== null) settings[k] = vals[i]; });
    patch('settings', settings);
    patch('tasks', await getLiveTasksForDate(state.currentDate));
    await dispatch('REFRESH_WEEKLY_SUMMARY');
  }

  return { get state() { return state; }, subscribe, dispatch, init };
}

export const store = createStore(initialState);
