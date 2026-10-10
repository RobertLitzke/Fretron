// Rasterize public/icons/icon.svg into the PNGs the manifest and iOS need.
// The SVG is the only source; run `npm run icons` after editing it.
//
// The maskable variant is padded because Android crops maskable icons to an
// arbitrary shape and only guarantees the centre 80%.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(here, '..', 'public', 'icons');
const svg = await readFile(path.join(iconsDir, 'icon.svg'));

/** Keep in sync with --bg in src/app/styles/tokens.css. */
const BG = { r: 0x03, g: 0x06, b: 0x0f, alpha: 1 };

async function render(size, out) {
  const png = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: BG })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(iconsDir, out), png);
  return `${out} (${size}x${size}, ${(png.length / 1024).toFixed(1)} kB)`;
}

async function renderMaskable(size, out) {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: art, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(iconsDir, out), png);
  return `${out} (${size}x${size} maskable, ${(png.length / 1024).toFixed(1)} kB)`;
}

const results = await Promise.all([
  render(192, 'icon-192.png'),
  render(512, 'icon-512.png'),
  renderMaskable(512, 'icon-512-maskable.png'),
]);
for (const line of results) console.log('wrote', line);
