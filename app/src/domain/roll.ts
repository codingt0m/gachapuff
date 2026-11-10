import { pickUniform, pickWeighted, type Rng } from './rng.ts';
import { rarityForPoints, rarityPoints } from './rarity.ts';
import { rollSmoke } from './smoke.ts';
import {
  ENGRAVING_KINDS,
  FINISH_IDS,
  SMOKE_KINDS,
  SMOKE_SHAPES,
  type BoosterType,
  type Catalog,
  type EngravingKind,
  type FinishId,
  type GameConfig,
  type PuffDefinition,
  type RarityId,
  type Smoke,
  type SmokeKind,
  type SmokeShape,
} from './types.ts';

/** The result of a draw, before it becomes an owned instance. */
export interface Roll {
  puff: PuffDefinition;
  finish: FinishId;
  smoke: Smoke;
  /** A signature is signed by the player when the roll becomes their copy. */
  engraving: EngravingKind;
  points: number;
  rarity: RarityId;
}

/** One (base tier, finish, smoke kind, smoke shape, engraving) combination with its probability. */
export interface Outcome {
  baseTier: number;
  finish: FinishId;
  smoke: SmokeKind;
  shape: SmokeShape;
  engraving: EngravingKind;
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

/** Every combination of the five axes with its probability for this booster type. */
export function enumerateOutcomes(
  catalog: Catalog,
  type: BoosterType,
  config: GameConfig,
): Outcome[] {
  const base = normalise(effectiveBaseWeights(catalog, type));
  const finish = normalise(FINISH_IDS.map((f) => type.finishWeights[f]));
  const smoke = normalise(SMOKE_KINDS.map((s) => type.smokeWeights[s]));
  const shape = normalise(SMOKE_SHAPES.map((s) => type.smokeShapeWeights[s]));
  const engraving = normalise(ENGRAVING_KINDS.map((e) => type.engravingWeights[e]));
  const outcomes: Outcome[] = [];
  base.forEach((pb, baseTier) => {
    FINISH_IDS.forEach((f, fi) => {
      SMOKE_KINDS.forEach((s, si) => {
        SMOKE_SHAPES.forEach((sh, shi) => {
          ENGRAVING_KINDS.forEach((e, ei) => {
            const probability =
              pb * (finish[fi] ?? 0) * (smoke[si] ?? 0) * (shape[shi] ?? 0) * (engraving[ei] ?? 0);
            if (probability <= 0) return;
            const points = rarityPoints(config, baseTier, f, s, e, sh);
            const rarity = rarityForPoints(config, points).id;
            outcomes.push({
              baseTier,
              finish: f,
              smoke: s,
              shape: sh,
              engraving: e,
              probability,
              points,
              rarity,
            });
          });
        });
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
  shape: SmokeShape,
  engravingKind: EngravingKind,
): Roll {
  const puff = pickUniform(rng, catalog.byBaseTier[baseTier] ?? []);
  const points = rarityPoints(config, baseTier, finish, smokeKind, engravingKind, shape);
  return {
    puff,
    finish,
    smoke: rollSmoke(rng, config, smokeKind, shape),
    engraving: engravingKind,
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
  const shape = pickWeighted(
    rng,
    SMOKE_SHAPES.map((s) => [s, type.smokeShapeWeights[s]] as const),
  );
  const engraving = pickWeighted(
    rng,
    ENGRAVING_KINDS.map((e) => [e, type.engravingWeights[e]] as const),
  );
  return materialise(catalog, config, rng, baseTier, finish, smoke, shape, engraving);
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
  return materialise(catalog, config, rng, o.baseTier, o.finish, o.smoke, o.shape, o.engraving);
}
