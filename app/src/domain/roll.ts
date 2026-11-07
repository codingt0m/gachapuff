import { pickUniform, pickWeighted, type Rng } from './rng.ts';
import { rarityForPoints, rarityPoints } from './rarity.ts';
import { rollSmoke } from './smoke.ts';
import {
  FINISH_IDS,
  SMOKE_KINDS,
  type BoosterType,
  type Catalog,
  type FinishId,
  type GameConfig,
  type PuffDefinition,
  type RarityId,
  type Smoke,
  type SmokeKind,
} from './types.ts';

/** The result of a draw, before it becomes an owned instance. */
export interface Roll {
  puff: PuffDefinition;
  finish: FinishId;
  smoke: Smoke;
  points: number;
  rarity: RarityId;
}

/** One (base tier, finish, smoke kind) combination with its exact probability. */
export interface Outcome {
  baseTier: number;
  finish: FinishId;
  smoke: SmokeKind;
  probability: number;
  points: number;
  rarity: RarityId;
}

export function boosterType(config: GameConfig, id: string): BoosterType {
  const type = config.boosterTypes.find((b) => b.id === id);
  if (!type) throw new Error(`Unknown booster type "${id}"`);
  return type;
}

/** Base tier weights, zeroed for tiers that have no puff in the catalog. */
function effectiveBaseWeights(catalog: Catalog, type: BoosterType): number[] {
  return type.baseTierWeights.map((w, i) => ((catalog.byBaseTier[i]?.length ?? 0) > 0 ? w : 0));
}

function normalise(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) throw new Error('Drop table has no positive weight');
  return weights.map((w) => Math.max(0, w) / total);
}

/** Every combination of the three axes with its probability for this booster type. */
export function enumerateOutcomes(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
): Outcome[] {
  const base = normalise(effectiveBaseWeights(catalog, type));
  const finish = normalise(FINISH_IDS.map((f) => type.finishWeights[f]));
  const smoke = normalise(SMOKE_KINDS.map((s) => type.smokeWeights[s]));
  const outcomes: Outcome[] = [];
  base.forEach((pb, baseTier) => {
    FINISH_IDS.forEach((f, fi) => {
      SMOKE_KINDS.forEach((s, si) => {
        const probability = pb * (finish[fi] ?? 0) * (smoke[si] ?? 0);
        if (probability <= 0) return;
        const points = rarityPoints(config, baseTier, f, s);
        const rarity = rarityForPoints(config, points).id;
        outcomes.push({ baseTier, finish: f, smoke: s, probability, points, rarity });
      });
    });
  });
  return outcomes;
}

function materialise(
  catalog: Catalog,
  config: GameConfig,
  rng: Rng,
  baseTier: number,
  finish: FinishId,
  smokeKind: SmokeKind,
): Roll {
  const puff = pickUniform(rng, catalog.byBaseTier[baseTier] ?? []);
  const points = rarityPoints(config, baseTier, finish, smokeKind);
  return {
    puff,
    finish,
    smoke: rollSmoke(rng, config, smokeKind),
    points,
    rarity: rarityForPoints(config, points).id,
  };
}

/** Draws one booster: each axis independently, then the puff within its base tier. */
export function rollBooster(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
  rng: Rng,
): Roll {
  const baseTier = pickWeighted(
    rng,
    effectiveBaseWeights(catalog, type).map((w, i) => [i, w] as const),
  );
  const finish = pickWeighted(
    rng,
    FINISH_IDS.map((f) => [f, type.finishWeights[f]] as const),
  );
  const smoke = pickWeighted(
    rng,
    SMOKE_KINDS.map((s) => [s, type.smokeWeights[s]] as const),
  );
  return materialise(catalog, config, rng, baseTier, finish, smoke);
}

/** Draws with the booster's rules, conditioned on the global rarity (used by recycling). */
export function rollForRarity(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
  rarity: RarityId,
  rng: Rng,
): Roll {
  const candidates = enumerateOutcomes(catalog, type, config).filter((o) => o.rarity === rarity);
  if (candidates.length === 0) throw new Error(`Rarity "${rarity}" cannot be drawn`);
  const o = pickWeighted(
    rng,
    candidates.map((c) => [c, c.probability] as const),
  );
  return materialise(catalog, config, rng, o.baseTier, o.finish, o.smoke);
}
