/**
 * DYDTT — Friends & Family: Firestore access
 *
 *   profiles/{uid}                    { name, photo, code, updatedAt }   readable by signed-in users
 *   codes/{code}                      { uid, createdAt }                 look up a person by code
 *   users/{to}/requests/{from}        { from, level, createdAt }         "from" wants to connect;
 *                                                                        level = what "from" lets "to" see
 *   users/{me}/outgoing/{to}          { to, level, createdAt }           my sent requests
 *   users/{owner}/viewers/{viewer}    { level, since }                   viewer may see owner's tasks
 *
 * Connections are two-way: after accepting, both users/A/viewers/B and
 * users/B/viewers/A exist, each with the level its owner chose.
 */

import app from '../firebase.js';

let fsPromise = null;
function fs() {
  if (!fsPromise) fsPromise = import('firebase/firestore').then((m) => ({ m, db: m.getFirestore(app) }));
  return fsPromise;
}

const strip = (snap) => {
  const { syncedAt, ...rest } = snap.data();
  void syncedAt;
  return { ...rest, id: snap.id };
};

export const socialAdapter = {
  // ── Profiles + codes ──────────────────────────────────────────────────────

  async getProfile(uid) {
    const { m, db } = await fs();
    const snap = await m.getDoc(m.doc(db, 'profiles', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  },

  async saveProfile(uid, { name, photo, code }) {
    const { m, db } = await fs();
    await m.setDoc(m.doc(db, 'profiles', uid), { name, photo: photo ?? '', code, updatedAt: Date.now() });
  },

  /** Reserve a code for this user. Returns false if someone already has it. */
  async claimCode(uid, code) {
    const { m, db } = await fs();
    try {
      return await m.runTransaction(db, async (tx) => {
        const ref = m.doc(db, 'codes', code);
        if ((await tx.get(ref)).exists()) return false;
        tx.set(ref, { uid, createdAt: Date.now() });
        return true;
      });
    } catch (err) {
      if (err?.code === 'permission-denied') return false;
      throw err;
    }
  },

  async releaseCode(code) {
    const { m, db } = await fs();
    await m.deleteDoc(m.doc(db, 'codes', code));
  },

  /** uid for a code, or null. */
  async lookupCode(code) {
    const { m, db } = await fs();
    const snap = await m.getDoc(m.doc(db, 'codes', code));
    return snap.exists() ? snap.data().uid : null;
  },

  // ── Requests + connections ────────────────────────────────────────────────

  async sendRequest(me, to, level) {
    const { m, db } = await fs();
    const b = m.writeBatch(db);
    const now = Date.now();
    b.set(m.doc(db, 'users', to, 'requests', me), { from: me, level, createdAt: now });
    b.set(m.doc(db, 'users', me, 'outgoing', to), { to, level, createdAt: now });
    await b.commit();
  },

  async cancelRequest(me, to) {
    const { m, db } = await fs();
    const b = m.writeBatch(db);
    b.delete(m.doc(db, 'users', to, 'requests', me));
    b.delete(m.doc(db, 'users', me, 'outgoing', to));
    await b.commit();
  },

  async clearOutgoing(me, to) {
    const { m, db } = await fs();
    await m.deleteDoc(m.doc(db, 'users', me, 'outgoing', to));
  },

  async requestStillOpen(me, to) {
    const { m, db } = await fs();
    try {
      return (await m.getDoc(m.doc(db, 'users', to, 'requests', me))).exists();
    } catch {
      return false;
    }
  },

  /** Accept "from"'s request. myLevel = what they may see of mine; theirLevel = what they offered me. */
  async accept(me, from, myLevel, theirLevel) {
    const { m, db } = await fs();
    const b = m.writeBatch(db);
    const now = Date.now();
    b.set(m.doc(db, 'users', me, 'viewers', from), { level: myLevel, since: now });
    b.set(m.doc(db, 'users', from, 'viewers', me), { level: theirLevel, since: now });
    b.delete(m.doc(db, 'users', me, 'requests', from));
    await b.commit();
  },

  async decline(me, from) {
    const { m, db } = await fs();
    await m.deleteDoc(m.doc(db, 'users', me, 'requests', from));
  },

  /** Disconnect both ways. */
  async remove(me, other) {
    const { m, db } = await fs();
    const b = m.writeBatch(db);
    b.delete(m.doc(db, 'users', me, 'viewers', other));
    b.delete(m.doc(db, 'users', other, 'viewers', me));
    await b.commit();
  },

  async setLevel(me, other, level) {
    const { m, db } = await fs();
    await m.updateDoc(m.doc(db, 'users', me, 'viewers', other), { level });
  },

  /** What "owner" lets me see ('friend' | 'family' | null). */
  async levelFrom(owner, me) {
    const { m, db } = await fs();
    try {
      const snap = await m.getDoc(m.doc(db, 'users', owner, 'viewers', me));
      return snap.exists() ? snap.data().level : null;
    } catch {
      return null;
    }
  },

  /** Live lists for the Account tab. cb(kind: 'contacts'|'incoming'|'outgoing', docs[]) */
  listen(me, cb, onError) {
    let stopped = false;
    const unsubs = [];
    fs().then(({ m, db }) => {
      if (stopped) return;
      for (const [kind, col] of [['contacts', 'viewers'], ['incoming', 'requests'], ['outgoing', 'outgoing']]) {
        unsubs.push(m.onSnapshot(m.collection(db, 'users', me, col),
          (snap) => cb(kind, snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
          onError));
      }
    }).catch(onError);
    return () => { stopped = true; unsubs.forEach(u => u()); };
  },

  // ── Shared calendar ───────────────────────────────────────────────────────

  subscribeShared(owner, { level, fromDay, toDay }, onDocs, onError) {
    let stopped = false;
    const unsubs = [];
    fs().then(({ m, db }) => {
      if (stopped) return;
      const tasksCol  = m.collection(db, 'users', owner, 'tasks');
      const seriesCol = m.collection(db, 'users', owner, 'series');
      // These filters must match the security rules, or Firestore refuses the query
      const taskQuery = level === 'family'
        ? m.query(tasksCol, m.where('private', '==', false))
        : m.query(tasksCol, m.where('private', '==', false), m.where('day', '>=', fromDay), m.where('day', '<=', toDay));
      const seriesQuery = m.query(seriesCol, m.where('private', '==', false));
      const handle = (kind) => (snap) => {
        const docs = snap.docChanges().map(c => c.type === 'removed'
          ? { id: c.doc.id, __removed: true }
          : strip(c.doc));
        if (docs.length) onDocs(kind, docs);
        else if (snap.metadata && !snap.metadata.fromCache) onDocs(kind, []);
      };
      unsubs.push(m.onSnapshot(taskQuery, handle('task'), onError));
      unsubs.push(m.onSnapshot(seriesQuery, handle('series'), onError));
    }).catch(onError);
    return () => { stopped = true; unsubs.forEach(u => u()); };
  },

  async setTaskDone(owner, task, done) {
    const { m, db } = await fs();
    await m.updateDoc(m.doc(db, 'users', owner, 'tasks', task.id), {
      done, updatedAt: Date.now(), syncedAt: m.serverTimestamp(),
    });
  },

  async createTask(owner, task) {
    const { m, db } = await fs();
    const doc = {
      id: task.id, date: task.date, title: task.title, notes: task.notes ?? '', done: Boolean(task.done),
      order: task.order ?? 0, reminderAt: task.reminderAt ?? null, createdAt: task.createdAt ?? Date.now(),
      updatedAt: task.updatedAt ?? Date.now(), deleted: false, private: false,
      seriesId: task.seriesId, slot: task.slot ?? 0, day: task.day,
      syncedAt: m.serverTimestamp(),
    };
    await m.setDoc(m.doc(db, 'users', owner, 'tasks', task.id), doc);
  },
};
