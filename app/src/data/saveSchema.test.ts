import { describe, expect, it } from 'vitest';
import { openBooster } from '../domain/game.ts';
import { createSeededRng } from '../domain/rng.ts';
import { createInitialState, SAVE_VERSION } from '../domain/save.ts';
import { catalog, config, makeIdFactory, NOW } from '../domain/testing/fixtures.ts';
import { createMemoryStore } from './persistence.ts';
import { exportSave, importSave } from './saveFile.ts';
import { parseSave } from './saveSchema.ts';

function playedState() {
  const ctx = { config, catalog, rng: createSeededRng(3), now: NOW, newId: makeIdFactory() };
  let state = createInitialState(NOW, config);
  state = openBooster(state, { ...ctx, unlimitedBoosters: true }).state;
  return openBooster(state, { ...ctx, unlimitedBoosters: true }).state;
}

describe('parseSave', () => {
  it('returns a fresh state when nothing is saved', () => {
    expect(parseSave(undefined, NOW, config)).toEqual({
      status: 'empty',
      state: createInitialState(NOW, config),
    });
  });

  it('accepts a valid save', () => {
    const state = playedState();
    expect(parseSave(structuredClone(state), NOW, config)).toEqual({ status: 'ok', state });
  });

  it('falls back to a clean state when the save is corrupted', () => {
    const broken = { ...playedState(), collection: [{ uid: 1 }] };
    const result = parseSave(broken, NOW, config);
    expect(result.status).toBe('corrupted');
    expect(result.state.collection).toEqual([]);
  });

  it('rejects unknown (future or unmigratable) versions', () => {
    expect(parseSave({ ...playedState(), version: 99 }, NOW, config).status).toBe('corrupted');
    expect(parseSave({ version: 0 }, NOW, config).status).toBe('corrupted');
  });

  it('migrates a v1 save: no engraving, rose gold (bronze, since dropped) becomes plain', () => {
    const state = playedState();
    const v1 = structuredClone({
      ...state,
      version: 1,
      collection: state.collection.map((instance, n) => {
        const old: Record<string, unknown> = { ...instance };
        delete old.engraving;
        if (n === 0) old.finish = 'rosegold';
        return old;
      }),
    });
    const result = parseSave(v1, NOW, config);
    expect(result.status).toBe('ok');
    expect(result.state.version).toBe(SAVE_VERSION);
    expect(result.state.collection.map((i) => i.engraving)).toEqual([
      { kind: 'none' },
      { kind: 'none' },
    ]);
    expect(result.state.collection[0]?.finish).toBe('normal');
  });

  it('migrates a v2 save: ring smoke becomes a shape, dropped finishes are replaced', () => {
    const state = playedState();
    const v2 = structuredClone({
      ...state,
      version: 2,
      collection: state.collection.map((instance, n) => ({
        ...instance,
        finish: n === 0 ? 'neon' : 'pixel',
        smoke: n === 0 ? { kind: 'rings', color: '#ff0000' } : instance.smoke,
      })),
    });
    const result = parseSave(v2, NOW, config);
    expect(result.status).toBe('ok');
    expect(result.state.collection.map((i) => i.finish)).toEqual(['chromatic', 'normal']);
    expect(result.state.collection[0]?.smoke).toEqual({
      kind: 'solid',
      color: '#ff0000',
      shape: 'rings',
    });
  });

  it('migrates a v3 save: dropped finishes and numbered copies become plain', () => {
    const state = playedState();
    const dropped = ['lava', 'amethyst', 'emerald', 'shiny', 'silver', 'bronze', 'unknown'];
    const v3 = structuredClone({
      ...state,
      version: 3,
      collection: [
        ...dropped.map((finish, n) => ({ ...state.collection[0], uid: `d${n}`, finish })),
        {
          ...state.collection[0],
          uid: 'g',
          finish: 'golden',
          engraving: { kind: 'serial', serial: 7 },
        },
        { ...state.collection[0], uid: 's', engraving: { kind: 'signature', by: 'Tom' } },
      ],
    });
    const result = parseSave(v3, NOW, config);
    expect(result.status).toBe('ok');
    const finishes = result.state.collection.map((i) => i.finish);
    expect(finishes).toEqual([
      ...dropped.map(() => 'normal'),
      'golden',
      state.collection[0]?.finish,
    ]);
    expect(result.state.collection.map((i) => i.engraving.kind)).toEqual([
      ...dropped.map(() => 'none'),
      'none',
      'signature',
    ]);
  });

  it('repairs invalid settings without losing the collection', () => {
    const result = parseSave({ ...playedState(), settings: 'nope' }, NOW, config);
    expect(result.status).toBe('ok');
    expect(result.state.collection).toHaveLength(2);
  });
});

describe('export / import', () => {
  it('round-trips a save', () => {
    const state = playedState();
    expect(importSave(exportSave(state, NOW), NOW, config)).toEqual({ state });
  });

  it('accepts a bare save object and rejects garbage', () => {
    const state = playedState();
    expect(importSave(JSON.stringify(state), NOW, config)).toEqual({ state });
    expect(importSave('not json', NOW, config)).toHaveProperty('error');
    expect(importSave('{"format":"gachapuff-save","save":{}}', NOW, config)).toHaveProperty(
      'error',
    );
  });
});

describe('memory store', () => {
  it('stores copies, not references', async () => {
    const store = createMemoryStore();
    const state = playedState();
    await store.save(state);
    state.stats.opened = 999;
    expect(((await store.load()) as typeof state).stats.opened).toBe(2);
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });
});
