import { describe, expect, it } from 'vitest';
import { groupByPuff, globalProgress, modelProgress } from './collection.ts';
import { checkRecycle, openBooster, recycle, type GameContext } from './game.ts';
import { createSeededRng } from './rng.ts';
import { createInitialState } from './save.ts';
import { catalog, config, instance, makeIdFactory, NOW, stateWith } from './testing/fixtures.ts';

const ctx = (overrides: Partial<GameContext> = {}): GameContext => ({
  config,
  catalog,
  rng: createSeededRng(1),
  now: NOW,
  newId: makeIdFactory(),
  ...overrides,
});

describe('openBooster', () => {
  it('consumes a booster and adds the puff to the collection', () => {
    const state = createInitialState(NOW, config);
    const { state: next, instance: pulled } = openBooster(state, ctx());
    expect(next.boosters.stock).toBe(state.boosters.stock - 1);
    expect(next.collection).toEqual([pulled]);
    expect(next.stats.opened).toBe(1);
    expect(pulled).toMatchObject({ uid: 'uid-1', obtainedAt: NOW, origin: 'booster' });
    expect(catalog.byId.has(pulled.puffId)).toBe(true);
  });

  it('refuses to open without stock', () => {
    const empty = { ...createInitialState(NOW, config), boosters: { stock: 0, lastRegenAt: NOW } };
    expect(() => openBooster(empty, ctx())).toThrow();
  });

  it('never runs out in unlimited (dev) mode', () => {
    let state = { ...createInitialState(NOW, config), boosters: { stock: 0, lastRegenAt: NOW } };
    const c = ctx({ unlimitedBoosters: true });
    for (let i = 0; i < 5; i++) state = openBooster(state, c).state;
    expect(state.collection).toHaveLength(5);
    expect(state.boosters.stock).toBe(0);
  });

  it('does not mutate the previous state', () => {
    const state = createInitialState(NOW, config);
    openBooster(state, ctx());
    expect(state.collection).toHaveLength(0);
  });

  it('signs about 1 signed puff in 5 with the pseudo of the player', () => {
    const base = createInitialState(NOW, config);
    const state = { ...base, settings: { ...base.settings, pseudo: 'Tom' } };
    const c = ctx({ unlimitedBoosters: true, rng: createSeededRng(5) });
    let signed = 0;
    let byTom = 0;
    for (let i = 0; i < 20_000; i++) {
      const { engraving } = openBooster(state, c).instance;
      if (engraving.kind !== 'signature') continue;
      signed++;
      if (engraving.by === 'Tom') byTom++;
    }
    expect(byTom / signed).toBeGreaterThan(config.ownSignatureChance - 0.04);
    expect(byTom / signed).toBeLessThan(config.ownSignatureChance + 0.04);
  });

  it('keeps the house signature when the player has no pseudo', () => {
    const state = createInitialState(NOW, config);
    const c = ctx({ unlimitedBoosters: true, rng: createSeededRng(5) });
    for (let i = 0; i < 5_000; i++) {
      const { engraving } = openBooster(state, c).instance;
      if (engraving.kind === 'signature') expect(engraving.by).toBeUndefined();
    }
  });
});

describe('recycle', () => {
  const commons = ['a', 'b', 'c'].map((uid) => instance({ uid }));

  it('turns 3 copies of rarity N into 1 copy of rarity N+1', () => {
    const state = stateWith([...commons, instance({ uid: 'keep', rarity: 'rare', points: 3 })]);
    const { state: next, instance: result } = recycle(state, ['a', 'b', 'c'], ctx());
    expect(result.rarity).toBe('uncommon');
    expect(result.origin).toBe('recycle');
    expect(next.collection.map((i) => i.uid)).toEqual(['keep', result.uid]);
    expect(next.stats.recycled).toBe(1);
  });

  it('works for every tier except the last', () => {
    for (const tier of config.rarities.slice(0, -1)) {
      const inputs = ['x', 'y', 'z'].map((uid) => instance({ uid, rarity: tier.id }));
      const { instance: out } = recycle(stateWith(inputs), ['x', 'y', 'z'], ctx());
      const index = config.rarities.findIndex((r) => r.id === tier.id);
      expect(out.rarity).toBe(config.rarities[index + 1]?.id);
    }
  });

  it('validates the inputs', () => {
    const mixed = stateWith([...commons.slice(0, 2), instance({ uid: 'r', rarity: 'rare' })]);
    expect(checkRecycle(stateWith(commons), ['a', 'b'], config)).toEqual({
      ok: false,
      reason: 'count',
    });
    expect(checkRecycle(stateWith(commons), ['a', 'a', 'b'], config)).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    expect(checkRecycle(stateWith(commons), ['a', 'b', 'zz'], config)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(checkRecycle(mixed, ['a', 'b', 'r'], config)).toEqual({ ok: false, reason: 'mixed' });
    const divines = ['a', 'b', 'c'].map((uid) => instance({ uid, rarity: 'divine' }));
    expect(checkRecycle(stateWith(divines), ['a', 'b', 'c'], config)).toEqual({
      ok: false,
      reason: 'max-tier',
    });
    expect(() => recycle(stateWith(divines), ['a', 'b', 'c'], ctx())).toThrow();
  });
});

describe('collection helpers', () => {
  it('groups copies by puff, best first', () => {
    const groups = groupByPuff(
      [
        instance({ uid: '1', rarity: 'common', points: 0 }),
        instance({ uid: '2', rarity: 'epic', points: 5 }),
        instance({ uid: '3', rarity: 'common', points: 1 }),
      ],
      config,
    );
    expect(groups.get('alien-10k--mango')?.map((i) => i.uid)).toEqual(['2', '3', '1']);
  });

  it('computes progress per model and overall', () => {
    const owned = new Set(['alien-10k--mango']);
    expect(modelProgress(catalog, owned).get('Alien 10K')).toEqual({
      model: 'Alien 10K',
      owned: 1,
      total: 2,
    });
    expect(globalProgress(catalog, owned)).toBeCloseTo(1 / catalog.puffs.length);
  });
});
