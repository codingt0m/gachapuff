import { gameConfig } from '../config/gameConfig.ts';
import { applyRegen } from '../domain/boosters.ts';
import { buildCatalog } from '../domain/catalog.ts';
import { createSeededRng, mathRandomRng } from '../domain/rng.ts';
import { createIndexedDbStore } from '../data/indexedDbStore.ts';
import { loadManifest } from '../data/manifest.ts';
import { createMemoryStore, type SaveStore } from '../data/persistence.ts';
import { parseSave } from '../data/saveSchema.ts';
import { randomId, readDevFlags } from './devFlags.ts';
import { GameStore } from './gameStore.ts';

export type BootNotice = 'save-corrupted' | 'storage-memory';

export interface BootResult {
  store: GameStore;
  notices: BootNotice[];
}

async function openStorage(): Promise<SaveStore> {
  try {
    return await createIndexedDbStore();
  } catch (error) {
    console.warn('IndexedDB unavailable, progress will not be kept', error);
    return createMemoryStore();
  }
}

/** Loads the catalog and the save, and wires the game store. */
export async function bootGame(): Promise<BootResult> {
  const flags = readDevFlags();
  const [definitions, saveStore] = await Promise.all([loadManifest(), openStorage()]);
  const catalog = buildCatalog(definitions, gameConfig);
  const now = Date.now();
  const notices: BootNotice[] = [];
  if (saveStore.kind === 'memory') notices.push('storage-memory');

  let raw: unknown;
  try {
    raw = await saveStore.load();
  } catch (error) {
    console.error('Save could not be read', error);
  }
  const loaded = parseSave(raw, now, gameConfig);
  if (loaded.status === 'corrupted') {
    console.warn('Corrupted save replaced by a fresh one:', loaded.error);
    notices.push('save-corrupted');
  }
  const state = {
    ...loaded.state,
    boosters: applyRegen(loaded.state.boosters, now, gameConfig.regen),
  };

  const store = new GameStore({
    config: gameConfig,
    catalog,
    saveStore,
    initialState: state,
    rng: flags.seed === null ? mathRandomRng : createSeededRng(flags.seed),
    newId: randomId,
    unlimitedBoosters: flags.dev,
    dev: flags.dev,
  });
  return { store, notices };
}
