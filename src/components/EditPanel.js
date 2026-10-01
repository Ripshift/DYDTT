/**
 * DYDTT — Edit tab
 * Add / edit a task (one-time or repeating), delete or clear tasks, and sync.
 *
 * Nothing selected → three full-width buttons: New Task · Sync · Clear.
 *                    "New Task" opens the form.
 * Task selected    → the form opens straight away, filled in for editing,
 *                    with Sync · Delete task below.
 *
 * Repeats: does not repeat · daily · several times a day · weekly ·
 *          every N days · monthly — ending never / on a date / after N times.
 */

import { store }                        from '../store.js';
import { getTask, getSeries }           from '../db/schema.js';
import { formFromSeries, ruleFromForm } from '../tasks/taskService.js';
import { describeRule, sameRule }       from '../utils/recurrence.js';
import { parseDisplayDate }             from '../utils/dateHelpers.js';
import { announce }                     from '../utils/a11y.js';
import { showToast }                    from '../utils/toast.js';
import { choose }                       from './Dialog.js';
import { syncNow }                      from '../sync/index.js';
import './TimeField.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const REPEAT_OPTIONS = [
  ['none',     'Does not repeat'],
  ['daily',    'Daily'],
  ['several',  'Several times a day'],
  ['weekly',   'Weekly'],
  ['interval', 'Every N days'],
  ['monthly',  'Monthly'],
];

export default class EditPanel {
  #el;
  #onClose;
  #onTab;
  #task   = null;     // task being edited (null = new)
  #series = null;     // its series, if repeating
  #expanded = false;  // form visible?
  #unsubs = [];

  constructor({ onClose, onTab }) {
    this.#onClose = onClose;
    this.#onTab   = onTab;
    this.#el = this.#render();
    this.#unsubs.push(
      store.subscribe('sync', () => this.#renderSync()),
      store.subscribe('user', () => this.#renderSync()),
    );
  }

  get el() { return this.#el; }

  // ── Render ────────────────────────────────────────────────────────────────

  #render() {
    const p = document.createElement('div');
    p.className = 'modal-tab-panel';
    p.id = 'tab-panel-edit';
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', 'tab-btn-edit');
    p.innerHTML = `
      <button class="btn btn--primary btn--block" id="modal-new-btn" type="button"
              aria-expanded="false" aria-controls="modal-edit-form">+ New Task</button>

      <div class="edit-form" id="modal-edit-form" hidden>
      <div class="modal-edit-context" id="modal-edit-context" aria-live="polite"></div>
      <div class="form-group">
        <label class="form-label" for="modal-task-title">Task title</label>
        <input class="form-input" id="modal-task-title" type="text"
               placeholder="What needs doing?" autocomplete="off" maxlength="255" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="modal-task-notes">Notes</label>
        <input class="form-input" id="modal-task-notes" type="text"
               placeholder="Optional notes..." autocomplete="off" maxlength="5000" />
      </div>
      <label class="check-row" for="modal-task-private">
        <input type="checkbox" id="modal-task-private" />
        <span class="check-row__box" aria-hidden="true"></span>
        <span class="check-row__text">
          <span class="check-row__label">Private task</span>
          <span class="check-row__hint">Not shared with friends or family</span>
        </span>
      </label>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="modal-task-date">Date</label>
          <input class="form-input" id="modal-task-date" type="date" />
        </div>
        <div class="form-group" id="modal-time-single">
          <span class="form-label" id="modal-reminder-label">Reminder time</span>
          <time-field id="modal-task-reminder" aria-label="Reminder time"></time-field>
        </div>
      </div>

      <fieldset class="repeat" id="modal-repeat-section">
        <legend class="form-label">Repeat</legend>
        <select class="form-input" id="modal-repeat" aria-label="Repeat">
          ${REPEAT_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>

        <div class="repeat__opt" data-for="several" hidden>
          <span class="form-label" id="modal-times-label">Times</span>
          <div class="repeat__times" id="modal-times" role="group" aria-labelledby="modal-times-label"></div>
          <button type="button" class="btn btn--ghost repeat__add" id="modal-add-time">+ Add time</button>
        </div>

        <div class="repeat__opt" data-for="weekly" hidden>
          <span class="form-label" id="modal-weekdays-label">On</span>
          <div class="repeat__weekdays" id="modal-weekdays" role="group" aria-labelledby="modal-weekdays-label">
            ${WEEKDAYS.map((d, i) => `<button type="button" class="weekday" data-day="${i}"
                aria-pressed="false" aria-label="${WEEKDAY_NAMES[i]}">${d}</button>`).join('')}
          </div>
        </div>

        <div class="repeat__opt repeat__inline" data-for="interval" hidden>
          <label for="modal-interval">Every</label>
          <input class="form-input form-input--num" id="modal-interval" type="number" min="1" max="365" value="2" />
          <span>days</span>
        </div>

        <div class="repeat__opt repeat__inline" data-for="monthly" hidden>
          <label for="modal-monthday">On day</label>
          <input class="form-input form-input--num" id="modal-monthday" type="number" min="1" max="31" />
          <span>of each month</span>
        </div>

        <div class="repeat__opt repeat__inline" data-for="any" hidden>
          <label for="modal-ends">Ends</label>
          <select class="form-input form-input--auto" id="modal-ends">
            <option value="never">Never</option>
            <option value="date">On date</option>
            <option value="count">After</option>
          </select>
          <input class="form-input form-input--auto" id="modal-end-date" type="date" hidden aria-label="End date" />
          <input class="form-input form-input--num" id="modal-end-count" type="number" min="1" max="999" value="10" hidden aria-label="Number of times" />
          <span id="modal-end-count-label" hidden>times</span>
        </div>
        <p class="repeat__summary" id="modal-repeat-summary" aria-live="polite"></p>
      </fieldset>

      <div class="modal-footer">
        <button class="btn btn--secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn--primary"   id="modal-save-btn">Save</button>
      </div>
      </div>

      <div class="edit-actions">
        <button class="btn btn--secondary btn--block btn--split" id="modal-sync-btn" type="button">
          <span id="modal-sync-label">Sync</span>
          <span class="sync-status" id="modal-sync-status" aria-live="polite"></span>
        </button>
        <button class="btn btn--outline-danger btn--block" id="modal-delete-btn" type="button">Clear…</button>
      </div>`;

    const $ = (s) => p.querySelector(s);
    $('#modal-new-btn').addEventListener('click',    () => this.#openNew());
    $('#modal-cancel-btn').addEventListener('click', () => this.#cancel());
    $('#modal-save-btn').addEventListener('click',   () => this.save());
    $('#modal-delete-btn').addEventListener('click', () => this.deleteOrClear());
    $('#modal-sync-btn').addEventListener('click',   () => this.#sync());
    $('#modal-repeat').addEventListener('change',    () => this.#syncRepeatUi());
    $('#modal-ends').addEventListener('change',      () => this.#syncRepeatUi());
    $('#modal-add-time').addEventListener('click',   () => { this.#addTime(''); this.#syncRepeatUi(); });
    $('#modal-weekdays').addEventListener('click', (e) => {
      const b = e.target.closest('.weekday');
      if (!b) return;
      b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      this.#syncRepeatUi();
    });
    ['#modal-interval', '#modal-monthday', '#modal-end-date', '#modal-end-count', '#modal-task-reminder', '#modal-task-date']
      .forEach(s => $(s).addEventListener('input', () => this.#syncRepeatUi()));
    return p;
  }

  #q(sel) { return this.#el.querySelector(sel); }

  /** Show / hide the form (the New Task button shows when it's hidden). */
  #setExpanded(on) {
    this.#expanded = on;
    this.#q('#modal-edit-form').hidden = !on;
    this.#q('#modal-new-btn').hidden   = on;
    this.#q('#modal-new-btn').setAttribute('aria-expanded', String(on));
  }

  get expanded() { return this.#expanded; }

  #openNew() {
    this.#setExpanded(true);
    this.#q('#modal-task-title').focus();
  }

  /** Cancel: back to the three buttons for a new task; close when editing. */
  #cancel() {
    if (this.#task) { this.#onClose(); return; }
    this.#writeForm({ title: '', notes: '', date: store.state.currentDate, time: '', repeat: { freq: 'none' } });
    this.#setExpanded(false);
    this.#q('#modal-new-btn').focus();
  }

  #addTime(value) {
    const wrap = document.createElement('div');
    wrap.className = 'repeat__time';
    const input = document.createElement('time-field');
    input.setAttribute('aria-label', 'Time');
    input.value = value;
    input.addEventListener('input', () => this.#syncRepeatUi());
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn btn--ghost repeat__remove';
    rm.textContent = '×';
    rm.setAttribute('aria-label', 'Remove time');
    rm.addEventListener('click', () => { wrap.remove(); this.#syncRepeatUi(); });
    wrap.append(input, rm);
    this.#q('#modal-times').appendChild(wrap);
  }

  /** Show only the repeat options that apply, and update the summary line. */
  #syncRepeatUi() {
    const freq = this.#q('#modal-repeat').value;
    this.#el.querySelectorAll('.repeat__opt').forEach((o) => {
      const f = o.dataset.for;
      o.hidden = !(f === freq || (f === 'any' && freq !== 'none'));
    });
    this.#q('#modal-time-single').hidden = freq === 'several';
    if (freq === 'several' && this.#q('#modal-times').children.length < 2) {
      while (this.#q('#modal-times').children.length < 2) this.#addTime('');
    }
    const ends = this.#q('#modal-ends').value;
    this.#q('#modal-end-date').hidden        = ends !== 'date';
    this.#q('#modal-end-count').hidden       = ends !== 'count';
    this.#q('#modal-end-count-label').hidden = ends !== 'count';

    const form = this.readForm();
    const rule = form.date ? ruleFromForm(form) : null;
    this.#q('#modal-repeat-summary').textContent = rule ? describeRule(rule) : '';
  }

  // ── Form values ───────────────────────────────────────────────────────────

  readForm() {
    const v = (s) => this.#q(s).value;
    return {
      title: v('#modal-task-title').trim(),
      notes: v('#modal-task-notes').trim(),
      private: this.#q('#modal-task-private').checked,
      date:  v('#modal-task-date') || store.state.currentDate,
      time:  v('#modal-task-reminder'),
      repeat: {
        freq:     v('#modal-repeat'),
        times:    [...this.#el.querySelectorAll('#modal-times time-field')].map(i => i.value).filter(Boolean),
        weekdays: [...this.#el.querySelectorAll('.weekday[aria-pressed="true"]')].map(b => Number(b.dataset.day)),
        interval: Number(v('#modal-interval')) || 1,
        monthDay: Number(v('#modal-monthday')) || null,
        ends:     v('#modal-ends'),
        endDate:  v('#modal-end-date'),
        count:    Number(v('#modal-end-count')) || null,
      },
    };
  }

  #writeForm(form) {
    const set = (s, val) => { this.#q(s).value = val ?? ''; };
    set('#modal-task-title', form.title);
    set('#modal-task-notes', form.notes);
    this.#q('#modal-task-private').checked = Boolean(form.private);
    set('#modal-task-date', form.date);
    set('#modal-task-reminder', form.time);
    const r = form.repeat;
    set('#modal-repeat', r.freq);
    this.#q('#modal-times').replaceChildren();
    (r.times ?? []).forEach(t => this.#addTime(t));
    const day = new Date(form.date + 'T00:00:00');
    const weekdays = r.weekdays?.length ? r.weekdays : [day.getDay()];
    this.#el.querySelectorAll('.weekday').forEach(b =>
      b.setAttribute('aria-pressed', String(weekdays.includes(Number(b.dataset.day)))));
    set('#modal-interval', r.interval ?? 2);
    set('#modal-monthday', r.monthDay ?? day.getDate());
    set('#modal-ends', r.ends ?? 'never');
    set('#modal-end-date', r.endDate);
    set('#modal-end-count', r.count ?? 10);
    this.#syncRepeatUi();
  }

  /** Fill the form for the selected task (or a blank new task). */
  async populate() {
    const selectedId = store.state.ui.selectedTaskId;
    this.#task = selectedId
      ? (store.state.tasks.find(t => t.id === selectedId) ?? await getTask(selectedId) ?? null)
      : null;
    this.#series = this.#task?.seriesId ? (await getSeries(this.#task.seriesId)) ?? null : null;

    const ctx = this.#q('#modal-edit-context');
    const del = this.#q('#modal-delete-btn');

    if (this.#task && this.#series) {
      const form = formFromSeries(this.#series, this.#task);
      if (form.repeat.freq !== 'several') {
        form.time = this.#task.reminderAt ? new Date(this.#task.reminderAt).toTimeString().slice(0, 5) : form.time;
      }
      this.#writeForm(form);
      ctx.textContent = `Editing: ${this.#task.title} · ↻ ${describeRule(this.#series.rule)}`;
      ctx.className   = 'modal-edit-context modal-edit-context--editing';
      del.textContent = 'Delete task…';
      this.#setExpanded(true);
    } else if (this.#task) {
      this.#writeForm({
        title: this.#task.title, notes: this.#task.notes ?? '', date: this.#task.date,
        private: Boolean(this.#task.private),
        time: this.#task.reminderAt ? new Date(this.#task.reminderAt).toTimeString().slice(0, 5) : '',
        repeat: { freq: 'none' },
      });
      ctx.textContent = `Editing: ${this.#task.title}`;
      ctx.className   = 'modal-edit-context modal-edit-context--editing';
      del.textContent = 'Delete task…';
      this.#setExpanded(true);
    } else {
      this.#writeForm({ title: '', notes: '', date: store.state.currentDate, time: '', repeat: { freq: 'none' } });
      ctx.textContent = 'New task';
      ctx.className   = 'modal-edit-context modal-edit-context--new';
      del.textContent = 'Clear…';
      this.#setExpanded(false);
    }
    this.#renderSync();
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async save() {
    const form = this.readForm();
    if (!form.title) {
      this.#q('#modal-task-title').focus();
      announce('Task title is required', 'assertive');
      return false;
    }
    if (form.repeat.freq === 'several' && form.repeat.times.length < 1) {
      this.#q('#modal-add-time').focus();
      announce('Add at least one time', 'assertive');
      return false;
    }

    let scope;
    if (this.#task?.seriesId && this.#series) {
      const newRule  = ruleFromForm(form);
      // Changing the repeat pattern or privacy applies to the whole series from here on
      const ruleSame = newRule && sameRule({ ...this.#series.rule, startDate: form.date }, newRule)
        && Boolean(form.private) === Boolean(this.#series.private);
      const options  = ruleSame
        ? [{ label: 'Just this one', value: 'this', variant: 'primary' },
           { label: 'This and all future', value: 'future' }]
        : [{ label: 'This and all future', value: 'future', variant: 'primary' }];
      scope = await choose({
        title:   'Edit repeating task',
        message: ruleSame
          ? 'Apply your changes to just this day, or to this and all future repeats?'
          : 'Changing how it repeats applies to this and all future repeats. Earlier days stay as they were.',
        options,
      });
      if (!scope) return false;
    }

    await store.dispatch('TASK_SAVE', { form, id: this.#task?.id, scope });
    announce(this.#task ? 'Task saved' : 'Task added');
    this.#onClose();
    return true;
  }

  // ── Delete / Clear ────────────────────────────────────────────────────────

  async deleteOrClear() {
    if (this.#task) return this.#deleteSelected();
    return this.#clear();
  }

  async #deleteSelected() {
    const task = this.#task;
    let scope = 'this';
    if (task.seriesId) {
      scope = await choose({
        title:   'Delete repeating task',
        message: `“${task.title}” repeats. Which copies should be deleted?`,
        options: [
          { label: 'Just this one',        value: 'this' },
          { label: 'This and all future',  value: 'future' },
          { label: 'All of them (past and future)', value: 'all', variant: 'danger' },
        ],
      });
    } else {
      scope = await choose({
        title:   'Delete task?',
        message: `“${task.title}” will be deleted.`,
        options: [{ label: 'Delete', value: 'this', variant: 'danger' }],
      });
    }
    if (!scope) return false;
    await store.dispatch('TASK_REMOVE', { id: task.id, scope });
    announce('Task deleted');
    this.#onClose();
    return true;
  }

  async #clear() {
    const date   = this.#q('#modal-task-date').value || store.state.currentDate;
    const parsed = parseDisplayDate(date);
    const label  = `${parsed.weekday}, ${parsed.monthAbbr} ${parsed.day}`;
    const count  = date === store.state.currentDate
      ? store.state.tasks.length
      : (store.state.weeklySummary?.[date]?.total ?? null);

    const what = await choose({
      title:   'Clear tasks',
      message: 'No task is selected. What would you like to clear? (Tip: tap a task first to delete just that one.)',
      options: [
        { label: `Clear ${label}`, value: 'day',
          hint: count == null ? '' : `${count} task${count === 1 ? '' : 's'}` },
        { label: 'Wipe entire calendar', value: 'all', variant: 'danger' },
      ],
    });
    if (!what) return false;

    if (what === 'day') {
      const n = await store.dispatch('DAY_CLEAR', { date });
      showToast({ message: `Cleared ${n} task${n === 1 ? '' : 's'} from ${label}`, timeout: 4000 });
      this.#onClose();
      return true;
    }

    const signedIn = Boolean(store.state.user);
    const sure = await choose({
      title:   '⚠ Wipe the entire calendar?',
      message: 'This is a major deletion. Every task and every repeating task will be permanently deleted'
             + (signedIn ? ' — on this device AND in your account, on all your devices.' : ' from this device.')
             + ' This can\'t be undone.',
      danger:  true,
      options: [{ label: 'Yes, delete everything', value: 'wipe', variant: 'danger' }],
      cancelLabel: 'Keep my tasks',
    });
    if (sure !== 'wipe') return false;
    await store.dispatch('CALENDAR_WIPE');
    showToast({ message: 'Calendar wiped', timeout: 4000 });
    this.#onClose();
    return true;
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  #renderSync() {
    const btn = this.#q('#modal-sync-btn');
    const lbl = this.#q('#modal-sync-label');
    const txt = this.#q('#modal-sync-status');
    const { user, sync } = store.state;
    if (!user) {
      lbl.textContent = 'Sign in to sync';
      txt.textContent = 'Only on this device';
      btn.disabled = false;
      return;
    }
    lbl.textContent = 'Sync now';
    btn.disabled = sync.status === 'syncing';
    txt.textContent = syncLabel(sync);
  }

  async #sync() {
    if (!store.state.user) { this.#onTab('auth'); return; }
    await syncNow();
  }

  destroy() { this.#unsubs.forEach(u => u()); }
}

export function syncLabel(sync) {
  switch (sync.status) {
    case 'syncing': return 'Syncing…';
    case 'offline': return sync.pending ? `Offline · ${sync.pending} waiting` : 'Offline';
    case 'error':   return 'Sync problem — will retry';
    case 'off':     return 'Sync is off on this device';
    default:
      if (sync.pending) return `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting`;
      return sync.lastSyncedAt ? `Synced ${timeAgo(sync.lastSyncedAt)}` : 'Synced';
  }
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  const m = Math.round(s / 60);
  if (m < 60)   return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(ts).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
