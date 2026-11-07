import { consumeBooster } from './boosters.ts';
import { nextRarity } from './rarity.ts';
import { boosterType, rollBooster, rollForRarity, type Roll } from './roll.ts';
import type { Rng } from './rng.ts';
import type { Catalog, GameConfig, PuffInstance, SaveState } from './types.ts';

/** Everything a state transition needs from the outside world, injected. */
export interface GameContext {
  config: GameConfig;
  catalog: Catalog;
  rng: Rng;
  now: number;
  newId: () => string;
  /** Dev mode: boosters never run out. */
  unlimitedBoosters?: boolean;
}

export interface Pull {
  state: SaveState;
  instance: PuffInstance;
}

function toInstance(roll: Roll, ctx: GameContext, origin: PuffInstance['origin']): PuffInstance {
  return {
    uid: ctx.newId(),
    puffId: roll.puff.id,
    finish: roll.finish,
    smoke: roll.smoke,
    rarity: roll.rarity,
    points: roll.points,
    obtainedAt: ctx.now,
    origin,
  };
}

export function openBooster(state: SaveState, ctx: GameContext, typeId?: string): Pull {
  const boosters = ctx.unlimitedBoosters
    ? state.boosters
    : consumeBooster(state.boosters, ctx.now, ctx.config.regen);
  const type = boosterType(ctx.config, typeId ?? ctx.config.defaultBoosterType);
  const instance = toInstance(rollBooster(ctx.catalog, type, ctx.config, ctx.rng), ctx, 'booster');
  return {
    instance,
    state: {
      ...state,
      boosters,
      collection: [...state.collection, instance],
      stats: { ...state.stats, opened: state.stats.opened + 1 },
    },
  };
}

export type RecycleError = 'count' | 'duplicate' | 'missing' | 'mixed' | 'max-tier';

export type RecycleCheck =
  { ok: true; inputs: PuffInstance[] } | { ok: false; reason: RecycleError };

export function checkRecycle(
  state: SaveState,
  uids: readonly string[],
  config: GameConfig,
): RecycleCheck {
  if (uids.length !== config.recycle.inputCount) return { ok: false, reason: 'count' };
  if (new Set(uids).size !== uids.length) return { ok: false, reason: 'duplicate' };
  const byUid = new Map(state.collection.map((i) => [i.uid, i]));
  const inputs: PuffInstance[] = [];
  for (const uid of uids) {
    const instance = byUid.get(uid);
    if (!instance) return { ok: false, reason: 'missing' };
    inputs.push(instance);
  }
  const rarity = inputs[0]?.rarity;
  if (!rarity || inputs.some((i) => i.rarity !== rarity)) return { ok: false, reason: 'mixed' };
  if (!nextRarity(config, rarity)) return { ok: false, reason: 'max-tier' };
  return { ok: true, inputs };
}

/** Destroys `inputCount` copies of rarity N and draws one copy of rarity N+1. */
export function recycle(state: SaveState, uids: readonly string[], ctx: GameContext): Pull {
  const check = checkRecycle(state, uids, ctx.config);
  if (!check.ok) throw new Error(`Cannot recycle: ${check.reason}`);
  const target = nextRarity(ctx.config, (check.inputs[0] as PuffInstance).rarity);
  if (!target) throw new Error('Cannot recycle: max-tier');
  const type = boosterType(ctx.config, ctx.config.recycle.boosterType);
  const roll = rollForRarity(ctx.catalog, type, ctx.config, target.id, ctx.rng);
  const instance = toInstance(roll, ctx, 'recycle');
  const removed = new Set(uids);
  return {
    instance,
    state: {
      ...state,
      collection: [...state.collection.filter((i) => !removed.has(i.uid)), instance],
      stats: { ...state.stats, recycled: state.stats.recycled + 1 },
    },
  };
}
