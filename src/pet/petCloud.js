/**
 * DYDTT — Cat game: Firestore storage, so the same cat lives on all your devices.
 *
 *   users/{uid}/pet/state     one document — the whole cat (see pet.js)
 *
 * firebase/firestore is loaded on first use.
 */

import app from '../firebase.js';

let fsPromise = null;
function fs() {
  if (!fsPromise) {
    fsPromise = import('firebase/firestore').then((m) => ({ m, db: m.getFirestore(app) }));
  }
  return fsPromise;
}

/** Only the fields the security rules allow. */
export const PET_FIELDS = [
  'v', 'found', 'hunger', 'fun', 'love', 'poops', 'mice', 'coins', 'treats', 'toys',
  'poopClock', 'starveClock', 'lastTick', 'updatedAt', 'awarded',
];

export function toCloud(pet) {
  const out = {};
  for (const k of PET_FIELDS) if (pet[k] !== undefined) out[k] = pet[k];
  return out;
}

export const petCloud = {
  async put(uid, pet) {
    const { m, db } = await fs();
    await m.setDoc(m.doc(db, 'users', uid, 'pet', 'state'), { ...toCloud(pet), syncedAt: m.serverTimestamp() });
  },

  /** The account's cat, straight from the server (null = none yet). */
  async get(uid) {
    const { m, db } = await fs();
    const snap = await m.getDocFromServer(m.doc(db, 'users', uid, 'pet', 'state'));
    if (!snap.exists()) return null;
    const { syncedAt, ...data } = snap.data();
    void syncedAt;
    return data;
  },

  /** cb(state | null, { fromCache }) whenever the account's cat changes (not for our own pending writes). */
  listen(uid, cb, onError) {
    let stopped = false;
    let unsub = null;
    fs().then(({ m, db }) => {
      if (stopped) return;
      unsub = m.onSnapshot(m.doc(db, 'users', uid, 'pet', 'state'), (snap) => {
        if (snap.metadata?.hasPendingWrites) return;
        const meta = { fromCache: Boolean(snap.metadata?.fromCache) };
        if (!snap.exists()) { cb(null, meta); return; }
        const { syncedAt, ...data } = snap.data();
        void syncedAt;
        cb(data, meta);
      }, onError);
    }).catch(onError);
    return () => { stopped = true; unsub?.(); };
  },
};
