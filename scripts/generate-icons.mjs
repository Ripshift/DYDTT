/**
 * DYDTT Phase 1 — Icon Generator
 * Run with: pnpm icons
 * Requires: pnpm approve-builds (for sharp)
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC  = resolve(__dirname, '../public/icons/source.svg');
const DEST = resolve(__dirname, '../public/icons');

if (!existsSync(SRC)) {
  console.error(`[Icons] source.svg not found at ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

const SIZES = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];

console.info('[Icons] Generating standard sizes...');

for (const size of SIZES) {
  const out = `${DEST}/icon-${size}x${size}.png`;
  await sharp(SRC).resize(size, size).png().toFile(out);
  console.info(`  ✓ icon-${size}x${size}.png`);
}

// Maskable — artwork scaled to 80% with dark padding
console.info('[Icons] Generating maskable icon...');
await sharp(SRC)
  .resize(410, 410)
  .extend({
    top: 51, bottom: 51, left: 51, right: 51,
    background: { r: 20, g: 20, b: 20, alpha: 1 },
  })
  .png()
  .toFile(`${DEST}/icon-512x512-maskable.png`);
console.info('  ✓ icon-512x512-maskable.png');

// Apple touch icon — 180px, solid background (no alpha)
console.info('[Icons] Generating apple-touch-icon...');
await sharp(SRC)
  .resize(160, 160)
  .extend({
    top: 10, bottom: 10, left: 10, right: 10,
    background: { r: 20, g: 20, b: 20, alpha: 1 },
  })
  .flatten({ background: { r: 20, g: 20, b: 20 } })
  .png()
  .toFile(`${DEST}/apple-touch-icon.png`);
console.info('  ✓ apple-touch-icon.png');

// Monochrome — greyscale version for badge
console.info('[Icons] Generating monochrome icon...');
await sharp(SRC)
  .resize(512, 512)
  .greyscale()
  .png()
  .toFile(`${DEST}/icon-monochrome.png`);
console.info('  ✓ icon-monochrome.png');

// Favicon 32 and 16 already covered above

console.info(`\n[Icons] Done — ${SIZES.length + 3} files written to public/icons/`);
