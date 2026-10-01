/**
 * DYDTT Phase 1 — Auth Manager
 * All Firebase Auth operations live here.
 * Supports: Google Sign-In, Email/Password Sign-In, Sign-Up, Sign-Out.
 * Calls store.dispatch('AUTH_SET') whenever auth state changes.
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';

import { auth }  from '../firebase.js';
import { store } from '../store.js';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ── Helpers ───────────────────────────────────────────────────────────────

/** Serialise a Firebase User to a plain object safe to store. */
function serialiseUser(user) {
  if (!user) return null;
  return {
    uid:         user.uid,
    email:       user.email,
    displayName: user.displayName,
    photoURL:    user.photoURL,
    emailVerified: user.emailVerified,
  };
}

/** Friendly error messages for common Firebase auth codes. */
function friendlyError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/popup-blocked':        'Popup was blocked — trying redirect instead.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
    'auth/unauthorized-domain':
      `Sign-in isn't allowed from this address (${location.hostname}). Add it under Firebase → Authentication → Settings → Authorized domains.`,
    'auth/operation-not-allowed': 'This sign-in method is turned off in Firebase (Authentication → Sign-in method).',
    'auth/operation-not-supported-in-this-environment':
      'This browser can\'t do Google sign-in here. Open the app over https, or use email and password.',
    'auth/web-storage-unsupported': 'This browser is blocking storage (private mode?), which sign-in needs.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/internal-error':        'Sign-in failed inside Firebase. Check your connection and try again.',
  };
  // Unknown codes: show the code so the problem can be diagnosed
  return map[code] ?? `Something went wrong (${code ?? 'unknown error'}). Please try again.`;
}

// ── Google ────────────────────────────────────────────────────────────────

/**
 * Sign in with Google.
 * Uses popup on desktop; falls back to redirect on mobile if popup is blocked.
 * @returns {{ user: object|null, error: string|null }}
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { user: serialiseUser(result.user), error: null };
  } catch (err) {
    if (err.code === 'auth/popup-blocked') {
      // Mobile fallback — page will redirect then return
      await signInWithRedirect(auth, googleProvider);
      return { user: null, error: null };
    }
    console.error('[Auth] Google sign-in failed:', err.code, err.message);
    return { user: null, error: friendlyError(err.code) };
  }
}

/**
 * Handle the result of a redirect-based Google sign-in.
 * Call this once on app boot.
 */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      store.dispatch('AUTH_SET', { user: serialiseUser(result.user) });
    }
  } catch (err) {
    console.error('[Auth] Redirect result error:', err.code);
  }
}

// ── Email / Password ──────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 * @returns {{ user: object|null, error: string|null }}
 */
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { user: serialiseUser(result.user), error: null };
  } catch (err) {
    return { user: null, error: friendlyError(err.code) };
  }
}

/**
 * Create a new account with email and password.
 * @returns {{ user: object|null, error: string|null }}
 */
export async function signUpWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return { user: serialiseUser(result.user), error: null };
  } catch (err) {
    return { user: null, error: friendlyError(err.code) };
  }
}

/**
 * Send a password reset email.
 * @returns {{ error: string|null }}
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (err) {
    return { error: friendlyError(err.code) };
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────

export async function signOutUser() {
  await signOut(auth);
}

// ── Auth state listener ───────────────────────────────────────────────────

/**
 * Initialise the Firebase auth state listener.
 * Dispatches AUTH_SET to the store whenever auth state changes.
 * Returns the unsubscribe function.
 */
export function initAuth() {
  handleRedirectResult();
  return onAuthStateChanged(auth, (user) => {
    store.dispatch('AUTH_SET', { user: serialiseUser(user) });
  });
}
