/**
 * DYDTT — Friend codes
 * 8 characters, mixed-case letters and digits (62^8 ≈ 218 trillion combinations).
 * Look-alike characters (0/O, 1/l/I) are kept out so codes are easy to read aloud.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const CODE_LENGTH   = 8;
const CODE_RE = new RegExp(`^[A-Za-z0-9]{${CODE_LENGTH}}$`);

/** Random code from crypto.getRandomValues (no modulo bias). */
export function generateCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const max = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of random(16)) {
      if (b < max && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Valid shape? (Codes are case-sensitive.) */
export function isValidCode(code) {
  return CODE_RE.test(code ?? '');
}

/** Clean up what someone typed or pasted: drop spaces/dashes. */
export function normaliseCode(input) {
  return String(input ?? '').replace(/[\s-]/g, '');
}
