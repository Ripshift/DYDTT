import { describe, it, expect, beforeEach, vi } from 'vitest';

// Keep Firebase out of unit tests
vi.mock('../src/auth/authManager.js', () => ({
  signInWithGoogle: vi.fn(), signInWithEmail: vi.fn(), signUpWithEmail: vi.fn(),
  resetPassword: vi.fn(), signOutUser: vi.fn(),
}));

import { db, openDb, getTask } from '../src/db/schema.js';
import { store }  from '../src/store.js';
import BurgerMenu from '../src/components/BurgerMenu.js';
import Modal      from '../src/components/Modal.js';

const tick = () => new Promise(r => setTimeout(r, 20));
let burger, modal, btn, overlay, $;

beforeEach(async () => {
  await openDb();
  await db.tasks.clear();
  await store.dispatch('MODAL_CLOSE');
  await store.dispatch('TASK_DESELECT');
  await store.dispatch('NAV_TO_DATE', { date: '2026-10-01' });

  const app = document.getElementById('app');
  const top = document.createElement('header');
  app.append(top);
  burger = new BurgerMenu({ container: top });
  modal  = new Modal({ container: app });
  // Same wiring as main.js
  burger.on('open',  () => modal.open());
  burger.on('close', () => modal.close());
  store.subscribe('ui', (ui) => burger.setExpanded(ui.modalOpen));
  await tick();                                   // Modal wires buttons in rAF

  btn     = top.querySelector('.burger-btn');
  overlay = app.querySelector('.modal-overlay');
  $       = (s) => app.querySelector(s);
});

const isOpen = () => overlay.classList.contains('open');

describe('burger + modal', () => {
  it('opens and closes from the burger without looping', () => {
    btn.click();
    expect(isOpen()).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(isOpen()).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('Cancel on a new task goes back to the buttons; Cancel while editing closes', async () => {
    btn.click();
    $('#modal-new-btn').click();
    expect($('#modal-edit-form').hidden).toBe(false);
    $('#modal-cancel-btn').click();
    expect(isOpen()).toBe(true);
    expect($('#modal-edit-form').hidden).toBe(true);
    expect(document.activeElement).toBe($('#modal-new-btn'));
    btn.click();

    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Walk dog' });
    await store.dispatch('TASK_SELECT', { id: store.state.tasks[0].id });
    btn.click();
    await tick();
    $('#modal-cancel-btn').click();
    expect(isOpen()).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('third tab is called Account', () => {
    expect($('#tab-btn-auth').textContent).toBe('Account');
  });

  it('Escape closes', () => {
    btn.click();
    $('.modal-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  it('burger follows a store-driven open (e.g. ?shortcut=add)', async () => {
    await store.dispatch('MODAL_OPEN', { tab: 'edit' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('edit flow', () => {
  it('editing keeps done/order and saves a local reminder', async () => {
    await store.dispatch('TASK_UPSERT', { date: '2026-10-01', title: 'Walk dog', done: true, order: 5 });
    const id = store.state.tasks[0].id;
    await store.dispatch('TASK_SELECT', { id });
    btn.click();
    await tick();
    expect($('#modal-task-title').value).toBe('Walk dog');

    $('#modal-task-title').value    = 'Walk dog (long)';
    $('#modal-task-reminder').value = '09:30';
    $('#modal-save-btn').click();
    await tick(); await tick();

    const t = await getTask(id);
    expect(t).toMatchObject({ title: 'Walk dog (long)', done: true, order: 5 });
    const r = new Date(t.reminderAt);
    expect([r.getDate(), r.getHours(), r.getMinutes()]).toEqual([1, 9, 30]);
    expect(isOpen()).toBe(false);
  });
});

describe('accessibility + safety', () => {
  it('closed modal is inert (not reachable by Tab / screen readers)', () => {
    expect(overlay.inert).toBe(true);
    btn.click();
    expect(overlay.inert).toBe(false);
    btn.click();
    expect(overlay.inert).toBe(true);
  });

  it('user name / photo are never parsed as HTML', async () => {
    await store.dispatch('AUTH_SET', { user: { uid: 'u', email: 'a@example.com' } });
    await store.dispatch('SOCIAL_SET', { profile: {
      uid: 'u', code: 'Ab3dE9xQ',
      name:  '<img src=x onerror="window.__pwned=1">',
      photo: 'https://example.com/a.png" onerror="window.__pwned=1',   // quote → rejected
    } });
    const avatar = $('#acct-avatar');
    expect(avatar.querySelector('img')).toBeNull();
    expect($('#acct-name').textContent).toBe('<img src=x onerror="window.__pwned=1">');
    expect(avatar.textContent).toBe('<');                      // first letter, as text

    await store.dispatch('SOCIAL_SET', { profile: { uid: 'u', code: 'x', name: 'Cap', photo: 'javascript:alert(1)' } });
    expect(avatar.querySelector('img')).toBeNull();          // non-https photo ignored
    expect(avatar.textContent).toBe('C');

    await store.dispatch('SOCIAL_SET', { profile: { uid: 'u', code: 'x', name: 'Cap', photo: 'https://lh3.googleusercontent.com/a/x=s96-c' } });
    expect(avatar.querySelector('img').getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/x=s96-c');
    await store.dispatch('SOCIAL_SET', { profile: null });
    await store.dispatch('AUTH_SET', { user: null });
  });
});
