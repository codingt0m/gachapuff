import type { GameConfig, SaveState, Settings } from './types.ts';

/** Bump when SaveState changes shape, and add a migration in data/saveSchema.ts. */
export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true, motion: 'system' };

export function createInitialState(now: number, config: GameConfig): SaveState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    boosters: { stock: config.regen.initialStock, lastRegenAt: now },
    collection: [],
    stats: { opened: 0, recycled: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
}
