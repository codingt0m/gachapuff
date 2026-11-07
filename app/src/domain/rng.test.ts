import { describe, expect, it } from 'vitest';
import { createSeededRng, pickUniform, pickWeighted, randomInt } from './rng.ts';

describe('createSeededRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a.next()).not.toEqual(b.next());
    for (let i = 0; i < 10_000; i++) {
      const v = a.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('pickWeighted', () => {
  it('respects weights', () => {
    const rng = createSeededRng(7);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 20_000; i++)
      counts[
        pickWeighted(rng, [
          ['a', 3],
          ['b', 1],
        ] as const)
      ]++;
    expect(counts.a / 20_000).toBeCloseTo(0.75, 1);
  });

  it('never picks zero-weight entries', () => {
    const rng = createSeededRng(3);
    for (let i = 0; i < 2_000; i++) {
      expect(
        pickWeighted(rng, [
          ['x', 0],
          ['y', 1],
          ['z', 0],
        ] as const),
      ).toBe('y');
    }
  });

  it('rejects tables without positive weight', () => {
    expect(() => pickWeighted(createSeededRng(1), [['x', 0]] as const)).toThrow();
  });
});

describe('helpers', () => {
  it('randomInt is inclusive', () => {
    const rng = createSeededRng(9);
    const seen = new Set(Array.from({ length: 500 }, () => randomInt(rng, 2, 3)));
    expect([...seen].sort()).toEqual([2, 3]);
  });

  it('pickUniform rejects empty lists', () => {
    expect(() => pickUniform(createSeededRng(1), [])).toThrow();
  });
});
