/**
 * DYDTT Phase 1 — Modal Component
 * Tabs: Edit · Display · Account.
 * Account shows sign-in when signed out, the profile + sign-out when signed in
 * (and will host Friends & Family later).
 */

import { createFocusTrap, announce }                    from '../utils/a11y.js';
import { store }                                         from '../store.js';
import { isDesktopMode } from '../utils/desktopMode.js';
import { signInWithGoogle, signInWithEmail,
         signUpWithEmail, resetPassword,
         signOutUser }                                   from '../auth/authManager.js';
import EditPanel                                       from './EditPanel.js';
import { signOutAndClear }                              from '../sync/index.js';
import AccountPanel                                     from './AccountPanel.js';
import { isNative }                                     from '../platform.js';
import { setSignupName }                                from '../social/social.js';
import { requestPermission, getPermissionState }         from '../push/client.js';

const TABS = ['edit', 'settings', 'auth'];
const TAB_LABELS = { edit: 'Edit', settings: 'Display', auth: 'Account' };

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
  #edit     = null;
  #account  = null;
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
      btn.textContent = TAB_LABELS[id];
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
    this.#edit = new EditPanel({
      onClose: () => this.close(),
      onTab:   (tab) => store.dispatch('MODAL_OPEN', { tab }),
    });
    return this.#edit.el;
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

    // Desktop Mode: wide layouts, ‹ › arrows, no swiping between days
    {
      const row = document.createElement('div');
      row.className = 'toggle-row';
      const lbl = document.createElement('label');
      lbl.className = 'toggle-label'; lbl.htmlFor = 'setting-desktopMode'; lbl.textContent = 'Desktop Mode';
      const sw  = document.createElement('label'); sw.className = 'toggle-switch';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.id = 'setting-desktopMode';
      const track = document.createElement('span'); track.className = 'toggle-track';
      sw.append(inp, track); row.append(lbl, sw);
      const hint = document.createElement('p');
      hint.className = 'settings-hint';
      const sync = (st) => {
        inp.checked = isDesktopMode(st);
        hint.textContent = 'Wide layout for a computer screen. Use the ‹ › arrows to change day — swiping won\'t.'
          + (st.desktopMode == null ? ' (Automatic for this screen.)' : '');
      };
      inp.addEventListener('change', () => store.dispatch('SETTING_SET', { key: 'desktopMode', value: inp.checked }));
      sync(store.state.settings);
      this.#unsubs.push(store.subscribe('settings', sync));
      p.append(row, hint);
    }

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
      hint.textContent = isNative()
        ? (perm === 'denied'
            ? 'Notifications are blocked for DYDTT. Allow them in Android Settings → Apps → DYDTT → Notifications.'
            : 'Reminders arrive as phone notifications, even when DYDTT is closed.')
        : (perm === 'denied'
            ? 'Notifications are blocked for DYDTT. Allow them in your browser\'s site settings, then turn this on again.'
            : 'Reminders always pop up inside DYDTT while it\'s open. Turn this on to also get system notifications.');
      hint.classList.toggle('settings-hint--warn', perm === 'denied');
    };
    setReminderHint(getPermissionState() === 'denied' ? 'denied' : 'default');

    return p;
  }

  // ── Account panel (sign in / profile + sign out) ─────────────────────────

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
        <div class="form-group" id="auth-name-group" hidden>
          <label class="form-label" for="auth-name">Your name</label>
          <input class="form-input" id="auth-name" type="text" maxlength="50"
                 placeholder="How friends will see you" autocomplete="name" />
        </div>
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

    // Logged-in section: profile, Friends & Family, code, sign out
    this.#account = new AccountPanel({
      // Uploads pending changes first, then clears this device (tasks stay in the account)
      onSignOut: async () => {
        const done = await signOutAndClear(signOutUser);
        if (!done) return;
        announce('Signed out');
        this.close();
      },
    });
    const logoutSection = this.#account.el;
    logoutSection.id = 'auth-logout-section';
    logoutSection.style.display = 'none';

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
        p.querySelector('#auth-name-group').hidden        = !isSignUp;
        setError('');
      });

      // Submit
      p.querySelector('#auth-submit-btn').addEventListener('click', async () => {
        const email    = p.querySelector('#auth-email').value.trim();
        const password = p.querySelector('#auth-password').value;
        if (!email || !password) { setError('Please enter your email and password.'); return; }
        const name = p.querySelector('#auth-name').value.trim();
        if (isSignUp && !name) { setError('Please enter your name.'); return; }
        setLoading(true); setError('');
        if (isSignUp) setSignupName(name);       // used for the new profile
        const { error } = isSignUp
          ? await signUpWithEmail(email, password, name)
          : await signInWithEmail(email, password);
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

    });

    return p;
  }

  // ── Auth tab sync ─────────────────────────────────────────────────────────

  #syncAuthTab(user) {
    // Update panel content
    const loginSection  = this.#panel?.querySelector('#auth-login-section');
    const logoutSection = this.#panel?.querySelector('#auth-logout-section');
    if (!loginSection || !logoutSection) return;

    loginSection.style.display  = user ? 'none'  : 'block';
    logoutSection.style.display = user ? '' : 'none';     // '' keeps its CSS flex layout
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
    if (tab === 'edit' || !tab) this.#edit.populate();      // fresh open or switched to Edit
    if (this.#isOpen) return;                  // tab switch only — trap already active
    this.#isOpen = true;
    this.#overlay.inert = false;
    this.#overlay.classList.add('open');
    this.#trap.activate();
  }

  #syncClose() {
    this.#currentTab = null;
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#overlay.classList.remove('open');
    this.#overlay.inert = true;
    this.#trap.deactivate();
  }

  open(tab)  { store.dispatch('MODAL_OPEN', { tab: tab ?? 'edit' }); }
  close()    { store.dispatch('MODAL_CLOSE'); this.#emit('close'); }
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.#handlers.get(event).delete(fn);
  }
  #emit(event)  { this.#handlers.get(event)?.forEach(fn => fn()); }
  destroy()     { this.#unsubs.forEach(u => u()); this.#edit?.destroy(); this.#account?.destroy(); }
}
