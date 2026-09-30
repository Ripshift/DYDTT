/**
 * DYDTT Phase 1 — VAPID Utilities
 * Key conversion and validation helpers for Web Push.
 */

/**
 * Convert a VAPID public key from URL-safe base64 to Uint8Array.
 * Required by pushManager.subscribe({ applicationServerKey }).
 *
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64String) {
  if (!base64String) throw new Error('[VAPID] Public key is missing.');

  const padding   = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64    = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData   = atob(base64);
  const outputArr = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArr[i] = rawData.charCodeAt(i);
  }

  return outputArr;
}

/**
 * Validate that a VAPID public key looks correct.
 * A valid uncompressed P-256 public key is 65 bytes (130 hex chars).
 * In URL-safe base64 that is 87 characters (before padding).
 *
 * @param {string} key
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateVapidKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'Key is missing or not a string.' };
  }
  if (key.length < 80 || key.length > 92) {
    return { valid: false, reason: `Key length ${key.length} is outside expected range 80-92.` };
  }
  if (!/^[A-Za-z0-9\-_]+={0,2}$/.test(key)) {
    return { valid: false, reason: 'Key contains invalid characters.' };
  }
  return { valid: true };
}

/**
 * Convert a PushSubscription to a plain object safe to POST to the server.
 *
 * @param {PushSubscription} subscription
 * @returns {{ endpoint: string, keys: { p256dh: string, auth: string } }}
 */
export function serialiseSubscription(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint ?? '',
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth:   json.keys?.auth   ?? '',
    },
  };
}

/**
 * Generate a test VAPID key pair hint for developers.
 * This does NOT generate real keys — it just prints the CLI command.
 * Real keys must be generated server-side with: npx web-push generate-vapid-keys --json
 */
export function printVapidKeygenHint() {
  console.info('[VAPID] To generate a real key pair, run:');
  console.info('  npx web-push generate-vapid-keys --json');
  console.info('Then add VITE_VAPID_PUBLIC_KEY to your .env.local file.');
}
