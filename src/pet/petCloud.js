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

  /** cb(state | null) whenever the account's cat changes (not for our own pending writes). */
  listen(uid, cb, onError) {
    let stopped = false;
    let unsub = null;
    fs().then(({ m, db }) => {
      if (stopped) return;
      unsub = m.onSnapshot(m.doc(db, 'users', uid, 'pet', 'state'), (snap) => {
        if (snap.metadata?.hasPendingWrites) return;
        if (!snap.exists()) { cb(null); return; }
        const { syncedAt, ...data } = snap.data();
        void syncedAt;
        cb(data);
      }, onError);
    }).catch(onError);
    return () => { stopped = true; unsub?.(); };
  },
};
