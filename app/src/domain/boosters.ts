import type { BoosterStock, GameConfig } from './types.ts';

type Regen = GameConfig['regen'];

/**
 * Credits the boosters regenerated since `lastRegenAt`.
 * While the stock is full the timer is idle: it restarts when a booster is used.
 */
export function applyRegen(s: BoosterStock, now: number, regen: Regen): BoosterStock {
  if (s.stock >= regen.maxStock) return { stock: s.stock, lastRegenAt: now };
  // The clock moved backwards: restart the period instead of waiting for ever.
  if (now < s.lastRegenAt) return { stock: s.stock, lastRegenAt: now };
  const gained = Math.floor((now - s.lastRegenAt) / regen.intervalMs);
  if (gained <= 0) return s;
  const stock = Math.min(regen.maxStock, s.stock + gained);
  return {
    stock,
    lastRegenAt: stock >= regen.maxStock ? now : s.lastRegenAt + gained * regen.intervalMs,
  };
}

/** When the next booster arrives, or null when the stock is full. */
export function nextBoosterAt(s: BoosterStock, regen: Regen): number | null {
  return s.stock >= regen.maxStock ? null : s.lastRegenAt + regen.intervalMs;
}

/** Uses one booster (after regeneration). Throws when none is available. */
export function consumeBooster(s: BoosterStock, now: number, regen: Regen): BoosterStock {
  const current = applyRegen(s, now, regen);
  if (current.stock <= 0) throw new Error('No booster available');
  return { stock: current.stock - 1, lastRegenAt: current.lastRegenAt };
}
