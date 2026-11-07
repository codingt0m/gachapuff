import { describe, expect, it } from 'vitest';
import { openBooster } from '../domain/game.ts';
import { createSeededRng } from '../domain/rng.ts';
import { createInitialState } from '../domain/save.ts';
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
