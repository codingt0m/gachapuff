import { z } from 'zod';
import { createInitialState, DEFAULT_SETTINGS, PSEUDO_MAX, SAVE_VERSION } from '../domain/save.ts';
import {
  FINISH_IDS,
  RARITY_IDS,
  SMOKE_SHAPES,
  type GameConfig,
  type SaveState,
} from '../domain/types.ts';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

const shape = { shape: z.enum(SMOKE_SHAPES).optional() };
const colors = z.array(hex).min(2);
const smokeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('white'), ...shape }),
  z.object({ kind: z.literal('rainbow'), ...shape }),
  z.object({ kind: z.literal('solid'), color: hex, ...shape }),
  z.object({ kind: z.literal('glitter'), color: hex, ...shape }),
  z.object({ kind: z.literal('gradient'), colors, ...shape }),
  z.object({ kind: z.literal('halo'), colors, ...shape }),
  z.object({ kind: z.literal('swirl'), colors, ...shape }),
  z.object({ kind: z.literal('alternate'), colors, ...shape }),
]);

/** Finishes dropped during development, mapped to one worth the same points. */
const REMOVED_FINISHES: Record<string, string> = {
  pixel: 'shiny',
  neon: 'chromatic',
  opal: 'chromatic',
};

const engravingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('signature'), by: z.string().min(1).max(PSEUDO_MAX).optional() }),
  z.object({ kind: z.literal('serial'), serial: z.number().int().positive() }),
]);

const instanceSchema = z.object({
  uid: z.string().min(1),
  puffId: z.string().min(1),
  finish: z.enum(FINISH_IDS),
  smoke: smokeSchema,
  engraving: engravingSchema,
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
      pseudo: z.string().max(PSEUDO_MAX).optional(),
    })
    .catch(DEFAULT_SETTINGS),
});

/**
 * Migrations, keyed by the version they upgrade FROM.
 * Example for a future v2: `1: (s) => ({ ...s, version: 2, newField: defaultValue })`.
 */
const migrations: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> = {
  // v2: engraving axis (existing copies have none); 'rosegold' renamed 'bronze'.
  1: (s) => ({
    ...s,
    version: 2,
    collection: Array.isArray(s.collection)
      ? s.collection.map((i: Record<string, unknown>) => ({
          ...i,
          finish: i.finish === 'rosegold' ? 'bronze' : i.finish,
          engraving: i.engraving ?? { kind: 'none' },
        }))
      : s.collection,
  }),
  // v3: smoke shape axis ('rings' smoke becomes a solid smoke shaped as rings);
  // dropped finishes replaced by one worth the same points.
  2: (s) => ({
    ...s,
    version: 3,
    collection: Array.isArray(s.collection)
      ? s.collection.map((i: Record<string, unknown>) => {
          const smoke = i.smoke as Record<string, unknown> | undefined;
          const finish = typeof i.finish === 'string' ? i.finish : '';
          return {
            ...i,
            finish: REMOVED_FINISHES[finish] ?? i.finish,
            smoke: smoke?.kind === 'rings' ? { ...smoke, kind: 'solid', shape: 'rings' } : smoke,
          };
        })
      : s.collection,
  }),
};

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
