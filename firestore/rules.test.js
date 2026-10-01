import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, collectionGroup, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

let env;
const omit = (o, k) => { const c = { ...o }; delete c[k]; return c; };
const T = (over = {}) => ({ id: 't1', date: '2026-10-01', title: 'Walk dog', notes: '', done: false,
  order: 1790000000000, reminderAt: 1790000000000, createdAt: 1790000000000, updatedAt: 1790000000001,
  syncedAt: serverTimestamp(), ...over });
const ts = () => ({ syncedAt: serverTimestamp() });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dydtt',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext('alice').firestore();
const bob   = () => env.authenticatedContext('bob').firestore();
const anon  = () => env.unauthenticatedContext().firestore();
const carol = () => env.authenticatedContext('carol').firestore();
const admin = (fn) => env.withSecurityRulesDisabled(c => fn(c.firestore()));

describe('tasks', () => {
  it('owner can create, read, update, tombstone and delete', async () => {
    const db = alice(); const ref = doc(db, 'users/alice/tasks/t1');
    await assertSucceeds(setDoc(ref, T()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, 'users/alice/tasks')));
    await assertSucceeds(updateDoc(ref, { done: true, updatedAt: 1790000000002, ...ts() }));
    await assertSucceeds(updateDoc(ref, { deleted: true, updatedAt: 1790000000003, ...ts() }));
    await assertSucceeds(updateDoc(ref, { reminderAt: null, priority: 1, tags: ['home'], remindedAt: null, seriesId: 's1', slot: 0, ...ts() }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('minimal task (only required fields) is fine', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/tasks/t1'),
      { id: 't1', date: '2026-10-01', title: 'x', done: false, updatedAt: 1, ...ts() }));
  });

  it('other users and signed-out visitors get nothing', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/tasks/t1'), T()));
    await assertFails(getDoc(doc(bob(), 'users/alice/tasks/t1')));
    await assertFails(getDocs(collection(bob(), 'users/alice/tasks')));
    await assertFails(setDoc(doc(bob(), 'users/alice/tasks/t2'), T({ id: 't2' })));
    await assertFails(deleteDoc(doc(bob(), 'users/alice/tasks/t1')));
    await assertFails(getDoc(doc(anon(), 'users/alice/tasks/t1')));
    await assertFails(setDoc(doc(anon(), 'users/anon/tasks/t1'), T()));
    await assertFails(getDocs(query(collectionGroup(alice(), 'tasks'))));   // no cross-user queries
  });

  it.each([
    ['unknown field (e.g. local syncStatus)', T({ syncStatus: 'pending-upsert' })],
    ['id mismatch',          T({ id: 'other' })],
    ['bad date',             T({ date: '10/01/2026' })],
    ['title too long',       T({ title: 'x'.repeat(256) })],
    ['title not a string',   T({ title: 5 })],
    ['done not a bool',      T({ done: 'yes' })],
    ['missing updatedAt',    omit(T(), 'updatedAt')],
    ['missing title',        omit(T(), 'title')],
    ['notes too long',       T({ notes: 'x'.repeat(5001) })],
    ['reminderAt a string',  T({ reminderAt: '9:30' })],
    ['tags not a list',      T({ tags: 'home' })],
    ['too many tags',        T({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })],
    ['deleted not a bool',   T({ deleted: 'yes' })],
    ['client-set syncedAt',  T({ syncedAt: 123 })],
    ['missing syncedAt',     omit(T(), 'syncedAt')],
    ['slot out of range',    T({ slot: 12 })],
    ['seriesId too long',    T({ seriesId: 'x'.repeat(65) })],
  ])('rejects %s', async (_, data) => {
    await assertFails(setDoc(doc(alice(), 'users/alice/tasks/t1'), data));
  });

  it('rejects an update that would add a bad field', async () => {
    const ref = doc(alice(), 'users/alice/tasks/t1');
    await setDoc(ref, T());
    await assertFails(updateDoc(ref, { hacked: true, ...ts() }));
  });

  it('allows a task that the reminder worker already stamped with remindedAt', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/tasks/t1'), T({ remindedAt: 1790000000000 })));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/tasks/t1'), { title: 'Walk dog twice', updatedAt: 2, ...ts() }));
  });
});

describe('series (repeating tasks)', () => {
  const S = (over = {}) => ({ id: 's1', title: 'Take meds', notes: '', createdAt: 1, updatedAt: 2, deleted: false,
    rule: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5], monthDay: 1, times: ['09:00', '21:00'],
            startDate: '2026-10-01', endDate: null, count: null },
    syncedAt: serverTimestamp(), ...over });

  it('owner can create, update and tombstone a series', async () => {
    const ref = doc(alice(), 'users/alice/series/s1');
    await assertSucceeds(setDoc(ref, S()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { 'rule.endDate': '2026-12-31', updatedAt: 3, ...ts() }));
    await assertSucceeds(updateDoc(ref, { deleted: true, updatedAt: 4, ...ts() }));
  });

  it.each([
    ['bad freq',        S({ rule: { ...S().rule, freq: 'yearly' } })],
    ['bad startDate',   S({ rule: { ...S().rule, startDate: 'tomorrow' } })],
    ['too many times',  S({ rule: { ...S().rule, times: Array(13).fill('09:00') } })],
    ['interval 0',      S({ rule: { ...S().rule, interval: 0 } })],
    ['unknown rule key',S({ rule: { ...S().rule, cron: '* * *' } })],
    ['unknown field',   S({ extra: 1 })],
    ['id mismatch',     S({ id: 'other' })],
    ['client syncedAt', S({ syncedAt: 5 })],
  ])('rejects %s', async (_, data) => {
    await assertFails(setDoc(doc(alice(), 'users/alice/series/s1'), data));
  });

  it('other users cannot read or write', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/series/s1'), { ...S(), syncedAt: 1 }));
    await assertFails(getDoc(doc(bob(), 'users/alice/series/s1')));
    await assertFails(setDoc(doc(bob(), 'users/alice/series/s2'), S({ id: 's2' })));
  });
});

describe('devices (web push, task 14b)', () => {
  const D = (over = {}) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a',
    platform: 'Windows Chrome', timeZone: 'America/Los_Angeles', createdAt: 1, updatedAt: 1, ...over });

  it('owner can register, read and remove a device', async () => {
    const ref = doc(alice(), 'users/alice/devices/d1');
    await assertSucceeds(setDoc(ref, D()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });
  it('rejects bad devices and other users', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/devices/d1'), D({ endpoint: 'http://evil' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/devices/d1'), D({ extra: 1 })));
    await assertFails(setDoc(doc(alice(), 'users/alice/devices/d1'), D({ auth: 5 })));
    await assertFails(setDoc(doc(bob(),   'users/alice/devices/d1'), D()));
  });
});

describe('user doc + everything else', () => {
  it('user doc is read-only; unknown collections are denied', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { name: 'A' }));
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(setDoc(doc(alice(), 'users/alice/other/x'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'public/x'), { a: 1 }));
  });
});

// ══ Friends & Family ═══════════════════════════════════════════════════════

const DAY_MS = 86_400_000;
const today = Math.floor(Date.now() / DAY_MS);
const dateOf = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const TT = (id, day, over = {}) => ({ id, date: dateOf(day), title: id, done: false, updatedAt: 1,
  private: false, day, syncedAt: 1, ...over });

describe('profiles + codes', () => {
  it('claim a code, then save a profile that points at it', async () => {
    const db = alice();
    await assertSucceeds(setDoc(doc(db, 'codes/Ab3dE9xQ'), { uid: 'alice', createdAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'profiles/alice'), { name: 'Alice', photo: '', code: 'Ab3dE9xQ', updatedAt: 1 }));
    await assertSucceeds(setDoc(doc(db, 'profiles/alice'), { name: 'Alice B', photo: 'data:image/jpeg;base64,AAAA', code: 'Ab3dE9xQ', updatedAt: 2 }));
    await assertSucceeds(getDoc(doc(bob(), 'profiles/alice')));            // anyone signed in can read by id
    await assertSucceeds(getDoc(doc(bob(), 'codes/Ab3dE9xQ')));
    await assertFails(getDoc(doc(anon(), 'profiles/alice')));
    await assertFails(getDocs(collection(bob(), 'profiles')));             // no browsing
    await assertFails(getDocs(collection(bob(), 'codes')));
  });

  it('cannot take someone else\'s code or write their profile', async () => {
    await admin(db => setDoc(doc(db, 'codes/Ab3dE9xQ'), { uid: 'alice', createdAt: 1 }));
    await assertFails(setDoc(doc(bob(), 'codes/Ab3dE9xQ'), { uid: 'bob', createdAt: 1 }));     // exists → update → denied
    await assertFails(setDoc(doc(bob(), 'codes/Zz9yXx8W'), { uid: 'alice', createdAt: 1 }));   // for someone else
    await assertFails(setDoc(doc(bob(), 'codes/short'), { uid: 'bob', createdAt: 1 }));
    await assertFails(setDoc(doc(bob(), 'profiles/bob'), { name: 'Bob', photo: '', code: 'Ab3dE9xQ', updatedAt: 1 }));  // not his code
    await assertFails(setDoc(doc(bob(), 'profiles/alice'), { name: 'X', photo: '', code: 'Ab3dE9xQ', updatedAt: 1 }));
    await assertFails(deleteDoc(doc(bob(), 'codes/Ab3dE9xQ')));
    await assertSucceeds(deleteDoc(doc(alice(), 'codes/Ab3dE9xQ')));
  });

  it('profile validation', async () => {
    await admin(db => setDoc(doc(db, 'codes/Ab3dE9xQ'), { uid: 'alice', createdAt: 1 }));
    const P = (o) => ({ name: 'Alice', photo: '', code: 'Ab3dE9xQ', updatedAt: 1, ...o });
    await assertFails(setDoc(doc(alice(), 'profiles/alice'), P({ name: '' })));
    await assertFails(setDoc(doc(alice(), 'profiles/alice'), P({ name: 'x'.repeat(51) })));
    await assertFails(setDoc(doc(alice(), 'profiles/alice'), P({ photo: 'javascript:alert(1)' })));
    await assertFails(setDoc(doc(alice(), 'profiles/alice'), P({ photo: 'data:image/jpeg;base64,' + 'A'.repeat(140000) })));
    await assertFails(setDoc(doc(alice(), 'profiles/alice'), P({ email: 'a@b.c' })));
    await assertSucceeds(setDoc(doc(alice(), 'profiles/alice'), P({ photo: 'https://lh3.googleusercontent.com/a/x=s96-c' })));
  });
});

describe('requests → connection', () => {
  it('bob asks alice; alice accepts in one batch; both become viewers with their own levels', async () => {
    // bob → alice, bob lets alice see "family"
    const b = writeBatch(bob());
    b.set(doc(bob(), 'users/alice/requests/bob'), { from: 'bob', level: 'family', createdAt: 1 });
    b.set(doc(bob(), 'users/bob/outgoing/alice'), { to: 'alice', level: 'family', createdAt: 1 });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/requests')));
    await assertFails(getDocs(collection(carol(), 'users/alice/requests')));

    const a = writeBatch(alice());
    a.set(doc(alice(), 'users/alice/viewers/bob'), { level: 'friend', since: 1 });   // alice lets bob see "friend"
    a.set(doc(alice(), 'users/bob/viewers/alice'), { level: 'family', since: 1 });   // as bob offered
    a.delete(doc(alice(), 'users/alice/requests/bob'));
    await assertSucceeds(a.commit());
    await assertSucceeds(getDoc(doc(bob(), 'users/alice/viewers/bob')));             // bob can see his own level
  });

  it('cannot upgrade yourself, add yourself without a request, or forge requests', async () => {
    await assertFails(setDoc(doc(alice(), 'users/bob/viewers/alice'), { level: 'family', since: 1 }));      // no request
    await admin(db => setDoc(doc(db, 'users/alice/requests/bob'), { from: 'bob', level: 'friend', createdAt: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/bob/viewers/alice'), { level: 'family', since: 1 }));      // more than offered
    await assertSucceeds(setDoc(doc(alice(), 'users/bob/viewers/alice'), { level: 'friend', since: 1 }));
    await assertFails(updateDoc(doc(alice(), 'users/bob/viewers/alice'), { level: 'family' }));             // only bob changes it
    await assertSucceeds(updateDoc(doc(bob(), 'users/bob/viewers/alice'), { level: 'family' }));
    await assertFails(setDoc(doc(carol(), 'users/alice/requests/bob'), { from: 'bob', level: 'family', createdAt: 1 })); // pretending
    await assertFails(setDoc(doc(carol(), 'users/carol/requests/carol'), { from: 'carol', level: 'family', createdAt: 1 }));
    await assertFails(setDoc(doc(carol(), 'users/alice/requests/carol'), { from: 'carol', level: 'boss', createdAt: 1 }));
  });

  it('either side can disconnect', async () => {
    await admin(async db => {
      await setDoc(doc(db, 'users/alice/viewers/bob'), { level: 'friend', since: 1 });
      await setDoc(doc(db, 'users/bob/viewers/alice'), { level: 'friend', since: 1 });
    });
    const b = writeBatch(bob());
    b.delete(doc(bob(), 'users/bob/viewers/alice'));
    b.delete(doc(bob(), 'users/alice/viewers/bob'));
    await assertSucceeds(b.commit());
    await assertFails(deleteDoc(doc(carol(), 'users/alice/viewers/bob')));
  });
});

describe('viewing shared tasks', () => {
  async function seed(level) {
    await admin(async db => {
      await setDoc(doc(db, 'users/alice/viewers/bob'), { level, since: 1 });
      await setDoc(doc(db, 'users/alice/tasks/near'),    TT('near', today));
      await setDoc(doc(db, 'users/alice/tasks/far'),     TT('far', today + 10));
      await setDoc(doc(db, 'users/alice/tasks/secret'),  TT('secret', today, { private: true }));
      await setDoc(doc(db, 'users/alice/series/s1'),     { id: 's1', title: 'Meds', rule: { freq: 'daily', startDate: dateOf(today) }, updatedAt: 1, private: false, syncedAt: 1 });
      await setDoc(doc(db, 'users/alice/series/s2'),     { id: 's2', title: 'Diary', rule: { freq: 'daily', startDate: dateOf(today) }, updatedAt: 1, private: true, syncedAt: 1 });
    });
  }

  it('friend: only non-private tasks within a few days, read-only', async () => {
    await seed('friend');
    const db = bob();
    const tasks = collection(db, 'users/alice/tasks');
    await assertSucceeds(getDocs(query(tasks, where('private', '==', false), where('day', '>=', today - 1), where('day', '<=', today + 1))));
    await assertFails(getDocs(query(tasks, where('private', '==', false))));                       // no date limit
    await assertFails(getDocs(query(tasks, where('day', '>=', today - 1), where('day', '<=', today + 1))));  // could include private
    await assertSucceeds(getDoc(doc(db, 'users/alice/tasks/near')));
    await assertFails(getDoc(doc(db, 'users/alice/tasks/far')));
    await assertFails(getDoc(doc(db, 'users/alice/tasks/secret')));
    await assertSucceeds(getDocs(query(collection(db, 'users/alice/series'), where('private', '==', false))));
    await assertFails(getDoc(doc(db, 'users/alice/series/s2')));
    await assertFails(updateDoc(doc(db, 'users/alice/tasks/near'), { done: true, updatedAt: 2, syncedAt: serverTimestamp() }));
  });

  it('family: every non-private task, and can tick / untick only', async () => {
    await seed('family');
    const db = bob();
    await assertSucceeds(getDocs(query(collection(db, 'users/alice/tasks'), where('private', '==', false))));
    await assertSucceeds(getDoc(doc(db, 'users/alice/tasks/far')));
    await assertFails(getDoc(doc(db, 'users/alice/tasks/secret')));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/tasks/near'), { done: true, updatedAt: 2, syncedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'users/alice/tasks/near'), { done: false, updatedAt: 3, syncedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users/alice/tasks/near'), { title: 'Hacked', updatedAt: 4, syncedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users/alice/tasks/secret'), { done: true, updatedAt: 4, syncedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users/alice/tasks/near'), { done: true, updatedAt: 4, syncedAt: 5 }));
    await assertFails(deleteDoc(doc(db, 'users/alice/tasks/near')));
    await assertFails(setDoc(doc(db, 'users/alice/tasks/new'), { ...TT('new', today), syncedAt: serverTimestamp() }));  // can't add tasks
  });

  it('family: first tick of a repeat copy creates it; must match a shared series', async () => {
    await seed('family');
    const db = bob();
    const id = `s1_${dateOf(today)}_0`;
    const occ = { id, date: dateOf(today), title: 'Meds', notes: '', done: true, order: 0, reminderAt: null,
      createdAt: 1, updatedAt: 2, deleted: false, private: false, seriesId: 's1', slot: 0, day: today, syncedAt: serverTimestamp() };
    await assertFails(setDoc(doc(db, `users/alice/tasks/s1_${dateOf(today)}_1`), occ));           // id mismatch
    await assertFails(setDoc(doc(db, `users/alice/tasks/s2_${dateOf(today)}_0`), { ...occ, id: `s2_${dateOf(today)}_0`, seriesId: 's2', title: 'Diary' }));  // private series
    await assertFails(setDoc(doc(db, `users/alice/tasks/${id}`), { ...occ, title: 'Other' }));    // title must match
    await assertSucceeds(setDoc(doc(db, `users/alice/tasks/${id}`), occ));
  });

  it('strangers and removed contacts see nothing', async () => {
    await seed('family');
    await assertFails(getDoc(doc(carol(), 'users/alice/tasks/near')));
    await assertFails(getDocs(query(collection(carol(), 'users/alice/tasks'), where('private', '==', false))));
    await admin(db => deleteDoc(doc(db, 'users/alice/viewers/bob')));
    await assertFails(getDoc(doc(bob(), 'users/alice/tasks/near')));
  });
});
