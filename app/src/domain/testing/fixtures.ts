import { gameConfig } from '../../config/gameConfig.ts';
import { buildCatalog } from '../catalog.ts';
import { createInitialState } from '../save.ts';
import type { GameConfig, PuffDefinition, PuffInstance, SaveState } from '../types.ts';

export const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

export function puff(model: string, flavor: string, puffs: number | null): PuffDefinition {
  const id = `${model}--${flavor}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    id,
    model,
    modelSlug: model.toLowerCase(),
    flavor,
    puffs,
    images: { thumb: `${id}-256.webp`, detail: `${id}-512.webp` },
    quality: { integrity: 5, resolution: 4 },
    color: '#ff00aa',
    nozzle: { x: 0.5, y: 0.08 },
    bbox: { x: 0.3, y: 0.08, w: 0.4, h: 0.84 },
  };
}

/** A small catalog with puffs in every base tier, plus an excluded model. */
export const definitions: PuffDefinition[] = [
  puff('Alien 10K', 'Mango', 10_000),
  puff('Alien 10K', 'Kiwi', 10_000),
  puff('Cruiser', 'Mint', null),
  puff('Mega Box 25K', 'Cola', 25_000),
  puff('Lion King 42K', 'Peach', 42_000),
  puff('Rage Gorilla 55K', 'Grape', 55_000),
  puff('Big Mac 100K', 'Melon', 100_000),
  puff('Non classe', 'Sour Apple Ice', null),
];

export const config: GameConfig = gameConfig;
export const catalog = buildCatalog(definitions, config);

export function makeIdFactory(prefix = 'uid') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function instance(overrides: Partial<PuffInstance> & { uid: string }): PuffInstance {
  return {
    puffId: 'alien-10k--mango',
    finish: 'normal',
    smoke: { kind: 'white' },
    rarity: 'common',
    points: 0,
    obtainedAt: NOW,
    origin: 'booster',
    ...overrides,
  };
}

export function stateWith(collection: PuffInstance[]): SaveState {
  return { ...createInitialState(NOW, config), collection };
}
