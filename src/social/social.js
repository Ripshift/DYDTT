/**
 * DYDTT — Friends & Family service
 * Keeps store.state.social up to date and performs the Account-tab actions.
 *
 *   store.state.social = {
 *     ready,
 *     profile:  { uid, name, photo, code } | null,
 *     contacts: [{ uid, name, photo, myLevel, theirLevel }],   // myLevel: what they see of mine
 *     incoming: [{ uid, name, photo, level }],                 // level: what they'd let me see
 *     outgoing: [{ uid, name, photo, level, status }],         // status: 'pending' | 'declined'
 *   }
 *   store.state.viewing = { uid, name, photo, level } | null   // whose calendar is open
 */

import { store }             from '../store.js';
import { generateCode, isValidCode, normaliseCode } from './codes.js';
import { isSafePhoto }       from './avatar.js';
import { SharedCalendar }    from './sharedCalendar.js';
import { setSharedSource, getSharedSource } from '../data/source.js';
import { showToast }         from '../utils/toast.js';

let adapter = null;
let me = null;
let signupName = null;     // name typed on the sign-up form (auth's displayName arrives later)

export function setSignupName(name) { signupName = name || null; }
let stopLists = null;
const profileCache = new Map();
const lists = { contacts: [], incoming: [], outgoing: [] };

const set = (patch) => store.dispatch('SOCIAL_SET', patch);

/** Load a profile (cached). Falls back to a placeholder if it can't be read. */
async function profileOf(uid) {
  if (profileCache.has(uid)) return profileCache.get(uid);
  let p = null;
  try { p = await adapter.getProfile(uid); } catch { /* not readable */ }
  const out = { uid, name: p?.name || 'Someone', photo: isSafePhoto(p?.photo) ? p.photo : '' };
  profileCache.set(uid, out);
  return out;
}

// ── Start / stop ────────────────────────────────────────────────────────────

let unsubUser = null;

export async function initSocial({ adapter: a } = {}) {
  adapter = a ?? (await import('./socialAdapter.js')).socialAdapter;
  unsubUser?.();                       // re-init (tests): one listener only
  stop();
  let lastUid = null;
  unsubUser = store.subscribe('user', async (user) => {
    const uid = user?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    stop();
    if (uid) await start(user);
  });
}

async function start(user) {
  me = user.uid;
  try {
    const profile = await ensureProfile(user);
    set({ profile });
  } catch (err) {
    console.error('[Social] profile', err);
  }
  stopLists = adapter.listen(me, (kind, docs) => onList(kind, docs),
    (err) => console.error('[Social] listen', err));
}

function stop() {
  stopLists?.();
  stopLists = null;
  me = null;
  profileCache.clear();
  lists.contacts = []; lists.incoming = []; lists.outgoing = [];
  if (store.state.viewing) closeShared();
  set({ ready: false, profile: null, contacts: [], incoming: [], outgoing: [] });
}

/** First sign-in: create the profile from the Google / sign-up name + photo, and a code. */
export async function ensureProfile(user) {
  let p = await adapter.getProfile(user.uid);
  if (p?.code && p?.name) return { uid: user.uid, ...p };
  const name  = p?.name || signupName || user.displayName || (user.email ?? '').split('@')[0] || 'Me';
  signupName = null;
  const photo = p?.photo || (isSafePhoto(user.photoURL) ? user.photoURL : '');
  const code  = p?.code || await newCode(user.uid);
  await adapter.saveProfile(user.uid, { name, photo, code });
  return { uid: user.uid, name, photo, code };
}

async function newCode(uid) {
  for (let i = 0; i < 6; i++) {
    const code = generateCode();
    if (await adapter.claimCode(uid, code)) return code;
  }
  throw new Error('Could not create a code — please try again.');
}

// ── Lists ───────────────────────────────────────────────────────────────────

async function onList(kind, docs) {
  if (kind === 'contacts') {
    lists.contacts = await Promise.all(docs.map(async (d) => ({
      ...(await profileOf(d.uid)),
      myLevel:    d.level,
      theirLevel: await adapter.levelFrom(d.uid, me),
    })));
    // They removed me while I was looking at their calendar
    if (store.state.viewing && !docs.some(d => d.uid === store.state.viewing.uid)) {
      closeShared();
      showToast({ message: 'That calendar is no longer shared with you.', timeout: 4000 });
    }
  } else if (kind === 'incoming') {
    lists.incoming = await Promise.all(docs.map(async (d) => ({ ...(await profileOf(d.uid)), level: d.level })));
  } else if (kind === 'outgoing') {
    lists.outgoing = await Promise.all(docs
      .map(async (d) => ({
        ...(await profileOf(d.uid)),
        level:  d.level,
        status: (await adapter.requestStillOpen(me, d.uid)) ? 'pending' : 'declined',
      })));
  }
  // Accepted requests: drop them from my "waiting" list
  const contactIds = new Set(lists.contacts.map(c => c.uid));
  for (const o of lists.outgoing.filter(o => contactIds.has(o.uid))) {
    adapter.clearOutgoing(me, o.uid).catch(() => {});
  }
  lists.outgoing = lists.outgoing.filter(o => !contactIds.has(o.uid));
  set({ ready: true, contacts: [...lists.contacts], incoming: [...lists.incoming], outgoing: [...lists.outgoing] });
}

// ── Actions (used by the Account tab) ───────────────────────────────────────

export async function updateProfile({ name, photo }) {
  const p = store.state.social.profile;
  const clean = String(name ?? '').trim().slice(0, 50);
  if (!clean) throw new Error('Please enter a name.');
  if (photo && !isSafePhoto(photo)) throw new Error('That picture can\'t be used.');
  await adapter.saveProfile(me, { name: clean, photo: photo ?? '', code: p.code });
  set({ profile: { ...p, name: clean, photo: photo ?? '' } });
}

/** Replace my code (the old one stops working). */
export async function regenerateCode() {
  const p = store.state.social.profile;
  const code = await newCode(me);
  await adapter.saveProfile(me, { name: p.name, photo: p.photo, code });
  if (p.code) await adapter.releaseCode(p.code).catch(() => {});
  set({ profile: { ...p, code } });
  return code;
}

/** Look up a code. Returns { uid, name, photo } or throws a friendly error. */
export async function findByCode(input) {
  const code = normaliseCode(input);
  if (!isValidCode(code)) throw new Error('Codes are 8 letters and numbers.');
  if (code === store.state.social.profile?.code) throw new Error('That\'s your own code.');
  const uid = await adapter.lookupCode(code);
  if (!uid) throw new Error('No one has that code. Check the capitals — codes are case-sensitive.');
  if (store.state.social.contacts.some(c => c.uid === uid)) throw new Error('You\'re already connected.');
  return profileOf(uid);
}

/** Ask to connect. level = how much THEY may see of MY tasks. */
export async function sendRequest(uid, level) {
  await adapter.sendRequest(me, uid, level);
}

export async function cancelRequest(uid) {
  await adapter.cancelRequest(me, uid);
}

export async function acceptRequest(uid, myLevel) {
  const req = store.state.social.incoming.find(r => r.uid === uid);
  if (!req) return;
  await adapter.accept(me, uid, myLevel, req.level);
}

export async function declineRequest(uid) {
  await adapter.decline(me, uid);
}

export async function removeContact(uid) {
  if (store.state.viewing?.uid === uid) closeShared();
  await adapter.remove(me, uid);
}

/** Change how much this person sees of MY tasks. */
export async function setContactLevel(uid, level) {
  await adapter.setLevel(me, uid, level);
  const contacts = store.state.social.contacts.map(c => c.uid === uid ? { ...c, myLevel: level } : c);
  lists.contacts = contacts;
  set({ contacts });
}

// ── Shared calendar ─────────────────────────────────────────────────────────

/** Open a contact's calendar (light-blue mode, X to exit). */
export async function openShared(contact) {
  const level = contact.theirLevel ?? await adapter.levelFrom(contact.uid, me);
  if (!level) {
    showToast({ message: `${contact.name} isn't sharing their tasks with you yet.`, timeout: 4000 });
    return false;
  }
  getSharedSource()?.stop();
  const cal = new SharedCalendar({
    ownerUid: contact.uid,
    level,
    adapter,
    onChange: () => store.dispatch('REFRESH'),
    onError:  (err) => {
      console.error('[Shared]', err);
      showToast({ message: 'Couldn\'t load or update their tasks. Check your connection.', variant: 'error', timeout: 5000 });
    },
  });
  setSharedSource(cal);          // set before start(): its first data may arrive immediately
  cal.start();
  await store.dispatch('VIEW_SET', { viewing: { uid: contact.uid, name: contact.name, photo: contact.photo, level } });
  return true;
}

export async function closeShared() {
  getSharedSource()?.stop();
  setSharedSource(null);
  await store.dispatch('VIEW_SET', { viewing: null });
}
