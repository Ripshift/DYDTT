import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/auth/authManager.js', () => ({
  signInWithGoogle: vi.fn(), signInWithEmail: vi.fn(async () => ({ error: null })), signUpWithEmail: vi.fn(async () => ({ error: null })),
  resetPassword: vi.fn(), signOutUser: vi.fn(),
}));

import { db, openDb } from '../src/db/schema.js';
import { store } from '../src/store.js';
import * as social from '../src/social/social.js';
import Modal from '../src/components/Modal.js';
import SharedBar from '../src/components/SharedBar.js';
import TaskItem from '../src/components/TaskItem.js';
import { todayStr, addDays } from '../src/utils/dateHelpers.js';
import { normaliseRule } from '../src/utils/recurrence.js';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function pick(label) {
  for (let i = 0; i < 50; i++) {
    const b = [...document.querySelectorAll('.dialog button, .ff-popover button')].find(x => x.textContent.trim().startsWith(label));
    if (b) { b.click(); await tick(); return; }
    await tick(10);
  }
  throw new Error('no button ' + label + ' in: ' + [...document.querySelectorAll('.dialog button, .ff-popover button')].map(b => b.textContent).join('|'));
}

/** In-memory Friends & Family backend shared by several "users". */
function fakeBackend() {
  const profiles = new Map(), codes = new Map(), viewers = new Map(), requests = new Map(), outgoing = new Map();
  const tasks = new Map(), series = new Map();
  const listeners = new Map();
  const key = (...p) => p.join('/');
  const listFor = (map, uid) => [...map.entries()].filter(([k]) => k.startsWith(uid + '/')).map(([k, v]) => ({ uid: k.split('/')[1], ...v }));
  const emit = (uid) => {
    const l = listeners.get(uid); if (!l) return;
    l('contacts', listFor(viewers, uid)); l('incoming', listFor(requests, uid)); l('outgoing', listFor(outgoing, uid));
  };
  const emitAll = () => [...listeners.keys()].forEach(emit);
  const adapter = (me) => ({
    getProfile: async (uid) => profiles.get(uid) ?? null,
    saveProfile: async (uid, p) => { profiles.set(uid, { uid, ...p }); },
    claimCode: async (uid, code) => { if (codes.has(code)) return false; codes.set(code, uid); return true; },
    releaseCode: async (code) => { codes.delete(code); },
    lookupCode: async (code) => codes.get(code) ?? null,
    sendRequest: async (from, to, level) => { requests.set(key(to, from), { level }); outgoing.set(key(from, to), { level }); emitAll(); },
    cancelRequest: async (from, to) => { requests.delete(key(to, from)); outgoing.delete(key(from, to)); emitAll(); },
    clearOutgoing: async (from, to) => { outgoing.delete(key(from, to)); },
    requestStillOpen: async (from, to) => requests.has(key(to, from)),
    accept: async (meUid, from, myLevel, theirLevel) => {
      viewers.set(key(meUid, from), { level: myLevel }); viewers.set(key(from, meUid), { level: theirLevel });
      requests.delete(key(meUid, from)); emitAll();
    },
    decline: async (meUid, from) => { requests.delete(key(meUid, from)); emitAll(); },
    remove: async (meUid, other) => { viewers.delete(key(meUid, other)); viewers.delete(key(other, meUid)); emitAll(); },
    setLevel: async (meUid, other, level) => { viewers.set(key(meUid, other), { level }); },
    levelFrom: async (owner, viewer) => viewers.get(key(owner, viewer))?.level ?? null,
    listen: (uid, cb) => { listeners.set(uid, cb); emit(uid); return () => listeners.delete(uid); },
    subscribeShared: (owner, opts, onDocs) => {
      onDocs('series', [...series.values()].filter(s => s.owner === owner && !s.private));
      onDocs('task', [...tasks.values()].filter(t => t.owner === owner && !t.private));
      return () => {};
    },
    setTaskDone: vi.fn(async (owner, task, done) => { tasks.get(task.id).done = done; }),
    createTask: vi.fn(async (owner, t) => { tasks.set(t.id, { ...t, owner }); }),
    me,
  });
  return { adapter, profiles, codes, viewers, requests, tasks, series };
}

const TODAY = todayStr();
let backend, app, $;

async function signIn(uid, extra = {}) {
  await store.dispatch('AUTH_SET', { user: { uid, email: `${uid}@x.com`, displayName: uid[0].toUpperCase() + uid.slice(1), ...extra } });
  await tick(60);
}

beforeEach(async () => {
  await openDb();
  await Promise.all([db.tasks.clear(), db.series.clear()]);
  backend = fakeBackend();
  await store.dispatch('AUTH_SET', { user: null });
  await tick();
  await social.initSocial({ adapter: backend.adapter() });
  app = document.getElementById('app');
  const top = document.createElement('header');
  const burger = document.createElement('button');
  burger.className = 'burger-btn';
  top.append(burger);
  app.append(top);
  new SharedBar({ container: top, burgerEl: burger });
  new Modal({ container: app });
  await tick();
  $ = (s) => app.querySelector(s);
});

describe('profile + code', () => {
  it('first sign-in creates a profile from the Google name/photo and an 8-character code', async () => {
    await signIn('alice', { photoURL: 'https://lh3.googleusercontent.com/a/x=s96-c' });
    const p = store.state.social.profile;
    expect(p).toMatchObject({ uid: 'alice', name: 'Alice', photo: 'https://lh3.googleusercontent.com/a/x=s96-c' });
    expect(p.code).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(backend.codes.get(p.code)).toBe('alice');
    expect($('#acct-code').textContent).toBe(p.code);
    expect($('#acct-name').textContent).toBe('Alice');
    expect($('#acct-avatar img')).not.toBeNull();
  });

  it('email sign-up uses the typed name; profile is reused next time', async () => {
    social.setSignupName('Zoë');
    await signIn('zoe', { displayName: null });
    expect(store.state.social.profile.name).toBe('Zoë');
    const code = store.state.social.profile.code;
    await store.dispatch('AUTH_SET', { user: null }); await tick();
    expect(store.state.social.profile).toBeNull();
    await signIn('zoe');
    expect(store.state.social.profile).toMatchObject({ name: 'Zoë', code });
  });

  it('edit profile: name required, bad photos refused; new code releases the old one', async () => {
    await signIn('alice');
    await expect(social.updateProfile({ name: '  ', photo: '' })).rejects.toThrow(/name/);
    await expect(social.updateProfile({ name: 'A', photo: 'javascript:x' })).rejects.toThrow(/picture/);
    await social.updateProfile({ name: 'Ali', photo: 'data:image/jpeg;base64,AAAA' });
    expect(backend.profiles.get('alice')).toMatchObject({ name: 'Ali', photo: 'data:image/jpeg;base64,AAAA' });
    const old = store.state.social.profile.code;
    const fresh = await social.regenerateCode();
    expect(fresh).not.toBe(old);
    expect(backend.codes.has(old)).toBe(false);
    expect(backend.codes.get(fresh)).toBe('alice');
  });

  it('profile editor dialog saves the name', async () => {
    await signIn('alice');
    $('#acct-edit').click();
    const input = document.querySelector('#pe-name');
    expect(input.value).toBe('Alice');
    input.value = 'Alice B';
    document.querySelector('.profile-editor').dispatchEvent(new Event('submit', { cancelable: true }));
    await tick(60);
    expect(store.state.social.profile.name).toBe('Alice B');
    expect(document.querySelector('.profile-editor')).toBeNull();
  });
});

describe('connecting', () => {
  it('request → accept (each picks a level) → circles on both sides', async () => {
    // Bob signs in to get a code
    await signIn('bob');
    const bobCode = store.state.social.profile.code;
    await store.dispatch('AUTH_SET', { user: null }); await tick();

    // Alice adds Bob by code and lets him see "family"
    await signIn('alice');
    await expect(social.findByCode('nope')).rejects.toThrow(/8 letters/);
    await expect(social.findByCode('Zz9yXx8W')).rejects.toThrow(/No one/);
    await expect(social.findByCode(store.state.social.profile.code)).rejects.toThrow(/your own/);
    $('#acct-add-code').value = bobCode;
    $('#acct-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await pick('Family');
    await tick(60);
    expect(store.state.social.outgoing).toEqual([expect.objectContaining({ uid: 'bob', status: 'pending', level: 'family' })]);
    expect($('#ff-requests').textContent).toContain('waiting to accept');

    // Bob accepts and lets Alice see "friend"
    await store.dispatch('AUTH_SET', { user: null }); await tick();
    await signIn('bob');
    expect(store.state.social.incoming).toEqual([expect.objectContaining({ uid: 'alice', level: 'family' })]);
    expect($('#ff-requests').textContent).toContain('wants to connect');
    [...$('#ff-requests').querySelectorAll('button')].find(b => b.textContent === 'Accept').click();
    await pick('Friend');
    await tick(60);
    expect(store.state.social.contacts).toEqual([expect.objectContaining({ uid: 'alice', myLevel: 'friend', theirLevel: 'family' })]);
    expect($('#ff-circles').textContent).toContain('Alice');
    expect($('#ff-empty').hidden).toBe(true);

    // Back on Alice: Bob is a contact, the "waiting" row is gone
    await store.dispatch('AUTH_SET', { user: null }); await tick();
    await signIn('alice');
    expect(store.state.social.contacts).toEqual([expect.objectContaining({ uid: 'bob', myLevel: 'family', theirLevel: 'friend' })]);
    expect(store.state.social.outgoing).toEqual([]);
    await expect(social.findByCode(bobCode)).rejects.toThrow(/already connected/);
  });

  it('decline shows "didn\'t accept" to the sender; cancel removes it', async () => {
    backend.profiles.set('bob', { name: 'Bob', photo: '', code: 'BobCode1' });
    await signIn('alice');
    await social.sendRequest('bob', 'friend');
    await tick();
    await backend.adapter().decline('bob', 'alice');
    await tick(60);
    expect(store.state.social.outgoing[0]).toMatchObject({ uid: 'bob', status: 'declined' });
    expect($('#ff-requests').textContent).toContain('didn\'t accept');
    await social.cancelRequest('bob');
    await tick(60);
    expect(store.state.social.outgoing).toEqual([]);
  });

  it('circle menu: change level, remove (with confirm)', async () => {
    backend.profiles.set('bob', { name: 'Bob', photo: '', code: 'BobCode1' });
    backend.viewers.set('alice/bob', { level: 'friend' });
    backend.viewers.set('bob/alice', { level: 'family' });
    await signIn('alice');
    $('.ff-circle').click();
    expect(document.querySelector('.ff-popover').textContent).toContain('View Bob\'s Tasks');
    expect(document.querySelector('.ff-popover').textContent).toContain('Remove Bob From List');
    await pick('Change Their F&F Level');
    await pick('Family');
    expect(backend.viewers.get('alice/bob').level).toBe('family');

    $('.ff-circle').click();
    await pick('Remove Bob');
    await pick('Cancel');
    expect(backend.viewers.has('alice/bob')).toBe(true);
    $('.ff-circle').click();
    await pick('Remove Bob');
    await pick('Remove');
    await tick(60);
    expect(backend.viewers.has('alice/bob')).toBe(false);
    expect(backend.viewers.has('bob/alice')).toBe(false);
    expect(store.state.social.contacts).toEqual([]);
  });
});

describe('viewing a shared calendar', () => {
  function seedBob(levelForAlice) {
    backend.profiles.set('bob', { name: 'Bob', photo: '', code: 'BobCode1' });
    backend.viewers.set('alice/bob', { level: 'friend' });
    backend.viewers.set('bob/alice', { level: levelForAlice });
    backend.tasks.set('b1', { owner: 'bob', id: 'b1', date: TODAY, title: 'Bob task', done: false, order: 1 });
    backend.tasks.set('b2', { owner: 'bob', id: 'b2', date: TODAY, title: 'Bob secret', done: false, private: true });
    backend.tasks.set('b3', { owner: 'bob', id: 'b3', date: addDays(TODAY, 5), title: 'Later', done: false });
    backend.series.set('s1', { owner: 'bob', id: 's1', title: 'Bob meds', createdAt: 9, updatedAt: 1, private: false,
      rule: normaliseRule({ freq: 'daily', startDate: addDays(TODAY, -30) }) });
  }

  it('friend: blue mode, X instead of burger, 3 days, read-only', async () => {
    seedBob('friend');
    await signIn('alice');
    await store.dispatch('TASK_UPSERT', { date: TODAY, title: 'Alice own' });
    $('.ff-circle').click();
    await pick('View Bob\'s Tasks');
    await tick(60);

    expect(store.state.viewing).toMatchObject({ uid: 'bob', level: 'friend' });
    expect(document.documentElement.classList.contains('shared-mode')).toBe(true);
    expect(app.querySelector('.burger-btn').hidden).toBe(true);
    expect(app.querySelector('.shared-bar').hidden).toBe(false);
    expect(app.querySelector('.shared-bar__name').textContent).toBe('Bob\'s tasks');
    expect(store.state.tasks.map(t => t.title).sort()).toEqual(['Bob meds', 'Bob task']);   // no private, no own

    await store.dispatch('NAV_NEXT_DAY');
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));
    await store.dispatch('NAV_NEXT_DAY');
    expect(store.state.currentDate).toBe(addDays(TODAY, 1));                 // blocked
    expect(store.state.navBlocked).toBeTruthy();
    await tick();
    expect(document.querySelector('.toast').textContent).toContain('Friends share only');

    await store.dispatch('NAV_TO_DATE', { date: TODAY });
    const item = new TaskItem(store.state.tasks[0]);
    expect(item.el.querySelector('.task-checkbox').disabled).toBe(true);
    await store.dispatch('TASK_TOGGLE', { id: 'b1' });
    expect(backend.tasks.get('b1').done).toBe(false);

    app.querySelector('.shared-bar__close').click();
    await tick(60);
    expect(store.state.viewing).toBeNull();
    expect(document.documentElement.classList.contains('shared-mode')).toBe(false);
    expect(app.querySelector('.burger-btn').hidden).toBe(false);
    expect(store.state.tasks.map(t => t.title)).toEqual(['Alice own']);
  });

  it('family: every day, and ticking goes to their account (repeat copies too)', async () => {
    seedBob('family');
    await signIn('alice');
    await social.openShared(store.state.social.contacts[0]);
    await tick(60);
    expect(app.querySelector('.shared-bar__kind').textContent).toContain('Family');
    await store.dispatch('NAV_TO_DATE', { date: addDays(TODAY, 5) });
    expect(store.state.tasks.map(t => t.title)).toContain('Later');

    await store.dispatch('NAV_TO_DATE', { date: TODAY });
    await store.dispatch('TASK_TOGGLE', { id: 'b1' });
    expect(backend.tasks.get('b1').done).toBe(true);
    expect(store.state.tasks.find(t => t.id === 'b1').done).toBe(true);
    const occ = store.state.tasks.find(t => t.title === 'Bob meds');
    await store.dispatch('TASK_TOGGLE', { id: occ.id });
    expect(backend.tasks.get(occ.id)).toMatchObject({ done: true, seriesId: 's1' });
    expect(new TaskItem(store.state.tasks[0]).el.querySelector('.task-checkbox').disabled).toBe(false);
    await social.closeShared();
  });

  it('not shared yet → message instead of opening; being removed closes it', async () => {
    backend.profiles.set('bob', { name: 'Bob', photo: '', code: 'BobCode1' });
    await signIn('alice');
    expect(await social.openShared({ uid: 'bob', name: 'Bob', theirLevel: null })).toBe(false);
    expect(document.querySelector('.toast').textContent).toContain('isn\'t sharing');

    seedBob('friend');
    await store.dispatch('AUTH_SET', { user: null }); await tick();
    await signIn('alice');
    await social.openShared(store.state.social.contacts[0]);
    await backend.adapter().remove('bob', 'alice');
    await tick(60);
    expect(store.state.viewing).toBeNull();
  });
});
