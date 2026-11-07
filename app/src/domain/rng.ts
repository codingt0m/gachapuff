/** Injectable random source returning floats in [0, 1). */
export interface Rng {
  next(): number;
}

export const mathRandomRng: Rng = { next: () => Math.random() };

/** Deterministic RNG (mulberry32) for tests, simulations and seeded dev sessions. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Integer in [min, max] (inclusive). */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function randomBetween(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng.next() * (max - min);
}

export function pickUniform<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickUniform: empty list');
  return items[Math.floor(rng.next() * items.length)] as T;
}

/** Picks an item proportionally to its (non-negative) weight. */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const positive = entries.filter(([, w]) => w > 0);
  const total = positive.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) throw new Error('pickWeighted: no positive weight');
  let r = rng.next() * total;
  for (const [item, weight] of positive) {
    r -= weight;
    if (r < 0) return item;
  }
  // Floating point leftovers land on the last positive entry.
  return (positive[positive.length - 1] as readonly [T, number])[0];
}
