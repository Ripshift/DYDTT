/**
 * DYDTT — Firestore adapter for the sync engine
 *
 *   users/{uid}/tasks/{taskId}
 *   users/{uid}/series/{seriesId}
 *
 * Every write stamps `syncedAt` with the server's clock (enforced by the
 * security rules). Pulling "everything changed since X" uses that server
 * time, so devices with wrong clocks can't miss each other's changes.
 *
 * firebase/firestore is loaded on first use, so signed-out users never
 * download it.
 */

import app from '../firebase.js';

let fsPromise = null;
function fs() {
  if (!fsPromise) {
    fsPromise = import('firebase/firestore').then((m) => ({ m, db: m.getFirestore(app) }));
  }
  return fsPromise;
}

const COLLECTIONS = { task: 'tasks', series: 'series' };
const BATCH_LIMIT = 450;   // Firestore allows 500 writes per batch

export const firestoreAdapter = {
  async push(uid, { tasks = [], series = [] }) {
    const { m, db } = await fs();
    const writes = [
      ...series.map(d => ['series', d]),
      ...tasks.map(d => ['tasks', d]),
    ];
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = m.writeBatch(db);
      for (const [col, data] of writes.slice(i, i + BATCH_LIMIT)) {
        batch.set(m.doc(db, 'users', uid, col, data.id), { ...data, syncedAt: m.serverTimestamp() });
      }
      await batch.commit();
    }
  },

  async fetchAll(uid) {
    const { m, db } = await fs();
    const [t, s] = await Promise.all([
      m.getDocs(m.collection(db, 'users', uid, 'tasks')),
      m.getDocs(m.collection(db, 'users', uid, 'series')),
    ]);
    const strip = (snap) => snap.docs.map(d => { const { syncedAt, ...rest } = d.data(); void syncedAt; return rest; });
    return { tasks: strip(t), series: strip(s) };
  },

  subscribe(uid, since, onDocs, onError) {
    let stopped = false;
    const unsubs = [];
    fs().then(({ m, db }) => {
      if (stopped) return;
      for (const [kind, col] of Object.entries(COLLECTIONS)) {
        const q = m.query(
          m.collection(db, 'users', uid, col),
          m.where('syncedAt', '>', m.Timestamp.fromMillis(since?.[kind] || 0)),
        );
        unsubs.push(m.onSnapshot(q, (snap) => {
          const docs = [];
          let latest = 0;
          for (const change of snap.docChanges()) {
            if (change.type === 'removed') continue;
            // Our own write still waiting for the server — it comes back once committed
            if (change.doc.metadata.hasPendingWrites) continue;
            const data = change.doc.data();
            const at = data.syncedAt?.toMillis?.() ?? 0;
            latest = Math.max(latest, at);
            docs.push({ ...data, syncedAt: at });
          }
          if (docs.length) onDocs(kind, docs, latest);
        }, onError));
      }
    }).catch(onError);
    return () => { stopped = true; unsubs.forEach(u => u()); };
  },
};
