import { pickUniform, type Rng } from './rng.ts';
import { smokeDef } from './rarity.ts';
import type { GameConfig, NamedColor, Smoke, SmokeKind, SmokeShape } from './types.ts';

/** Two colours of a duo smoke are at least this far apart on the colour wheel (degrees). */
const DUO_MIN_HUE_GAP = 50;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const hueGap = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};

/**
 * Readable French name of a smoke colour: its palette entry, or the closest one for colours
 * drawn before the palette existed (random HSL colours of older saves).
 */
export function colorName(config: GameConfig, hex: string): string {
  const palette = config.smokeColors.palette;
  const exact = palette.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  if (exact) return exact.name;
  const [r, g, b] = rgb(hex);
  let best: NamedColor | undefined;
  let bestDistance = Infinity;
  for (const c of palette) {
    const [pr, pg, pb] = rgb(c.hex);
    // "Redmean" approximation of the perceived distance between two colours.
    const mean = (r + pr) / 2;
    const distance =
      (2 + mean / 256) * (r - pr) ** 2 +
      4 * (g - pg) ** 2 +
      (2 + (255 - mean) / 256) * (b - pb) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [c, distance];
  }
  return best?.name ?? hex;
}

/** Colours shown in a puff's specs ("rose néon, orange"); empty for a white smoke. */
export function smokeColorNames(config: GameConfig, smoke: Smoke): string[] {
  if (smoke.kind === 'white') return [];
  if (smoke.kind === 'rainbow') return ['arc-en-ciel'];
  const colors = 'colors' in smoke ? smoke.colors : [smoke.color];
  return [...new Set(colors.map((c) => colorName(config, c)))];
}

/** Draws `count` different palette colours; duo colours are kept well apart. */
function drawColors(rng: Rng, palette: readonly NamedColor[], count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const free = palette.filter((c) => !colors.includes(c.hex));
    const apart = free.filter((c) => colors.every((x) => hueGap(x, c.hex) >= DUO_MIN_HUE_GAP));
    colors.push(pickUniform(rng, apart.length > 0 ? apart : free).hex);
  }
  return colors;
}

/**
 * Draws the colours of a smoke of the given kind, from the named palette. White stays white,
 * rainbow is the whole spectrum, the gachapuff smoke always has the brand colours.
 */
export function rollSmoke(
  rng: Rng,
  config: GameConfig,
  kind: SmokeKind,
  shape: SmokeShape = 'cloud',
): Smoke {
  const withShape = shape === 'cloud' ? {} : { shape };
  if (kind === 'white' || kind === 'rainbow') return { kind, ...withShape };
  if (kind === 'gachapuff')
    return { kind, colors: [...config.smokeColors.gachapuff], ...withShape };
  const colors = drawColors(rng, config.smokeColors.palette, smokeDef(config, kind).colorCount);
  if (kind === 'solid' || kind === 'glitter') {
    return { kind, color: colors[0] as string, ...withShape };
  }
  return { kind, colors, ...withShape };
}
