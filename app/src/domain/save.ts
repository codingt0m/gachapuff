import type { GameConfig, SaveState, Settings } from './types.ts';

/** Bump when SaveState changes shape, and add a migration in data/saveSchema.ts. */
export const SAVE_VERSION = 4;

/** Longest player pseudo. */
export const PSEUDO_MAX = 20;

/** Trimmed pseudo, or undefined when empty. */
export function cleanPseudo(raw: string | undefined): string | undefined {
  const pseudo = raw?.trim().replace(/\s+/g, ' ').slice(0, PSEUDO_MAX);
  return pseudo ? pseudo : undefined;
}

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
