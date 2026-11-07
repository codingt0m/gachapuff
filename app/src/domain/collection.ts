import { rarityIndex } from './rarity.ts';
import type { Catalog, GameConfig, PuffInstance } from './types.ts';

export interface ModelProgress {
  model: string;
  owned: number;
  total: number;
}

/** Sort order "best first": highest rarity, then points, then newest. */
export function compareInstances(a: PuffInstance, b: PuffInstance, config: GameConfig): number {
  return (
    rarityIndex(config, b.rarity) - rarityIndex(config, a.rarity) ||
    b.points - a.points ||
    b.obtainedAt - a.obtainedAt
  );
}

/** Instances grouped by puff id, best first. */
export function groupByPuff(
  collection: readonly PuffInstance[],
  config: GameConfig,
): Map<string, PuffInstance[]> {
  const groups = new Map<string, PuffInstance[]>();
  for (const instance of collection) {
    const list = groups.get(instance.puffId) ?? [];
    list.push(instance);
    groups.set(instance.puffId, list);
  }
  for (const list of groups.values()) list.sort((a, b) => compareInstances(a, b, config));
  return groups;
}

export function modelProgress(
  catalog: Catalog,
  owned: ReadonlySet<string>,
): Map<string, ModelProgress> {
  const result = new Map<string, ModelProgress>();
  for (const puff of catalog.puffs) {
    const p = result.get(puff.model) ?? { model: puff.model, owned: 0, total: 0 };
    p.total++;
    if (owned.has(puff.id)) p.owned++;
    result.set(puff.model, p);
  }
  return result;
}

/** Share of the catalog owned, in [0, 1]. Puffs no longer in the catalog are ignored. */
export function globalProgress(catalog: Catalog, owned: ReadonlySet<string>): number {
  if (catalog.puffs.length === 0) return 0;
  return catalog.puffs.filter((p) => owned.has(p.id)).length / catalog.puffs.length;
}
