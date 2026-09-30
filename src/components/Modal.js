/**
 * DYDTT Phase 1 — Modal Component
 * Tab 3 label dynamically switches between "Login" and "Logout"
 * based on Firebase auth state in the store.
 */

import { createFocusTrap, announce }                    from '../utils/a11y.js';
import { store }                                         from '../store.js';
import { signInWithGoogle, signInWithEmail,
         signUpWithEmail, resetPassword,
         signOutUser }                                   from '../auth/authManager.js';
import { getTask }                                       from '../db/schema.js';
import { buildReminderTs }                               from '../utils/dateHelpers.js';
import { requestPermission, getPermissionState }         from '../push/client.js';

const TABS = ['edit', 'settings', 'auth'];

const VIEWS = [
  { key: 'day',     label: '1 Day',   desc: 'Single day, swipe to navigate' },
  { key: '48h',     label: '48 Hour', desc: 'Today and tomorrow stacked'    },
  { key: 'week3x3', label: '9 Day',   desc: '3×3 grid of the week'          },
];

export default class Modal {
  #overlay  = null;
  #panel    = null;
  #trap     = null;
  #isOpen   = false;
  #currentTab = null;
  #handlers = new Map();
  #unsubs   = [];

  constructor({ container }) {
    this.#render(container);
    this.#trap = createFocusTrap(this.#panel, { onEscape: () => this.close() });
    this.#unsubs.push(
      store.subscribe('ui',   (ui)   => { if (ui.modalOpen) this.#syncOpen(ui.modalTab); else this.#syncClose(); }),
      store.subscribe('user', (user) => this.#syncAuthTab(user)),
    );
  }

  // ── Render shell ─────────────────────────────────────────────────────────

  #render(container) {
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'modal-overlay';
    this.#overlay.setAttribute('role', 'dialog');
    this.#overlay.setAttribute('aria-modal', 'true');
    this.#overlay.setAttribute('aria-labelledby', 'modal-heading');
    this.#overlay.id = 'main-modal';
    this.#overlay.inert = true;   // closed: hidden from Tab + screen readers
    this.#overlay.addEventListener('click', (e) => { if (e.target === this.#overlay) this.close(); });

    this.#panel = document.createElement('div');
    this.#panel.className = 'modal-panel';

    const h = document.createElement('h2');
    h.id = 'modal-heading'; h.className = 'sr-only'; h.textContent = 'Menu';
    this.#panel.appendChild(h);

    // Tab bar
    const tabList = document.createElement('div');
    tabList.className = 'modal-tabs';
    tabList.setAttribute('role', 'tablist');

    TABS.forEach((id) => {
      const btn = document.createElement('button');
      btn.className = 'modal-tab';
      btn.id = `tab-btn-${id}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-controls', `tab-panel-${id}`);
      // Default labels — auth tab overridden by #syncAuthTab
      btn.textContent = id === 'auth' ? 'Login'
                      : id.charAt(0).toUpperCase() + id.slice(1);
      btn.addEventListener('click', () => store.dispatch('MODAL_OPEN', { tab: id }));
      tabList.appendChild(btn);
    });

    this.#panel.appendChild(tabList);
    this.#panel.appendChild(this.#buildEditPanel());
    this.#panel.appendChild(this.#buildSettingsPanel());
    this.#panel.appendChild(this.#buildAuthPanel());
    this.#overlay.appendChild(this.#panel);
    container.appendChild(this.#overlay);
  }

  // ── Edit panel ────────────────────────────────────────────────────────────

  #buildEditPanel() {
    const p = document.createElement('div');
    p.className = 'modal-tab-panel';
    p.id = 'tab-panel-edit';
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', 'tab-btn-edit');
    p.innerHTML = `
      <div class="modal-edit-context" id="modal-edit-context" aria-live="polite"></div>
      <div class="form-group">
        <label class="form-label" for="modal-task-title">Task title</label>
        <input class="form-input" id="modal-task-title" type="text"
               placeholder="What needs doing?" autocomplete="off" maxlength="255" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="modal-task-notes">Notes</label>
        <input class="form-input" id="modal-task-notes" type="text"
               placeholder="Optional notes..." autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label" for="modal-task-date">Date</label>
        <input class="form-input" id="modal-task-date" type="date" />
      </div>
      <div class="form-group">
        <label class="form-label" for="modal-task-reminder">Reminder time</label>
        <input class="form-input" id="modal-task-reminder" type="time" />
      </div>
      <div class="modal-footer">
        <button class="btn btn--ghost text-danger" id="modal-delete-btn"
                style="margin-right:auto;display:none">Delete task</button>
        <button class="btn btn--secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn--primary"   id="modal-save-btn">Save</button>
      </div>`;
    requestAnimationFrame(() => {
      p.querySelector('#modal-cancel-btn').addEventListener('click', () => this.close());
      p.querySelector('#modal-save-btn').addEventListener('click',   () => this.#saveTask());
      p.querySelector('#modal-delete-btn').addEventListener('click', () => this.#deleteTask());
    });
    return p;
  }

  // ── Settings panel ────────────────────────────────────────────────────────

  #buildSettingsPanel() {
    const p = document.createElement('div');
    p.className = 'modal-tab-panel';
    p.id = 'tab-panel-settings';
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', 'tab-btn-settings');

    // View picker
    const viewSection = document.createElement('div');
    viewSection.className = 'settings-section';
    const viewLabel = document.createElement('div');
    viewLabel.className = 'form-label';
    viewLabel.textContent = 'View';
    viewSection.appendChild(viewLabel);
    const viewPicker = document.createElement('div');
    viewPicker.className = 'view-picker';
    viewPicker.setAttribute('role', 'radiogroup');
    viewPicker.setAttribute('aria-label', 'Select view');

    const syncPicker = (activeKey) => {
      viewPicker.querySelectorAll('.view-picker__btn').forEach(btn => {
        const active = btn.dataset.view === activeKey;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', String(active));
      });
    };

    VIEWS.forEach(({ key, label, desc }) => {
      const btn = document.createElement('button');
      btn.className = 'view-picker__btn';
      btn.dataset.view = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('title', desc);
      btn.innerHTML = `<span class="view-picker__label">${label}</span>
                       <span class="view-picker__desc">${desc}</span>`;
      btn.addEventListener('click', () => {
        store.dispatch('SETTING_SET', { key: 'activeView', value: key });
        announce(`View changed to ${label}`);
      });
      viewPicker.appendChild(btn);
    });

    viewSection.appendChild(viewPicker);
    p.appendChild(viewSection);
    this.#unsubs.push(store.subscribe('settings', (s) => syncPicker(s.activeView ?? 'day')));

    const divider = document.createElement('hr');
    divider.className = 'settings-divider';
    p.appendChild(divider);

    [
      { key: 'reducedMotion', label: 'Reduced motion'    },
      { key: 'pushEnabled',   label: 'Reminder notifications' },
    ].forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.className = 'toggle-row';
      const lbl = document.createElement('label');
      lbl.className = 'toggle-label'; lbl.htmlFor = `setting-${key}`; lbl.textContent = label;
      const sw  = document.createElement('label'); sw.className = 'toggle-switch';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.id = `setting-${key}`;
      inp.checked = store.state.settings[key] ?? false;
      inp.addEventListener('change', async () => {
        if (key === 'pushEnabled' && inp.checked) {
          // Ask for notification permission when the user turns reminders on
          const perm = await requestPermission();
          if (perm !== 'granted') {
            inp.checked = false;
            setReminderHint(perm);
            announce('Notifications are blocked for this site', 'assertive');
            return;
          }
        }
        await store.dispatch('SETTING_SET', { key, value: inp.checked });
        if (key === 'pushEnabled') setReminderHint(getPermissionState());
      });
      const track = document.createElement('span'); track.className = 'toggle-track';
      sw.append(inp, track); row.append(lbl, sw); p.appendChild(row);
      this.#unsubs.push(store.subscribe('settings', (s) => { inp.checked = s[key] ?? false; }));
    });

    // Explains what the reminder toggle does (and what to do if blocked)
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.id = 'reminder-hint';
    hint.setAttribute('aria-live', 'polite');
    p.querySelector('#setting-pushEnabled').setAttribute('aria-describedby', 'reminder-hint');
    p.appendChild(hint);
    const setReminderHint = (perm) => {
      hint.textContent = perm === 'denied'
        ? 'Notifications are blocked for DYDTT. Allow them in your browser\'s site settings, then turn this on again.'
        : 'Reminders always pop up inside DYDTT while it\'s open. Turn this on to also get system notifications.';
      hint.classList.toggle('settings-hint--warn', perm === 'denied');
    };
    setReminderHint(getPermissionState() === 'denied' ? 'denied' : 'default');

    return p;
  }

  // ── Auth panel (Login / Logout) ───────────────────────────────────────────

  #buildAuthPanel() {
    const p = document.createElement('div');
    p.className = 'modal-tab-panel';
    p.id = 'tab-panel-auth';
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', 'tab-btn-auth');

    // Logged-out section
    const loginSection = document.createElement('div');
    loginSection.id = 'auth-login-section';
    loginSection.innerHTML = `
      <button class="btn btn--google" id="auth-google-btn" style="width:100%;margin-bottom:var(--space-4)">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="flex-shrink:0">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.25-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
          <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
        </svg>
        Continue with Google
      </button>

      <div class="auth-divider"><span>or</span></div>

      <div id="auth-form-mode-login">
        <div class="form-group">
          <label class="form-label" for="auth-email">Email</label>
          <input class="form-input" id="auth-email" type="email"
                 placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-password">Password</label>
          <input class="form-input" id="auth-password" type="password"
                 placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div class="auth-error" id="auth-error" role="alert" aria-live="assertive"></div>
        <div class="modal-footer" style="padding-top:var(--space-3)">
          <button class="btn btn--ghost" id="auth-forgot-btn" style="margin-right:auto;font-size:var(--text-xs)">
            Forgot password?
          </button>
          <button class="btn btn--secondary" id="auth-switch-btn">Sign up</button>
          <button class="btn btn--primary"   id="auth-submit-btn">Sign in</button>
        </div>
      </div>`;

    // Logged-in section
    const logoutSection = document.createElement('div');
    logoutSection.id = 'auth-logout-section';
    logoutSection.style.display = 'none';
    logoutSection.innerHTML = `
      <div class="auth-user-card" id="auth-user-card">
        <div class="auth-user-avatar" id="auth-user-avatar"></div>
        <div class="auth-user-info">
          <div class="auth-user-name"  id="auth-user-name"></div>
          <div class="auth-user-email" id="auth-user-email"></div>
        </div>
      </div>
      <button class="btn btn--danger" id="auth-signout-btn" style="width:100%;margin-top:var(--space-5)">
        Sign out
      </button>`;

    p.append(loginSection, logoutSection);

    // Wire up events after DOM is ready
    requestAnimationFrame(() => {
      let isSignUp = false;

      const setError = (msg) => {
        const el = p.querySelector('#auth-error');
        el.textContent = msg;
        el.style.display = msg ? 'block' : 'none';
      };

      const setLoading = (loading) => {
        p.querySelector('#auth-submit-btn').disabled   = loading;
        p.querySelector('#auth-google-btn').disabled   = loading;
        p.querySelector('#auth-submit-btn').textContent =
          loading ? 'Please wait…' : (isSignUp ? 'Create account' : 'Sign in');
      };

      // Google
      p.querySelector('#auth-google-btn').addEventListener('click', async () => {
        setLoading(true); setError('');
        const { error } = await signInWithGoogle();
        if (error) { setError(error); setLoading(false); }
        else        { this.close(); }
      });

      // Sign in / Sign up toggle
      p.querySelector('#auth-switch-btn').addEventListener('click', () => {
        isSignUp = !isSignUp;
        p.querySelector('#auth-switch-btn').textContent  = isSignUp ? 'Sign in' : 'Sign up';
        p.querySelector('#auth-submit-btn').textContent  = isSignUp ? 'Create account' : 'Sign in';
        p.querySelector('#auth-forgot-btn').style.display = isSignUp ? 'none' : 'inline-flex';
        p.querySelector('#auth-password').autocomplete   = isSignUp ? 'new-password' : 'current-password';
        setError('');
      });

      // Submit
      p.querySelector('#auth-submit-btn').addEventListener('click', async () => {
        const email    = p.querySelector('#auth-email').value.trim();
        const password = p.querySelector('#auth-password').value;
        if (!email || !password) { setError('Please enter your email and password.'); return; }
        setLoading(true); setError('');
        const fn = isSignUp ? signUpWithEmail : signInWithEmail;
        const { error } = await fn(email, password);
        if (error) { setError(error); setLoading(false); }
        else        { this.close(); }
      });

      // Forgot password
      p.querySelector('#auth-forgot-btn').addEventListener('click', async () => {
        const email = p.querySelector('#auth-email').value.trim();
        if (!email) { setError('Enter your email first.'); return; }
        const { error } = await resetPassword(email);
        setError(error ?? '');
        if (!error) announce('Password reset email sent');
      });

      // Sign out
      p.querySelector('#auth-signout-btn').addEventListener('click', async () => {
        await signOutUser();
        announce('Signed out');
        this.close();
      });
    });

    return p;
  }

  // ── Auth tab sync ─────────────────────────────────────────────────────────

  #syncAuthTab(user) {
    // Update tab label
    const tabBtn = this.#panel?.querySelector('#tab-btn-auth');
    if (tabBtn) tabBtn.textContent = user ? 'Logout' : 'Login';

    // Update panel content
    const loginSection  = this.#panel?.querySelector('#auth-login-section');
    const logoutSection = this.#panel?.querySelector('#auth-logout-section');
    if (!loginSection || !logoutSection) return;

    if (user) {
      loginSection.style.display  = 'none';
      logoutSection.style.display = 'block';

      const nameEl  = logoutSection.querySelector('#auth-user-name');
      const emailEl = logoutSection.querySelector('#auth-user-email');
      const avatarEl = logoutSection.querySelector('#auth-user-avatar');

      if (nameEl)  nameEl.textContent  = user.displayName ?? 'No name set';
      if (emailEl) emailEl.textContent = user.email ?? '';
      if (avatarEl) {
        avatarEl.replaceChildren();
        avatarEl.removeAttribute('style');
        // Build the avatar with DOM APIs — never interpolate user data into innerHTML
        if (user.photoURL && /^https:\/\//i.test(user.photoURL)) {
          const img = document.createElement('img');
          img.src    = user.photoURL;
          img.alt    = user.displayName ?? '';
          img.width  = 40;
          img.height = 40;
          img.referrerPolicy = 'no-referrer';
          img.style.cssText  = 'border-radius:50%;display:block';
          avatarEl.appendChild(img);
        } else {
          const initials = (user.displayName ?? user.email ?? '?').charAt(0).toUpperCase();
          avatarEl.textContent = initials;
          avatarEl.style.cssText = `
            width:40px;height:40px;border-radius:50%;background:var(--color-gold-400);
            color:#141414;display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:var(--text-base);`;
        }
      }
    } else {
      loginSection.style.display  = 'block';
      logoutSection.style.display = 'none';
    }
  }

  // ── Tab switching ─────────────────────────────────────────────────────────

  #syncTab(tabId) {
    this.#panel.querySelectorAll('.modal-tab').forEach((btn) => {
      const active = btn.id === `tab-btn-${tabId}`;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    this.#panel.querySelectorAll('.modal-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-panel-${tabId}`);
    });
  }

  #syncOpen(tab) {
    const tabChanged = tab !== this.#currentTab;
    this.#currentTab = tab;
    this.#syncTab(tab ?? 'edit');
    if (this.#isOpen && !tabChanged) return;   // other ui changes while open — ignore
    if (tab === 'edit' || !tab) this.#populateEditForm();   // fresh open or switched to Edit
    if (this.#isOpen) return;                  // tab switch only — trap already active
    this.#isOpen = true;
    this.#overlay.inert = false;
    this.#overlay.classList.add('open');
    this.#trap.activate();
  }

  async #populateEditForm() {
    const selectedId = store.state.ui.selectedTaskId;
    // Fall back to the DB — in the 48h view the task may be on tomorrow's date
    const task = selectedId
      ? (store.state.tasks.find(t => t.id === selectedId) ?? await getTask(selectedId) ?? null)
      : null;
    const titleEl    = this.#panel.querySelector('#modal-task-title');
    const notesEl    = this.#panel.querySelector('#modal-task-notes');
    const dateEl     = this.#panel.querySelector('#modal-task-date');
    const reminderEl = this.#panel.querySelector('#modal-task-reminder');
    const deleteBtn  = this.#panel.querySelector('#modal-delete-btn');
    const contextEl  = this.#panel.querySelector('#modal-edit-context');
    if (task) {
      titleEl.value    = task.title;
      notesEl.value    = task.notes ?? '';
      dateEl.value     = task.date;
      reminderEl.value = task.reminderAt
        ? new Date(task.reminderAt).toTimeString().slice(0, 5) : '';
      deleteBtn.style.display = 'inline-flex';
      contextEl.textContent   = `Editing: ${task.title}`;
      contextEl.className     = 'modal-edit-context modal-edit-context--editing';
    } else {
      titleEl.value = ''; notesEl.value = '';
      dateEl.value  = store.state.currentDate; reminderEl.value = '';
      deleteBtn.style.display = 'none';
      contextEl.textContent   = 'New task';
      contextEl.className     = 'modal-edit-context modal-edit-context--new';
    }
  }

  #syncClose() {
    this.#currentTab = null;
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#overlay.classList.remove('open');
    this.#overlay.inert = true;
    this.#trap.deactivate();
  }

  async #saveTask() {
    const title = this.#panel.querySelector('#modal-task-title').value.trim();
    if (!title) { this.#panel.querySelector('#modal-task-title').focus(); announce('Task title is required', 'assertive'); return; }
    const notes   = this.#panel.querySelector('#modal-task-notes').value.trim();
    const date    = this.#panel.querySelector('#modal-task-date').value || store.state.currentDate;
    const timeVal = this.#panel.querySelector('#modal-task-reminder').value;
    // Local date + local time (new Date('YYYY-MM-DD') is UTC and lands a day early in the Americas)
    const reminderAt = buildReminderTs(date, timeVal);
    const id = store.state.ui.selectedTaskId;
    // Only send the fields the form edits; upsertTask merges them into the existing task
    await store.dispatch('TASK_UPSERT', { ...(id ? { id } : {}), date, title, notes, reminderAt });
    await store.dispatch('TASK_DESELECT');
    this.close();
  }

  async #deleteTask() {
    const id = store.state.ui.selectedTaskId;
    if (!id) return;
    await store.dispatch('TASK_DELETE', { id });
    this.close();
  }

  open(tab)  { store.dispatch('MODAL_OPEN', { tab: tab ?? 'edit' }); }
  close()    { store.dispatch('MODAL_CLOSE'); this.#emit('close'); }
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }
  #emit(event)  { this.#handlers.get(event)?.forEach(fn => fn()); }
  destroy()     { this.#unsubs.forEach(u => u()); }
}
