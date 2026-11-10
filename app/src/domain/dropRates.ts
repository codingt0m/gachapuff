import type { BoosterType, EngravingKind, FinishId, SmokeKind, SmokeShape } from './types.ts';

/** A rarity tier of a drop table: its weight is split evenly between its variants. */
export interface WeightTier<K extends string> {
  weight: number;
  ids: readonly K[];
}

/** Every drop rate of one booster type, in %: each table sums to 100. */
export interface DropTable {
  /** Indexed like `baseTiers.tiers`. */
  baseTiers: number[];
  finishTiers: WeightTier<FinishId>[];
  engravings: Record<EngravingKind, number>;
  smokes: Record<SmokeKind, number>;
  shapes: Record<SmokeShape, number>;
}

/** The weights a booster type draws with, straight from its drop table. */
export function boosterWeights(
  table: DropTable,
): Pick<
  BoosterType,
  'baseTierWeights' | 'finishWeights' | 'smokeWeights' | 'smokeShapeWeights' | 'engravingWeights'
> {
  return {
    baseTierWeights: table.baseTiers,
    finishWeights: splitTiers(table.finishTiers),
    smokeWeights: table.smokes,
    smokeShapeWeights: table.shapes,
    engravingWeights: table.engravings,
  };
}

/** Per-variant weights of tiered drop rates (each variant gets an equal share of its tier). */
export function splitTiers<K extends string>(tiers: readonly WeightTier<K>[]): Record<K, number> {
  const weights = {} as Record<K, number>;
  for (const tier of tiers) {
    for (const id of tier.ids) {
      if (id in weights) throw new Error(`"${id}" belongs to several tiers`);
      weights[id] = tier.weight / tier.ids.length;
    }
  }
  return weights;
}

export function totalWeight(weights: Readonly<Record<string, number>>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

/** True when a drop table sums to 100 % (up to floating point noise). */
export function sumsTo100(weights: Readonly<Record<string, number>>): boolean {
  return Math.abs(totalWeight(weights) - 100) < 1e-9;
}
