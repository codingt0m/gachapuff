/**
 * Renders the PWA icons from one SVG. Output is committed (small, deterministic).
 * Usage: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'icons');

/** The puff mark on the night-club background. `inset` leaves room for maskable crops. */
function iconSvg(inset: number, rounded: boolean): string {
  const size = 512;
  const inner = size - inset * 2;
  const scale = inner / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="35%" r="75%">
      <stop offset="0" stop-color="#16624a"/><stop offset="1" stop-color="#0a3326"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ef4a3f"/><stop offset="0.5" stop-color="#d6312b"/><stop offset="1" stop-color="#8e1914"/>
    </linearGradient>
    <linearGradient id="smoke" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#f2e8d5"/><stop offset="1" stop-color="#f5cf6e"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <path d="M30 20c-6-2-6-9 0-10c-2-6 7-9 10-4c5-3 11 2 8 7c4 3 0 9-5 7" fill="none" stroke="url(#smoke)" stroke-width="4" stroke-linecap="round"/>
    <rect x="22" y="18" width="10" height="8" rx="2.5" fill="#121212" stroke="#121212" stroke-width="2.5"/>
    <rect x="16" y="24" width="22" height="34" rx="7" fill="url(#body)" stroke="#121212" stroke-width="3"/>
    <rect x="20" y="29" width="4" height="22" rx="2" fill="#fff" opacity="0.45"/>
    <circle cx="27" cy="51" r="2.5" fill="#e2a93b"/>
  </g>
</svg>`;
}

await mkdir(OUT, { recursive: true });
const standard = iconSvg(48, true);
const maskable = iconSvg(110, false);
await writeFile(path.join(OUT, 'icon.svg'), standard);
await sharp(Buffer.from(standard)).resize(192, 192).png().toFile(path.join(OUT, 'icon-192.png'));
await sharp(Buffer.from(standard)).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
await sharp(Buffer.from(maskable))
  .resize(512, 512)
  .png()
  .toFile(path.join(OUT, 'icon-maskable-512.png'));
console.info(`Icons written to ${OUT}`);
