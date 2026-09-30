# DYDTT — Icon Generation Guide

All icons are generated from a single source SVG using the `sharp` CLI.
Run `pnpm icons` after editing `public/icons/source.svg`.

---

## Required Icon Files

| File | Size | Usage |
|---|---|---|
| icon-72x72.png | 72x72 | Android legacy |
| icon-96x96.png | 96x96 | Android legacy |
| icon-128x128.png | 128x128 | Chrome Web Store |
| icon-144x144.png | 144x144 | Android / Windows |
| icon-152x152.png | 152x152 | iPad (non-retina) |
| icon-192x192.png | 192x192 | Android home screen |
| icon-384x384.png | 384x384 | Android splash |
| icon-512x512.png | 512x512 | PWA manifest required |
| icon-512x512-maskable.png | 512x512 | Maskable (safe zone 80%) |
| icon-monochrome.png | 512x512 | Monochrome badge |
| apple-touch-icon.png | 180x180 | iOS home screen |
| favicon-32x32.png | 32x32 | Browser tab |
| favicon-16x16.png | 16x16 | Browser tab small |
| og-image.png | 1200x630 | Open Graph social preview |

---

## Generation Script (scripts/generate-icons.mjs)

  import sharp from 'sharp';
  import { mkdirSync } from 'fs';

  const SRC  = 'public/icons/source.svg';
  const DEST = 'public/icons';

  const sizes = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];

  mkdirSync(DEST, { recursive: true });

  for (const size of sizes) {
    await sharp(SRC)
      .resize(size, size)
      .png()
      .toFile(`${DEST}/icon-${size}x${size}.png`);
    console.log(`Generated ${size}x${size}`);
  }

  // Maskable — add 10% padding inside the safe zone
  await sharp(SRC)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51,
              background: { r: 20, g: 20, b: 20, alpha: 1 } })
    .png()
    .toFile(`${DEST}/icon-512x512-maskable.png`);

  // Apple touch icon (180px, no alpha — iOS requires solid bg)
  await sharp(SRC)
    .resize(160, 160)
    .extend({ top: 10, bottom: 10, left: 10, right: 10,
              background: { r: 20, g: 20, b: 20, alpha: 1 } })
    .flatten({ background: { r: 20, g: 20, b: 20 } })
    .png()
    .toFile(`${DEST}/apple-touch-icon.png`);

  console.log('All icons generated.');

---

## Design Spec for source.svg

- Canvas: 512x512 px
- Background: #141414 (fill entire canvas — maskable safe zone is inner 80%)
- Foreground: Gold logotype or monogram — #C9A84C
- No transparency in the icon background (required for iOS)
- Maskable safe zone: 204x204 px centred (40% padding each side)
- Keep all critical content inside the safe zone

---

## Verification Checklist

- [ ] All 14 icon files present in public/icons/
- [ ] manifest.json icons array references all sizes
- [ ] Maskable icon safe zone passes Google Maskable Icon Editor
- [ ] Apple touch icon renders correctly on iOS Add to Home Screen
- [ ] Favicon shows in Chrome, Firefox, Edge browser tabs
- [ ] OG image displays correctly when URL shared on Slack / Twitter
