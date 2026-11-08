import { randomBetween, randomInt, type Rng } from './rng.ts';
import { smokeDef } from './rarity.ts';
import type { GameConfig, Smoke, SmokeKind, SmokeShape } from './types.ts';

/** Max random shift of each gradient hue around its evenly spaced slot (in turns). */
const HUE_JITTER = 0.12;

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function vividColor(rng: Rng, config: GameConfig, hue: number): string {
  const { saturation, lightness } = config.smokeColor;
  return hslToHex(hue, randomBetween(rng, saturation), randomBetween(rng, lightness));
}

/** Draws the colours of a smoke of the given kind. Gradient hues are kept well apart. */
export function rollSmoke(
  rng: Rng,
  config: GameConfig,
  kind: SmokeKind,
  shape: SmokeShape = 'cloud',
): Smoke {
  const withShape = shape === 'cloud' ? {} : { shape };
  if (kind === 'white' || kind === 'rainbow') return { kind, ...withShape };
  const { min, max } = smokeDef(config, kind).colorCount;
  const count = Math.max(1, randomInt(rng, min, max));
  const start = rng.next();
  const colors = Array.from({ length: count }, (_, i) =>
    vividColor(rng, config, (start + i / count + (rng.next() - 0.5) * HUE_JITTER + 1) % 1),
  );
  if (kind === 'solid' || kind === 'glitter') {
    return { kind, color: colors[0] as string, ...withShape };
  }
  return { kind, colors, ...withShape };
}
