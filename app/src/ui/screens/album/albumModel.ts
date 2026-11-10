import { compareInstances, groupByPuff } from '../../../domain/collection.ts';
import { rarityIndex } from '../../../domain/rarity.ts';
import type {
  Catalog,
  FinishId,
  GameConfig,
  PuffDefinition,
  PuffInstance,
  RarityId,
  SmokeKind,
} from '../../../domain/types.ts';

export type Ownership = 'all' | 'owned' | 'missing';
/** 'copies': most copies owned first; 'copies-asc': the reverse (missing puffs stay last). */
export type AlbumSort = 'model' | 'rarity' | 'recent' | 'name' | 'copies' | 'copies-asc';

export interface AlbumFilters {
  model: string | 'all';
  rarity: RarityId | 'all';
  finish: FinishId | 'all';
  smoke: SmokeKind | 'all';
  ownership: Ownership;
  sort: AlbumSort;
}

export const DEFAULT_FILTERS: AlbumFilters = {
  model: 'all',
  rarity: 'all',
  finish: 'all',
  smoke: 'all',
  ownership: 'all',
  sort: 'model',
};

export interface AlbumEntry {
  puff: PuffDefinition;
  /** Copies matching the filters, best first. */
  instances: PuffInstance[];
  /** All owned copies (for counts). */
  count: number;
}

export interface AlbumSection {
  /** null for flat (non-grouped) sorts. */
  model: string | null;
  owned: number;
  total: number;
  entries: AlbumEntry[];
}

const instanceFiltersActive = (f: AlbumFilters) =>
  f.rarity !== 'all' || f.finish !== 'all' || f.smoke !== 'all';

export function filtersActive(f: AlbumFilters): boolean {
  return f.model !== 'all' || f.ownership !== 'all' || instanceFiltersActive(f);
}

/** Builds the album content: filtered, sorted, grouped by model when sorting by model. */
export function buildAlbum(
  catalog: Catalog,
  collection: readonly PuffInstance[],
  config: GameConfig,
  f: AlbumFilters,
): AlbumSection[] {
  const groups = groupByPuff(collection, config);
  const byInstance = instanceFiltersActive(f);
  const entries: AlbumEntry[] = [];
  for (const puff of catalog.puffs) {
    if (f.model !== 'all' && puff.model !== f.model) continue;
    const all = groups.get(puff.id) ?? [];
    const matching = all.filter(
      (i) =>
        (f.rarity === 'all' || i.rarity === f.rarity) &&
        (f.finish === 'all' || i.finish === f.finish) &&
        (f.smoke === 'all' || i.smoke.kind === f.smoke),
    );
    const owned = all.length > 0;
    if (f.ownership === 'owned' && !owned) continue;
    if (f.ownership === 'missing' && owned) continue;
    if (byInstance && matching.length === 0) continue;
    entries.push({ puff, instances: matching, count: all.length });
  }

  if (f.sort === 'model') {
    const sections = new Map<string, AlbumSection>();
    for (const model of catalog.models)
      sections.set(model, { model, owned: 0, total: 0, entries: [] });
    for (const puff of catalog.puffs) {
      const s = sections.get(puff.model);
      if (!s) continue;
      s.total++;
      if (groups.has(puff.id)) s.owned++;
    }
    for (const e of entries) sections.get(e.puff.model)?.entries.push(e);
    return [...sections.values()].filter((s) => s.entries.length > 0);
  }

  const best = (e: AlbumEntry) => e.instances[0];
  const byName = (a: AlbumEntry, b: AlbumEntry) =>
    a.puff.flavor.localeCompare(b.puff.flavor) || a.puff.model.localeCompare(b.puff.model);
  const sorted = [...entries].sort((a, b) => {
    const ia = best(a);
    const ib = best(b);
    if (f.sort === 'name') return byName(a, b);
    if (f.sort === 'copies' || f.sort === 'copies-asc') {
      if (a.count === 0 || b.count === 0) return b.count - a.count || byName(a, b);
      const order = f.sort === 'copies' ? b.count - a.count : a.count - b.count;
      return order || byName(a, b);
    }
    if (!ia || !ib) return ia ? -1 : ib ? 1 : a.puff.flavor.localeCompare(b.puff.flavor);
    if (f.sort === 'rarity') {
      return (
        rarityIndex(config, ib.rarity) - rarityIndex(config, ia.rarity) ||
        compareInstances(ia, ib, config)
      );
    }
    const latest = (e: AlbumEntry) => Math.max(...e.instances.map((i) => i.obtainedAt));
    return latest(b) - latest(a);
  });
  const owned = sorted.filter((e) => e.count > 0).length;
  return [{ model: null, owned, total: sorted.length, entries: sorted }];
}
