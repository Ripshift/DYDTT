import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, collectionGroup, query } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

let env;
const omit = (o, k) => { const c = { ...o }; delete c[k]; return c; };
const T = (over = {}) => ({ id: 't1', date: '2026-10-01', title: 'Walk dog', notes: '', done: false,
  order: 1790000000000, reminderAt: 1790000000000, createdAt: 1790000000000, updatedAt: 1790000000001, ...over });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dydtt',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext('alice').firestore();
const bob   = () => env.authenticatedContext('bob').firestore();
const anon  = () => env.unauthenticatedContext().firestore();

describe('tasks', () => {
  it('owner can create, read, update, tombstone and delete', async () => {
    const db = alice(); const ref = doc(db, 'users/alice/tasks/t1');
    await assertSucceeds(setDoc(ref, T()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, 'users/alice/tasks')));
    await assertSucceeds(updateDoc(ref, { done: true, updatedAt: 1790000000002 }));
    await assertSucceeds(updateDoc(ref, { deleted: true, updatedAt: 1790000000003 }));
    await assertSucceeds(updateDoc(ref, { reminderAt: null, priority: 1, tags: ['home'], remindedAt: null }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('minimal task (only required fields) is fine', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/tasks/t1'),
      { id: 't1', date: '2026-10-01', title: 'x', done: false, updatedAt: 1 }));
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
  ])('rejects %s', async (_, data) => {
    await assertFails(setDoc(doc(alice(), 'users/alice/tasks/t1'), data));
  });

  it('rejects an update that would add a bad field', async () => {
    const ref = doc(alice(), 'users/alice/tasks/t1');
    await setDoc(ref, T());
    await assertFails(updateDoc(ref, { hacked: true }));
  });

  it('allows a task that the reminder worker already stamped with remindedAt', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/tasks/t1'), T({ remindedAt: 1790000000000 })));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/tasks/t1'), { title: 'Walk dog twice', updatedAt: 2 }));
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
