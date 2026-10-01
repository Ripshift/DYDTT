/**
 * DYDTT — Profile pictures
 *
 * Firebase Storage needs the paid Blaze plan, so profile pictures are shrunk
 * on the device and saved inside the Firestore profile as a small image.
 *
 * Limits (close to Google's own profile photos, which are square and shown
 * at 96 px by default):
 *   • input:  JPEG / PNG / WebP / GIF, up to 10 MB
 *   • output: square, centre-cropped, 256 × 256 px, JPEG, ≤ 100 KB
 */

export const MAX_INPUT_BYTES  = 10 * 1024 * 1024;
export const AVATAR_SIZE      = 256;
export const MAX_OUTPUT_CHARS = 140_000;            // ≈ 100 KB as a base64 data URL
export const ACCEPTED_TYPES   = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Centre square crop of a w × h image. */
export function squareCrop(w, h) {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

/** Check a picked file before reading it. Returns an error message or null. */
export function checkImageFile(file) {
  if (!file) return 'No file chosen.';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a JPEG, PNG, WebP or GIF image.';
  if (file.size > MAX_INPUT_BYTES) return `That image is too big (${(file.size / 1048576).toFixed(1)} MB). The limit is 10 MB.`;
  return null;
}

/**
 * Turn a picked image file into a 256 × 256 JPEG data URL.
 * Lowers JPEG quality until it fits the size limit.
 */
export async function makeAvatar(file) {
  const err = checkImageFile(file);
  if (err) throw new Error(err);
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#1E1E1E';                         // transparent PNGs get the app background
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close?.();
  for (const q of [0.85, 0.75, 0.65, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_OUTPUT_CHARS) return url;
  }
  throw new Error('Could not make that image small enough. Try a different picture.');
}

/** A photo value is safe to show / store: our own data URL, or an https link (e.g. Google). */
export function isSafePhoto(photo) {
  return typeof photo === 'string'
    && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || /^https:\/\/[^\s"'<>]+$/.test(photo))
    && photo.length <= MAX_OUTPUT_CHARS;
}

/** Build a round avatar element: photo if there is one, otherwise the first letter. */
export function avatarEl({ name, photo }, size = 40) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.width = el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.42)}px`;
  if (isSafePhoto(photo)) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.width = img.height = size;
    el.appendChild(img);
  } else {
    el.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
  }
  return el;
}
