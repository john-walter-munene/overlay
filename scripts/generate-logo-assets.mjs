/**
 * Derive all Overlay Picks logo/icon assets from the two brand source images.
 *
 * Sources (apps/web/brand/, not web-served):
 *   - logo-mark-source.png  → the gold arrow-in-circle mark on a white field
 *   - logo-full-source.png  → the full mark + "Overlay Picks" wordmark on dark
 *
 * Outputs:
 *   apps/web/public/logo-mark.png   transparent mark  (header, both themes)
 *   apps/web/public/icon-192.png    mark on dark tile (PWA + push, sw.js)
 *   apps/web/public/icon-512.png    mark on dark tile (PWA install / maskable)
 *   apps/web/public/logo-full.png   1200x630 social/OG card
 *   apps/web/app/icon.png           favicon (transparent mark, Next convention)
 *   apps/web/app/apple-icon.png     iOS home-screen tile (mark on dark)
 *
 * Run: node scripts/generate-logo-assets.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'apps/web/brand');
const pub = join(root, 'apps/web/public');
const app = join(root, 'apps/web/app');

const MARK_SRC = join(brand, 'logo-mark-source.png');
const FULL_SRC = join(brand, 'logo-full-source.png');
const DARK = { r: 0x0c, g: 0x0b, b: 0x0a, alpha: 1 }; // --bg dark theme
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Trim the white field around the mark and key white → transparent using
 * per-pixel colour saturation (white has zero saturation, gold has high),
 * yielding a tight, transparent, anti-aliased mark buffer.
 */
async function keyedMarkBuffer() {
  const trimmed = await sharp(MARK_SRC)
    .trim({ threshold: 12 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = trimmed;
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    data[i + 3] = Math.min(255, sat * 4); // white→0, gold→opaque, edges blend
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  })
    .png()
    .toBuffer();
}

async function squareFromMark(mark, size, padRatio, background) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const resized = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  const mark = await keyedMarkBuffer();

  // Transparent mark for the header + favicon.
  const transparentMark = await squareFromMark(mark, 512, 0.05, TRANSPARENT);
  await sharp(transparentMark).resize(256, 256).toFile(join(pub, 'logo-mark.png'));
  await sharp(transparentMark).resize(256, 256).toFile(join(app, 'icon.png'));

  // Dark tiles for app / PWA icons (opaque background, safe padding).
  await sharp(await squareFromMark(mark, 192, 0.16, DARK)).toFile(
    join(pub, 'icon-192.png'),
  );
  await sharp(await squareFromMark(mark, 512, 0.2, DARK)).toFile(
    join(pub, 'icon-512.png'),
  );
  await sharp(await squareFromMark(mark, 180, 0.16, DARK)).toFile(
    join(app, 'apple-icon.png'),
  );

  // 1200x630 Open Graph / social card: center-crop the full wordmark logo so
  // its own dark gradient fills the frame edge-to-edge (no seam).
  await sharp(FULL_SRC)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .png()
    .toFile(join(pub, 'logo-full.png'));

  console.log('Generated logo assets:');
  for (const f of [
    'apps/web/public/logo-mark.png',
    'apps/web/public/icon-192.png',
    'apps/web/public/icon-512.png',
    'apps/web/public/logo-full.png',
    'apps/web/app/icon.png',
    'apps/web/app/apple-icon.png',
  ]) {
    console.log('  ✓', f);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
