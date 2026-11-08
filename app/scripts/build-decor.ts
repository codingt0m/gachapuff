/**
 * Draws the palm silhouettes of the "Sunset Drive" backdrop (original art, generated).
 * Output is committed (small, deterministic). Usage: npm run decor
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

type Pt = [number, number];
/** A frond: quadratic control point and tip, relative to the crown. */
type Frond = [Pt, Pt];

const OUT = path.resolve(import.meta.dirname, '..', 'src', 'ui', 'assets', 'decor');
const W = 520;
const H = 820;
const NEAR = '#22093f';
const FAR = '#3d1466';

const round = (n: number) => Math.round(n);

function quad(a: Pt, b: Pt, c: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
    u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
  ];
}

/** Unit tangent of the curve at t. */
function tangent(a: Pt, b: Pt, c: Pt, t: number, step: number): Pt {
  const p = quad(a, b, c, t);
  const n = quad(a, b, c, Math.min(1, t + step));
  const l = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
  return [(n[0] - p[0]) / l, (n[1] - p[1]) / l];
}

function signedArea(pts: Pt[]): number {
  let s = 0;
  pts.forEach((p, i) => {
    const n = pts[(i + 1) % pts.length] ?? p;
    s += p[0] * n[1] - n[0] * p[1];
  });
  return s;
}

/** Closed polygon, always wound the same way so overlaps never punch holes. */
function poly(pts: Pt[]): string {
  const ordered = signedArea(pts) < 0 ? [...pts].reverse() : pts;
  return `M${ordered.map((p) => `${round(p[0])} ${round(p[1])}`).join('L')}Z`;
}

function palm(base: Pt, bend: Pt, crown: Pt, fronds: Frond[], scale = 1): string {
  let d = '';
  // Trunk: a tapered ribbon along a curve.
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = quad(base, bend, crown, t);
    const [dx, dy] = tangent(base, bend, crown, t, 0.02);
    const w = (20 - 12 * t) * scale;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  d += poly([...left, ...right.reverse()]);

  for (const [ctrl, tipRel] of fronds) {
    const c: Pt = [crown[0] + ctrl[0] * scale, crown[1] + ctrl[1] * scale];
    const tip: Pt = [crown[0] + tipRel[0] * scale, crown[1] + tipRel[1] * scale];
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = quad(crown, c, tip, t);
      const [dx, dy] = tangent(crown, c, tip, t, 0.01);
      const w = (5 * (1 - t) + 0.8) * scale;
      top.push([p[0] - dy * w, p[1] + dx * w]);
      bottom.push([p[0] + dy * w, p[1] - dx * w]);
      if (i <= 1 || i >= steps) continue;
      // Leaflets on both sides, swept towards the tip and pulled down by gravity.
      const len = (46 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.45) + 8) * scale;
      const bw = (4.6 * (1 - t) + 1.6) * scale;
      for (const side of [1, -1]) {
        let nx = -dy * side * 0.55 + dx * 0.45;
        let ny = dx * side * 0.55 + dy * 0.45 + 0.75;
        const nl = Math.hypot(nx, ny);
        nx /= nl;
        ny /= nl;
        d += poly([
          [p[0] - dx * bw, p[1] - dy * bw],
          [p[0] + nx * len, p[1] + ny * len],
          [p[0] + dx * bw, p[1] + dy * bw],
        ]);
      }
    }
    d += poly([...top, ...bottom.reverse()]);
  }
  return d;
}

const FRONDS_A: Frond[] = [
  [
    [-72, -68],
    [-194, 36],
  ],
  [
    [-62, -108],
    [-158, -96],
  ],
  [
    [-8, -108],
    [-46, -160],
  ],
  [
    [46, -114],
    [108, -138],
  ],
  [
    [88, -78],
    [174, -10],
  ],
  [
    [100, -10],
    [146, 120],
  ],
  [
    [-62, -2],
    [-118, 134],
  ],
  [
    [24, 12],
    [40, 142],
  ],
];
const FRONDS_B: Frond[] = [
  [
    [-80, -50],
    [-180, 60],
  ],
  [
    [-40, -110],
    [-120, -130],
  ],
  [
    [20, -112],
    [40, -170],
  ],
  [
    [80, -90],
    [160, -80],
  ],
  [
    [96, -30],
    [150, 100],
  ],
  [
    [-50, 10],
    [-90, 140],
  ],
];

const svg = (align: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${align} meet">${body}</svg>\n`;

const left = svg(
  'xMinYMax',
  `<path fill="${FAR}" d="${palm([380, 830], [400, 620], [356, 470], FRONDS_B, 0.62)}"/>` +
    `<path fill="${NEAR}" d="${palm([118, 830], [150, 470], [250, 236], FRONDS_A)}"/>`,
);
const right = svg(
  'xMaxYMax',
  `<g transform="matrix(-1 0 0 1 ${W} 0)">` +
    `<path fill="${FAR}" d="${palm([420, 830], [430, 660], [390, 500], FRONDS_A, 0.55)}"/>` +
    `<path fill="${NEAR}" d="${palm([150, 830], [170, 500], [262, 270], FRONDS_B, 1.05)}"/></g>`,
);

writeFileSync(path.join(OUT, 'palms-left.svg'), left);
writeFileSync(path.join(OUT, 'palms-right.svg'), right);
console.info(`Palms written to ${OUT}`);
