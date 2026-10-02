/**
 * DYDTT — Cat game: saved state, sync and change notifications.
 *
 * Nothing runs until the secret page has been found once (pet.found).
 * Saved on this device (settings table, key 'pet'). When signed in, the cat
 * also lives in your account (users/{uid}/pet/state), so every device shares
 * him — found on one phone, he appears on the others; coins earned anywhere
 * add up.
 */

import { getSetting, setSetting } from '../db/schema.js';
import { onTaskDone, store } from '../store.js';
import { newPet, tick, act, buy, awardCoin, migrate, mergePets, expiredToys } from './pet.js';
import { todayStr } from '../utils/dateHelpers.js';

const KEY = 'pet';
export const UPLOAD_DELAY_MS = 1200;

let pet = null;                         // null = not found yet
const listeners = new Set();
let unhookTasks = null;
let unhookUser = null;

// Sync
let cloud = null;                       // { put, listen } — Firestore by default
let uid = null;
let stopListen = null;
let uploadTimer = null;

function emit(event = {}) {
  for (const fn of listeners) fn(pet, event);
}

async function saveLocal() {
  await setSetting(KEY, pet);
}

/** Something YOU did: save here and (soon) to your account. */
async function save() {
  await saveLocal();
  scheduleUpload();
}

function scheduleUpload() {
  if (!uid || !cloud || !pet) return;
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(uploadNow, UPLOAD_DELAY_MS);
}

export async function uploadNow() {
  clearTimeout(uploadTimer);
  uploadTimer = null;
  if (!uid || !cloud || !pet) return;
  try {
    await cloud.put(uid, pet);
  } catch (err) {
    console.error('[Pet] upload failed', err);
  }
}

/** Catch up on time; tell listeners about toys that went missing. */
function catchUp(now = Date.now()) {
  if (!pet) return [];
  const lost = expiredToys(pet, now);
  pet = tick(pet, now);
  return lost;
}

/**
 * Load the saved cat, start earning coins from ticked tasks, and sync with
 * the signed-in account.
 * @param {{ cloud?: { put, listen } }} [opts]
 */
export async function initPet({ cloud: c } = {}) {
  cloud = c ?? cloud ?? (await import('./petCloud.js')).petCloud;
  const saved = await getSetting(KEY);
  pet = saved?.found ? migrate(saved) : null;
  const lost = catchUp();
  if (pet) await saveLocal();

  unhookTasks?.();
  unhookTasks = onTaskDone((id) => { earnCoin(id); });

  unhookUser?.();
  let lastUid;
  unhookUser = store.subscribe('user', (user) => {
    const next = user?.uid ?? null;
    if (next === lastUid) return;
    lastUid = next;
    startSync(next);
  });
  startSync(store.state.user?.uid ?? null);
  lastUid = store.state.user?.uid ?? null;

  emit(lost.length ? { lost } : {});
  return pet;
}

function startSync(nextUid) {
  if (nextUid === uid && stopListen) return;
  stopListen?.();
  stopListen = null;
  clearTimeout(uploadTimer);
  uid = nextUid;
  if (!uid || !cloud) return;
  stopListen = cloud.listen(uid, (remote) => { onRemote(remote); },
    (err) => console.error('[Pet] sync', err));
}

/** The account's copy changed (or was read for the first time). */
export async function onRemote(remote) {
  if (!remote?.found) {
    if (pet?.found) await uploadNow();       // first device to find him: put him in the account
    return;
  }
  const before = pet;
  const lostBefore = pet ? Object.keys(pet.toys ?? {}) : [];
  pet = mergePets(pet, remote);
  const lost = catchUp();
  await saveLocal();
  const merged = pet;
  const remoteMissing = merged.coins !== remote.coins
    || (merged.updatedAt ?? 0) > (remote.updatedAt ?? 0)
    || merged.awarded.length !== (remote.awarded ?? []).length;
  if (remoteMissing) scheduleUpload();       // we know something the account doesn't
  emit({
    synced: true,
    found: !before?.found,
    ...(lost.length ? { lost: lost.filter(k => lostBefore.includes(k)) } : {}),
  });
}

export function getPet() {
  return pet;
}

export function isFound() {
  return Boolean(pet?.found);
}

/** @param {(pet, event: { earned?, action?, ok?, lost?, bought?, synced?, found? }) => void} fn */
export function subscribePet(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** First visit to the secret page: the game begins. */
export async function markFound() {
  if (pet?.found) return pet;
  pet = newPet();
  await save();
  await setSetting('petHelloDay', todayStr());   // you've just met — first hello is tomorrow
  emit({ found: true });
  return pet;
}

/** Catch up on time passed (call on open, every minute, and on resume). */
export async function refreshPet() {
  if (!pet) return null;
  const lost = catchUp();
  await saveLocal();
  emit(lost.length ? { lost } : {});
  return pet;
}

/**
 * Feed / treat / pet / play (toy) / scratch / clean / mouse. Returns { ok, say }.
 * @param {{ factor?: number }} [opts] play: scale the fun (wand minigame)
 */
export async function doAction(action, toy, opts) {
  if (!pet) return { ok: false, say: '' };
  const lost = catchUp();
  const res = act(pet, action, toy, Date.now(), opts);
  pet = res.state;
  if (res.ok) await save(); else await saveLocal();
  emit({ action, toy, ok: res.ok, ...(lost.length ? { lost } : {}) });
  return { ok: res.ok, say: res.say };
}

/** Buy treats or a toy with coins. Returns { ok, say }. */
export async function buyItem(item) {
  if (!pet) return { ok: false, say: '' };
  catchUp();
  const res = buy(pet, item);
  pet = res.state;
  if (res.ok) await save();
  emit({ bought: res.ok ? item : null, ok: res.ok });
  return { ok: res.ok, say: res.say };
}

/** A ticked-off task pays one coin (only once the cat has been found). */
export async function earnCoin(taskId) {
  if (!pet) return false;
  const res = awardCoin(pet, taskId);
  if (res.state === pet) return false;
  pet = res.state;
  await save();
  emit({ earned: res.earned });
  return res.earned;
}

/** Tests only. */
export function _resetPet() {
  pet = null;
  listeners.clear();
  unhookTasks?.();
  unhookTasks = null;
  unhookUser?.();
  unhookUser = null;
  stopListen?.();
  stopListen = null;
  clearTimeout(uploadTimer);
  uploadTimer = null;
  uid = null;
  cloud = null;
}
