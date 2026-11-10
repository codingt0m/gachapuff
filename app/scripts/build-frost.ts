/**
 * Draws the frost fronds tiled along the edges of frosted puffs in the album thumbnails
 * (original art, generated). One tile grows rightwards from its left edge, the other is
 * its mirror. Output is committed (small, deterministic). Usage: npm run frost
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'src', 'ui', 'assets', 'finishes');
const W = 40;
const H = 64;
/** Fronds: start height on the edge, length, angle (radians, 0 = straight in). */
const FRONDS: [number, number, number][] = [
  [6, 30, 0.12],
  [20, 18, -0.2],
  [31, 36, 0.05],
  [45, 22, 0.25],
  [56, 27, -0.1],
];
/** Angle between a frond's spine and its barbs. */
const BARB_ANGLE = 1;

let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const f = (n: number) => +n.toFixed(1);

const lines: string[] = [];
const stars: string[] = [];
for (const [y0, length, angle] of FRONDS) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  lines.push(`M0 ${f(y0)}L${f(dx * length)} ${f(y0 + dy * length)}`);
  // Herringbone barbs, shorter towards the tip.
  const barbs = Math.round(length / 3.2);
  for (let i = 1; i < barbs; i++) {
    const t = i / barbs;
    const x = dx * length * t;
    const y = y0 + dy * length * t;
    const barb = (1 - t) * length * 0.42 * (0.7 + random() * 0.5);
    for (const side of [-1, 1]) {
      const a = angle + side * BARB_ANGLE;
      lines.push(`M${f(x)} ${f(y)}l${f(Math.cos(a) * barb)} ${f(Math.sin(a) * barb)}`);
    }
  }
  // A glint on most tips.
  if (random() > 0.3) {
    const x = dx * length;
    const y = y0 + dy * length;
    stars.push(`M${f(x - 2.4)} ${f(y)}h4.8M${f(x)} ${f(y - 2.4)}v4.8`);
  }
}

const body =
  `<path d="${lines.join('')}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width=".9" stroke-linecap="round"/>` +
  `<path d="${stars.join('')}" stroke="#fff" stroke-width=".8" stroke-linecap="round"/>`;
const svg = (content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${content}</svg>\n`;

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'frost-left.svg'), svg(body));
writeFileSync(
  path.join(OUT, 'frost-right.svg'),
  svg(`<g transform="matrix(-1 0 0 1 ${W} 0)">${body}</g>`),
);
console.info(`Frost fronds written to ${OUT}`);
