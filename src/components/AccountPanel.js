/**
 * DYDTT — Account tab (signed in)
 *
 *   [photo]  Name                     [Edit]
 *            email
 *   Friends & Family   (circles — tap for "View X's Tasks" / "Remove X From List")
 *   Requests           (accept as Friend / Family, decline; your sent requests)
 *   Your code  Ab3dE9xQ  [Copy] [New code]
 *   Add by code [________] [Add]
 *   [Sign out]
 */

import { store }    from '../store.js';
import { avatarEl, makeAvatar, checkImageFile } from '../social/avatar.js';
import { CODE_LENGTH } from '../social/codes.js';
import * as social  from '../social/social.js';
import { choose }   from './Dialog.js';
import { showToast } from '../utils/toast.js';
import { announce, createFocusTrap } from '../utils/a11y.js';

const LEVEL_TEXT = {
  friend: { label: 'Friend', hint: 'Yesterday, today and tomorrow, and what\'s ticked off' },
  family: { label: 'Family', hint: 'All your tasks, and they can tick them off for you' },
};

/** Ask how much someone may see of MY tasks. */
export function askLevel(name, current) {
  return choose({
    title:   `What can ${name} see?`,
    message: 'Private tasks are never shared.',
    options: ['friend', 'family'].map(l => ({
      label: LEVEL_TEXT[l].label + (current === l ? ' ✓' : ''),
      value: l,
      hint:  LEVEL_TEXT[l].hint,
      variant: current === l ? 'primary' : 'secondary',
    })),
  });
}

export default class AccountPanel {
  #el;
  #popover = null;
  #unsubs = [];

  constructor({ onSignOut }) {
    this.#el = document.createElement('div');
    this.#el.className = 'account';
    this.#el.innerHTML = `
      <div class="account-card">
        <span class="account-card__avatar" id="acct-avatar"></span>
        <div class="account-card__info">
          <div class="account-card__name" id="acct-name"></div>
          <div class="account-card__email" id="acct-email"></div>
        </div>
        <button class="btn btn--secondary account-card__edit" id="acct-edit" type="button">Edit</button>
      </div>

      <section class="account-section" aria-labelledby="ff-heading">
        <h3 class="form-label" id="ff-heading">Friends &amp; Family</h3>
        <div class="ff-circles" id="ff-circles" role="list"></div>
        <p class="settings-hint" id="ff-empty">Share your code below, or add someone with theirs.</p>
      </section>

      <section class="account-section" id="ff-requests-section" hidden aria-labelledby="ff-req-heading">
        <h3 class="form-label" id="ff-req-heading">Requests</h3>
        <div class="ff-requests" id="ff-requests"></div>
      </section>

      <section class="account-section" aria-labelledby="ff-code-heading">
        <h3 class="form-label" id="ff-code-heading">Your code</h3>
        <div class="code-row">
          <code class="code-chip" id="acct-code" aria-live="polite">········</code>
          <button class="btn btn--secondary" id="acct-copy" type="button">Copy</button>
          <button class="btn btn--ghost" id="acct-newcode" type="button">New code</button>
        </div>
        <form class="code-row" id="acct-add-form" autocomplete="off">
          <label class="sr-only" for="acct-add-code">Their code</label>
          <input class="form-input code-input" id="acct-add-code" type="text" inputmode="text"
                 maxlength="${CODE_LENGTH + 2}" placeholder="Their 8-character code" spellcheck="false"
                 autocapitalize="off" autocorrect="off" />
          <button class="btn btn--primary" id="acct-add" type="submit">Add</button>
        </form>
        <p class="auth-error" id="acct-add-error" role="alert"></p>
      </section>

      <p class="settings-hint">Your tasks sync to this account. Signing out removes them from this device; they stay in your account.</p>
      <button class="btn btn--outline-danger btn--block" id="auth-signout-btn" type="button">Sign out</button>`;

    const $ = (s) => this.#el.querySelector(s);
    $('#acct-edit').addEventListener('click', () => this.#editProfile());
    $('#acct-copy').addEventListener('click', () => this.#copyCode());
    $('#acct-newcode').addEventListener('click', () => this.#newCode());
    $('#acct-add-form').addEventListener('submit', (e) => { e.preventDefault(); this.#addByCode(); });
    $('#auth-signout-btn').addEventListener('click', () => onSignOut());

    this.#unsubs.push(
      store.subscribe('social', () => this.render()),
      store.subscribe('user',   () => this.render()),
    );
  }

  get el() { return this.#el; }
  #q(s) { return this.#el.querySelector(s); }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const { user, social: s } = store.state;
    const profile = s.profile ?? { name: user?.displayName ?? '', photo: '' };

    this.#q('#acct-avatar').replaceChildren(avatarEl(profile, 56));
    this.#q('#acct-name').textContent  = profile.name || 'No name set';
    this.#q('#acct-email').textContent = user?.email ?? '';
    this.#q('#acct-code').textContent  = s.profile?.code ?? '········';
    this.#q('#acct-copy').disabled     = !s.profile?.code;
    this.#q('#acct-newcode').disabled  = !s.profile?.code;
    this.#q('#acct-edit').disabled     = !s.profile;

    // Circles
    const circles = this.#q('#ff-circles');
    circles.replaceChildren(...s.contacts.map(c => this.#circle(c)));
    this.#q('#ff-empty').hidden = s.contacts.length > 0;

    // Requests in + out
    const rows = [
      ...s.incoming.map(r => this.#incomingRow(r)),
      ...s.outgoing.map(r => this.#outgoingRow(r)),
    ];
    this.#q('#ff-requests').replaceChildren(...rows);
    this.#q('#ff-requests-section').hidden = rows.length === 0;
  }

  #circle(c) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ff-circle';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-label', `${c.name}, ${c.myLevel === 'family' ? 'family' : 'friend'}`);
    const name = document.createElement('span');
    name.className = 'ff-circle__name';
    name.textContent = c.name;
    const badge = document.createElement('span');
    badge.className = `ff-circle__badge ff-circle__badge--${c.myLevel}`;
    badge.textContent = c.myLevel === 'family' ? 'Family' : 'Friend';
    badge.setAttribute('aria-hidden', 'true');
    b.append(avatarEl(c, 52), name, badge);
    b.addEventListener('click', () => this.#openPopover(c, b));
    return b;
  }

  #incomingRow(r) {
    const row = document.createElement('div');
    row.className = 'ff-request';
    const text = document.createElement('div');
    text.className = 'ff-request__text';
    text.innerHTML = '<strong></strong><span>wants to connect</span>';
    text.querySelector('strong').textContent = r.name;
    const accept = button('Accept', 'btn btn--primary', async () => {
      const lvl = await askLevel(r.name);
      if (!lvl) return;
      await run(() => social.acceptRequest(r.uid, lvl), `You and ${r.name} are connected`);
    });
    const decline = button('Decline', 'btn btn--ghost', () =>
      run(() => social.declineRequest(r.uid), 'Request declined'));
    row.append(avatarEl(r, 36), text, accept, decline);
    return row;
  }

  #outgoingRow(r) {
    const row = document.createElement('div');
    row.className = 'ff-request ff-request--out';
    const text = document.createElement('div');
    text.className = 'ff-request__text';
    text.innerHTML = '<strong></strong><span></span>';
    text.querySelector('strong').textContent = r.name;
    text.querySelector('span').textContent = r.status === 'declined' ? 'didn\'t accept' : 'waiting to accept';
    const cancel = button(r.status === 'declined' ? 'OK' : 'Cancel', 'btn btn--ghost', () =>
      run(() => social.cancelRequest(r.uid), null));
    row.append(avatarEl(r, 36), text, cancel);
    return row;
  }

  // ── Circle menu ───────────────────────────────────────────────────────────

  #openPopover(c, anchor) {
    this.#closePopover();
    const pop = document.createElement('div');
    pop.className = 'ff-popover';
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', c.name);

    const view = menuItem(`View ${c.name}'s Tasks`, async () => {
      this.#closePopover();
      store.dispatch('MODAL_CLOSE');
      await social.openShared(c);
    });
    const level = menuItem(`They see: ${c.myLevel === 'family' ? 'Family' : 'Friend'} — change`, async () => {
      this.#closePopover();
      const lvl = await askLevel(c.name, c.myLevel);
      if (lvl && lvl !== c.myLevel) await run(() => social.setContactLevel(c.uid, lvl), `${c.name} now sees: ${LEVEL_TEXT[lvl].label}`);
    }, 'ff-popover__item--muted');
    const remove = menuItem(`Remove ${c.name} From List`, async () => {
      this.#closePopover();
      const ok = await choose({
        title: `Remove ${c.name}?`,
        message: 'You\'ll stop seeing each other\'s tasks. You can reconnect later with a code.',
        danger: true,
        options: [{ label: 'Remove', value: true, variant: 'danger' }],
      });
      if (ok) await run(() => social.removeContact(c.uid), `${c.name} removed`);
    }, 'ff-popover__item--danger');

    pop.append(view, level, remove);
    this.#el.appendChild(pop);
    // Position under the circle, kept inside the panel
    const panel = this.#el.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    pop.style.top  = `${a.bottom - panel.top + 6}px`;
    pop.style.left = `${Math.max(0, Math.min(a.left - panel.left, panel.width - 260))}px`;

    const trap = createFocusTrap(pop, { onEscape: () => { this.#closePopover(); anchor.focus(); } });
    trap.activate();
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) this.#closePopover(); };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    this.#popover = { el: pop, trap, outside };
  }

  #closePopover() {
    if (!this.#popover) return;
    const { el, trap, outside } = this.#popover;
    document.removeEventListener('pointerdown', outside);
    trap.deactivate();
    el.remove();
    this.#popover = null;
  }

  // ── Code ──────────────────────────────────────────────────────────────────

  async #copyCode() {
    const code = store.state.social.profile?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast({ message: 'Code copied', timeout: 2000 });
    } catch {
      showToast({ message: `Your code: ${code}`, timeout: 5000 });
    }
  }

  async #newCode() {
    const ok = await choose({
      title: 'Make a new code?',
      message: 'Your old code will stop working. People you\'re already connected with stay connected.',
      options: [{ label: 'Make new code', value: true, variant: 'primary' }],
    });
    if (ok) await run(() => social.regenerateCode(), 'New code ready');
  }

  async #addByCode() {
    const input = this.#q('#acct-add-code');
    const err = this.#q('#acct-add-error');
    err.textContent = ''; err.style.display = 'none';
    let person;
    try {
      person = await social.findByCode(input.value);
    } catch (e) {
      err.textContent = e.message; err.style.display = 'block';
      return;
    }
    const lvl = await askLevel(person.name);
    if (!lvl) return;
    const sent = await run(() => social.sendRequest(person.uid, lvl), `Request sent to ${person.name}`);
    if (sent) input.value = '';
  }

  // ── Profile editor ────────────────────────────────────────────────────────

  #editProfile() {
    const profile = store.state.social.profile;
    if (!profile) return;
    let photo = profile.photo;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <form class="dialog profile-editor" role="dialog" aria-modal="true" aria-labelledby="pe-title">
        <h2 class="dialog__title" id="pe-title">Edit profile</h2>
        <div class="profile-editor__photo">
          <span id="pe-avatar"></span>
          <div class="profile-editor__photo-actions">
            <label class="btn btn--secondary" for="pe-file">Change photo</label>
            <input type="file" id="pe-file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" />
            <button class="btn btn--ghost" id="pe-remove" type="button">Remove photo</button>
          </div>
        </div>
        <p class="settings-hint">JPEG, PNG, WebP or GIF up to 10 MB. It's cropped to a square and saved at 256 × 256.</p>
        <div class="form-group">
          <label class="form-label" for="pe-name">Name</label>
          <input class="form-input" id="pe-name" maxlength="50" autocomplete="name" required />
        </div>
        <p class="auth-error" id="pe-error" role="alert"></p>
        <div class="modal-footer">
          <button class="btn btn--secondary" id="pe-cancel" type="button">Cancel</button>
          <button class="btn btn--primary" id="pe-save" type="submit">Save</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);
    const $ = (s) => overlay.querySelector(s);
    const err = (msg) => { $('#pe-error').textContent = msg ?? ''; $('#pe-error').style.display = msg ? 'block' : 'none'; };
    const showPhoto = () => $('#pe-avatar').replaceChildren(avatarEl({ name: $('#pe-name').value || profile.name, photo }, 72));
    $('#pe-name').value = profile.name;
    showPhoto();

    const trap = createFocusTrap($('form'), { onEscape: () => close() });
    const close = () => { trap.deactivate(); overlay.remove(); };
    trap.activate();
    $('#pe-name').focus();

    $('#pe-name').addEventListener('input', showPhoto);
    $('#pe-cancel').addEventListener('click', close);
    $('#pe-remove').addEventListener('click', () => { photo = ''; showPhoto(); });
    $('#pe-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const problem = checkImageFile(file);
      if (problem) { err(problem); return; }
      err('');
      try {
        photo = await makeAvatar(file);
        showPhoto();
      } catch (ex) {
        err(ex.message);
      }
    });
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#pe-save').disabled = true;
      try {
        await social.updateProfile({ name: $('#pe-name').value, photo });
        close();
        announce('Profile saved');
      } catch (ex) {
        err(ex.message);
        $('#pe-save').disabled = false;
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  destroy() { this.#unsubs.forEach(u => u()); this.#closePopover(); }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function menuItem(label, onClick, extra = '') {
  const b = button(label, `ff-popover__item ${extra}`.trim(), onClick);
  b.setAttribute('role', 'menuitem');
  return b;
}

/** Run an action, toast the result or the error. Returns true on success. */
async function run(fn, successMsg) {
  try {
    await fn();
    if (successMsg) showToast({ message: successMsg, variant: 'success', timeout: 3000 });
    return true;
  } catch (err) {
    console.error('[Account]', err);
    showToast({ message: err?.message?.startsWith('Missing or insufficient') ? 'Not allowed — please try again.' : (err?.message || 'Something went wrong.'),
      variant: 'error', timeout: 5000 });
    return false;
  }
}
