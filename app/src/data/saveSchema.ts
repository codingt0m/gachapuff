import { z } from 'zod';
import { createInitialState, DEFAULT_SETTINGS, SAVE_VERSION } from '../domain/save.ts';
import { FINISH_IDS, RARITY_IDS, type GameConfig, type SaveState } from '../domain/types.ts';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

const smokeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('white') }),
  z.object({ kind: z.literal('solid'), color: hex }),
  z.object({ kind: z.literal('gradient'), colors: z.array(hex).min(2) }),
]);

const instanceSchema = z.object({
  uid: z.string().min(1),
  puffId: z.string().min(1),
  finish: z.enum(FINISH_IDS),
  smoke: smokeSchema,
  rarity: z.enum(RARITY_IDS),
  points: z.number().int().nonnegative(),
  obtainedAt: z.number().nonnegative(),
  origin: z.enum(['booster', 'recycle']),
});

export const saveStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: z.number().nonnegative(),
  boosters: z.object({
    stock: z.number().int().nonnegative(),
    lastRegenAt: z.number().nonnegative(),
  }),
  collection: z.array(instanceSchema),
  stats: z.object({
    opened: z.number().int().nonnegative(),
    recycled: z.number().int().nonnegative(),
  }),
  settings: z
    .object({
      sound: z.boolean(),
      haptics: z.boolean(),
      motion: z.enum(['system', 'reduced', 'full']),
    })
    .catch(DEFAULT_SETTINGS),
});

/**
 * Migrations, keyed by the version they upgrade FROM.
 * Example for a future v2: `1: (s) => ({ ...s, version: 2, newField: defaultValue })`.
 */
const migrations: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> = {};

export type LoadResult =
  | { status: 'ok'; state: SaveState }
  | { status: 'empty'; state: SaveState }
  | { status: 'corrupted'; state: SaveState; error: string };

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let save = raw;
  let version = typeof save.version === 'number' ? save.version : 0;
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    save = step(save);
    version = typeof save.version === 'number' ? save.version : version + 1;
  }
  return save;
}

/** Migrates and validates raw data; falls back to a fresh state when unusable. */
export function parseSave(raw: unknown, now: number, config: GameConfig): LoadResult {
  if (raw === undefined || raw === null) {
    return { status: 'empty', state: createInitialState(now, config) };
  }
  try {
    if (typeof raw !== 'object') throw new Error('Save is not an object');
    const parsed = saveStateSchema.safeParse(migrate(raw as Record<string, unknown>));
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid save');
    return { status: 'ok', state: parsed.data };
  } catch (error) {
    return {
      status: 'corrupted',
      state: createInitialState(now, config),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
