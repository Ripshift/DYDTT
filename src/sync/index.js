/**
 * DYDTT — Sync controller
 * Connects auth state, the store and the sync engine (Firestore adapter).
 */

import { store }              from '../store.js';
import { createSyncEngine }   from './syncEngine.js';
import { choose }             from '../components/Dialog.js';
import { showToast }          from '../utils/toast.js';

let engine = null;

/** Ask what to do with this device's tasks on first sign-in. */
export async function askFirstSync({ localCount, duplicateCount }) {
  const n = `${localCount} task${localCount === 1 ? '' : 's'}`;
  const upload = await choose({
    title:   'Add this device\'s tasks to your account?',
    message: `This device has ${n} that aren't in your account yet. Upload them, or discard them and use what's already in your account.`,
    options: [
      { label: `Upload ${n}`,             value: 'upload',  variant: 'primary' },
      { label: 'Discard this device\'s tasks', value: 'discard', variant: 'danger' },
    ],
    cancelLabel: 'Don\'t sync yet',
  });
  if (!upload) return null;
  if (upload === 'discard') return { upload: false };
  if (!duplicateCount) return { upload: true, duplicates: 'newest' };

  const dup = await choose({
    title:   `${duplicateCount} task${duplicateCount === 1 ? ' is' : 's are'} already in your account`,
    message: 'Some tasks on this device match ones already in your account. Which version should be kept?',
    options: [
      { label: 'Keep the most recent edit',  value: 'newest',  variant: 'primary' },
      { label: 'Replace with this device\'s', value: 'replace' },
      { label: 'Keep the account\'s (don\'t replace)', value: 'keep' },
    ],
    cancelLabel: 'Don\'t sync yet',
  });
  return dup ? { upload: true, duplicates: dup } : null;
}

export async function confirmDialog({ title, message, confirmLabel }) {
  const v = await choose({ title, message, danger: true,
    options: [{ label: confirmLabel, value: true, variant: 'danger' }] });
  return v === true;
}

/**
 * Start syncing. Call once at boot.
 * @param {object} [opts.adapter]  override for tests; defaults to Firestore (lazy-loaded)
 */
export async function initSync({ adapter } = {}) {
  if (!adapter) adapter = (await import('./firestoreAdapter.js')).firestoreAdapter;

  engine = createSyncEngine({
    adapter,
    askFirstSync,
    confirm:        confirmDialog,
    onStatus:       (s) => store.dispatch('SYNC_STATUS', s),
    onRemoteChange: () => store.dispatch('REFRESH'),
  });

  let lastUid = null;
  store.subscribe('user', async (user) => {
    const uid = user?.uid ?? null;
    if (uid === lastUid) return;
    lastUid = uid;
    if (uid) {
      const ok = await engine.start(uid);
      if (ok === false) {
        showToast({ message: 'Signed in, but sync is off for this device. Use "Sync" in the Edit tab to set it up.', timeout: 6000 });
      } else {
        await store.dispatch('REFRESH');
      }
    } else {
      engine.stop();
    }
  });

  // Upload soon after any local change
  let t = null;
  store.subscribe('tasks', () => {
    if (!engine?.uid) return;
    clearTimeout(t);
    t = setTimeout(() => engine.drain(), 800);
  });

  window.addEventListener('online',  () => engine?.drain());
  window.addEventListener('offline', () => store.dispatch('SYNC_STATUS', { status: 'offline' }));
  return engine;
}

/** "Sync" button: start sync if this device isn't linked yet, otherwise sync now. */
export async function syncNow() {
  const uid = store.state.user?.uid;
  if (!engine || !uid) return false;
  if (engine.uid !== uid) {
    const ok = await engine.start(uid);
    if (ok) await store.dispatch('REFRESH');
    return ok;
  }
  await engine.syncNow();
  return true;
}

/** Sign out through the engine so pending changes are uploaded and the device is cleared. */
export async function signOutAndClear(signOutFn) {
  if (engine) {
    const ok = await engine.signOut();
    if (!ok) return false;
  }
  await signOutFn();
  await store.dispatch('REFRESH');
  return true;
}

export function getSyncEngine() { return engine; }
