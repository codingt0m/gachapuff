import type { Catalog, GameConfig, PuffDefinition } from './types.ts';

/** Base tier of a model: manual override, else derived from its capacity. */
export function baseTierFor(model: string, puffs: number | null, config: GameConfig): number {
  const { tiers, unknownCapacityTier, modelOverrides } = config.baseTiers;
  const override = modelOverrides[model];
  if (override !== undefined) return override;
  if (puffs === null) return unknownCapacityTier;
  let tier = 0;
  tiers.forEach((t, i) => {
    if (puffs >= t.minPuffs) tier = i;
  });
  return tier;
}

/** Builds the playable catalog: drops excluded models, computes base tiers and lookups. */
export function buildCatalog(definitions: readonly PuffDefinition[], config: GameConfig): Catalog {
  const excluded = new Set(config.catalog.excludedModels);
  const puffs = definitions.filter((p) => !excluded.has(p.model));
  const byBaseTier: PuffDefinition[][] = config.baseTiers.tiers.map(() => []);
  const baseTierOf = new Map<string, number>();
  for (const puff of puffs) {
    const tier = baseTierFor(puff.model, puff.puffs, config);
    baseTierOf.set(puff.id, tier);
    byBaseTier[tier]?.push(puff);
  }
  const models = [...new Set(puffs.map((p) => p.model))].sort((a, b) => a.localeCompare(b));
  return { puffs, byId: new Map(puffs.map((p) => [p.id, p])), baseTierOf, byBaseTier, models };
}
