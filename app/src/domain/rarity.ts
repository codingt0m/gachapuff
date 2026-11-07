import type {
  FinishDef,
  FinishId,
  GameConfig,
  RarityId,
  RarityTier,
  SmokeDef,
  SmokeKind,
} from './types.ts';

export function finishDef(config: GameConfig, id: FinishId): FinishDef {
  const def = config.finishes.find((f) => f.id === id);
  if (!def) throw new Error(`Unknown finish "${id}"`);
  return def;
}

export function smokeDef(config: GameConfig, kind: SmokeKind): SmokeDef {
  const def = config.smokes.find((s) => s.kind === kind);
  if (!def) throw new Error(`Unknown smoke kind "${kind}"`);
  return def;
}

export function rarityPoints(
  config: GameConfig,
  baseTier: number,
  finish: FinishId,
  smoke: SmokeKind,
): number {
  const base = config.baseTiers.tiers[baseTier];
  if (!base) throw new Error(`Unknown base tier ${baseTier}`);
  return base.points + finishDef(config, finish).points + smokeDef(config, smoke).points;
}

/** Highest tier whose threshold is reached. */
export function rarityForPoints(config: GameConfig, points: number): RarityTier {
  let result = config.rarities[0];
  for (const tier of config.rarities) if (points >= tier.minPoints) result = tier;
  if (!result) throw new Error('No rarity tier configured');
  return result;
}

export function rarityIndex(config: GameConfig, id: RarityId): number {
  const index = config.rarities.findIndex((r) => r.id === id);
  if (index < 0) throw new Error(`Unknown rarity "${id}"`);
  return index;
}

export function rarityTier(config: GameConfig, id: RarityId): RarityTier {
  return config.rarities[rarityIndex(config, id)] as RarityTier;
}

/** The tier above, or null for the last one. */
export function nextRarity(config: GameConfig, id: RarityId): RarityTier | null {
  return config.rarities[rarityIndex(config, id) + 1] ?? null;
}
