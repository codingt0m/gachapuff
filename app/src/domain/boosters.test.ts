import { describe, expect, it } from 'vitest';
import { applyRegen, consumeBooster, nextBoosterAt } from './boosters.ts';

const regen = { intervalMs: 1000, maxStock: 2, initialStock: 2 };

describe('booster regeneration', () => {
  it('keeps the timer idle while the stock is full', () => {
    expect(applyRegen({ stock: 2, lastRegenAt: 0 }, 5000, regen)).toEqual({
      stock: 2,
      lastRegenAt: 5000,
    });
    expect(nextBoosterAt({ stock: 2, lastRegenAt: 0 }, regen)).toBeNull();
  });

  it('credits one booster per elapsed interval, keeping the remainder', () => {
    expect(applyRegen({ stock: 0, lastRegenAt: 0 }, 1500, regen)).toEqual({
      stock: 1,
      lastRegenAt: 1000,
    });
    expect(nextBoosterAt({ stock: 1, lastRegenAt: 1000 }, regen)).toBe(2000);
  });

  it('caps at the max stock and resets the timer', () => {
    expect(applyRegen({ stock: 0, lastRegenAt: 0 }, 10_000, regen)).toEqual({
      stock: 2,
      lastRegenAt: 10_000,
    });
  });

  it('does nothing before the interval elapses', () => {
    const s = { stock: 1, lastRegenAt: 0 };
    expect(applyRegen(s, 999, regen)).toBe(s);
  });

  it('restarts the period when the clock goes backwards', () => {
    expect(applyRegen({ stock: 0, lastRegenAt: 5000 }, 1000, regen)).toEqual({
      stock: 0,
      lastRegenAt: 1000,
    });
  });
});

describe('consumeBooster', () => {
  it('starts the timer when using a booster from a full stock', () => {
    expect(consumeBooster({ stock: 2, lastRegenAt: 0 }, 7000, regen)).toEqual({
      stock: 1,
      lastRegenAt: 7000,
    });
  });

  it('keeps the running timer when the stock was not full', () => {
    expect(consumeBooster({ stock: 1, lastRegenAt: 500 }, 900, regen)).toEqual({
      stock: 0,
      lastRegenAt: 500,
    });
  });

  it('applies regeneration first', () => {
    expect(consumeBooster({ stock: 0, lastRegenAt: 0 }, 1200, regen)).toEqual({
      stock: 0,
      lastRegenAt: 1000,
    });
  });

  it('throws when no booster is available', () => {
    expect(() => consumeBooster({ stock: 0, lastRegenAt: 0 }, 10, regen)).toThrow();
  });
});
