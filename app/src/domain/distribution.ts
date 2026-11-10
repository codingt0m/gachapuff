import { enumerateOutcomes, rollBooster } from './roll.ts';
import type { Rng } from './rng.ts';
import type {
  BoosterType,
  Catalog,
  EngravingKind,
  FinishId,
  GameConfig,
  RarityId,
  SmokeKind,
  SmokeShape,
} from './types.ts';

export type Distribution<K extends string> = Record<K, number>;

const zeros = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Distribution<K>;

/** Exact probability of each global rarity for a booster type. */
export function exactRarityDistribution(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
): Distribution<RarityId> {
  const result = zeros(config.rarities.map((r) => r.id));
  for (const o of enumerateOutcomes(catalog, type, config)) result[o.rarity] += o.probability;
  return result;
}

export interface SimulationResult {
  draws: number;
  rarity: Distribution<RarityId>;
  finish: Distribution<FinishId>;
  smoke: Distribution<SmokeKind>;
  shape: Distribution<SmokeShape>;
  engraving: Distribution<EngravingKind>;
  /** Draw count per base tier index. */
  baseTier: number[];
  /** Number of distinct puffs seen. */
  distinctPuffs: number;
}

/** Opens `draws` boosters and counts what came out. */
export function simulateBoosters(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
  rng: Rng,
  draws: number,
): SimulationResult {
  const rarity = zeros(config.rarities.map((r) => r.id));
  const finish = zeros(config.finishes.map((f) => f.id));
  const smoke = zeros(config.smokes.map((s) => s.kind));
  const shape = zeros(config.smokeShapes.map((s) => s.shape));
  const engraving = zeros(config.engravings.map((e) => e.kind));
  const baseTier = config.baseTiers.tiers.map(() => 0);
  const seen = new Set<string>();
  for (let i = 0; i < draws; i++) {
    const roll = rollBooster(catalog, type, config, rng);
    rarity[roll.rarity]++;
    finish[roll.finish]++;
    smoke[roll.smoke.kind]++;
    shape[roll.smoke.shape ?? 'cloud']++;
    engraving[roll.engraving]++;
    const tier = catalog.baseTierOf.get(roll.puff.id) ?? 0;
    baseTier[tier] = (baseTier[tier] ?? 0) + 1;
    seen.add(roll.puff.id);
  }
  return { draws, rarity, finish, smoke, shape, engraving, baseTier, distinctPuffs: seen.size };
}
