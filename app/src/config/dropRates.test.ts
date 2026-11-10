import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../domain/catalog.ts';
import { exactRarityDistribution, simulateBoosters } from '../domain/distribution.ts';
import { sumsTo100, totalWeight, type DropTable } from '../domain/dropRates.ts';
import { finishDef, rarityIndex } from '../domain/rarity.ts';
import { createSeededRng } from '../domain/rng.ts';
import { boosterType } from '../domain/roll.ts';
import { definitions } from '../domain/testing/fixtures.ts';
import { ENGRAVING_KINDS, FINISH_IDS, SMOKE_KINDS, SMOKE_SHAPES } from '../domain/types.ts';
import { dropRates, gameConfig as config } from './gameConfig.ts';

// Per booster: three of them together cost about what one 100 000 run used to.
const DRAWS = 40_000;
const catalog = buildCatalog(definitions, config);
const tables: Record<string, DropTable> = dropRates;

/** Simulated share within 5 standard deviations of the expected one (p in %). */
function expectNear(count: number, percent: number) {
  const p = percent / 100;
  const sigma = Math.sqrt((p * (1 - p)) / DRAWS);
  expect(Math.abs(count / DRAWS - p)).toBeLessThanOrEqual(5 * sigma + 1e-9);
}

it('has three boosters, each drawn from its own drop table', () => {
  expect(config.boosterTypes.map((t) => t.id)).toEqual(['classic', 'nicotine', 'dopamine']);
  expect(Object.keys(dropRates)).toEqual(config.boosterTypes.map((t) => t.id));
  for (const t of config.boosterTypes) {
    expect(t.baseTierWeights).toBe(tables[t.id]?.baseTiers);
    expect(t.smokeWeights).toBe(tables[t.id]?.smokes);
    // Every booster can be opened from a full stock.
    expect(t.cost).toBeGreaterThanOrEqual(1);
    expect(t.cost).toBeLessThanOrEqual(config.regen.maxStock);
  }
});

describe.each(config.boosterTypes.map((t) => [t.name, t.id] as const))('%s', (_, id) => {
  const type = boosterType(config, id);
  const table = tables[id] as DropTable;
  const sim = simulateBoosters(catalog, type, config, createSeededRng(2026), DRAWS);

  it('finish tiers sum to 100 % and cover every finish exactly once', () => {
    expect(sumsTo100(type.finishWeights)).toBe(true);
    expect(totalWeight(Object.fromEntries(table.finishTiers.map((t, i) => [i, t.weight])))).toBe(
      100,
    );
    const ids = table.finishTiers.flatMap((t) => t.ids);
    expect([...ids].sort()).toEqual([...FINISH_IDS].sort());
  });

  it('has 7 finish tiers, each rarer than the one below and worth at least as many points', () => {
    const tiers = table.finishTiers;
    expect(tiers).toHaveLength(7);
    tiers.slice(1).forEach((tier, i) => {
      const below = tiers[i] as (typeof tiers)[number];
      expect(tier.weight).toBeLessThan(below.weight);
      const points = Math.min(...tier.ids.map((f) => finishDef(config, f).points));
      const pointsBelow = Math.max(...below.ids.map((f) => finishDef(config, f).points));
      expect(points).toBeGreaterThan(pointsBelow);
    });
    // Within a tier, every finish has the same weight and the same points.
    for (const tier of tiers) {
      const share = tier.weight / tier.ids.length;
      const points = new Set(tier.ids.map((f) => finishDef(config, f).points));
      expect(points.size).toBe(1);
      for (const f of tier.ids) expect(type.finishWeights[f]).toBeCloseTo(share, 12);
    }
  });

  it('keeps signed puffs between rubis and galaxie, and 100 % in total', () => {
    expect(sumsTo100(type.engravingWeights)).toBe(true);
    expect(type.engravingWeights.signature).toBeLessThanOrEqual(type.finishWeights.ruby);
    expect(type.engravingWeights.signature).toBeGreaterThanOrEqual(type.finishWeights.cosmic);
  });

  it('smokes sum to 100 %, white stays at 50 % or more, each kind rarer than the previous', () => {
    expect(sumsTo100(type.smokeWeights)).toBe(true);
    expect(type.smokeWeights.white).toBeGreaterThanOrEqual(50);
    SMOKE_KINDS.slice(1).forEach((k, i) => {
      expect(type.smokeWeights[k]).toBeLessThan(type.smokeWeights[SMOKE_KINDS[i] as typeof k]);
    });
  });

  it('shapes sum to 100 %: rings and hearts exactly as rare, spiral the rarest', () => {
    const w = type.smokeShapeWeights;
    expect(sumsTo100(w)).toBe(true);
    expect(w.rings).toBe(w.hearts);
    for (const s of SMOKE_SHAPES.filter((s) => s !== 'spiral')) expect(w.spiral).toBeLessThan(w[s]);
    expect(w.cloud).toBeGreaterThan(w.rings);
  });

  it('base tiers sum to 100 %, bigger capacity rarer', () => {
    const w = type.baseTierWeights;
    expect(w).toHaveLength(config.baseTiers.tiers.length);
    expect(totalWeight(Object.fromEntries(w.map((v, i) => [i, v])))).toBeCloseTo(100, 9);
    w.slice(1).forEach((v, i) => expect(v).toBeLessThan(w[i] as number));
  });

  it('can draw every global rarity: Commune the likeliest, Divine the rarest', () => {
    const dist = exactRarityDistribution(catalog, type, config);
    const values = config.rarities.map((r) => dist[r.id]);
    for (const v of values) expect(v).toBeGreaterThan(0);
    expect(Math.max(...values)).toBe(values[0]);
    expect(Math.min(...values)).toBe(values.at(-1));
    // A pyramid, except in Dopamine maxing, generous enough to make Légendaire bulge.
    if (id === 'dopamine') return;
    values.slice(1).forEach((p, i) => expect(p).toBeLessThan(values[i] as number));
  });

  it(`follows its rates over ${DRAWS.toLocaleString('en')} openings`, () => {
    for (const f of FINISH_IDS) expectNear(sim.finish[f], type.finishWeights[f]);
    for (const s of SMOKE_KINDS) expectNear(sim.smoke[s], type.smokeWeights[s]);
    for (const s of SMOKE_SHAPES) expectNear(sim.shape[s], type.smokeShapeWeights[s]);
    for (const e of ENGRAVING_KINDS) expectNear(sim.engraving[e], type.engravingWeights[e]);
  });
});

describe('from one booster to the next', () => {
  const [classic, nicotine, dopamine] = config.boosterTypes.map((t) => boosterType(config, t.id));
  if (!classic || !nicotine || !dopamine) throw new Error('Three boosters expected');
  const plain = (t: typeof classic) => t.finishWeights.normal + t.finishWeights.glitch;

  it('classic: dorée is the best one can hope for, rubis and galaxie are a miracle', () => {
    expect(classic.finishWeights.golden).toBeGreaterThanOrEqual(2);
    expect(classic.finishWeights.ruby).toBeLessThanOrEqual(0.2);
    expect(classic.finishWeights.cosmic).toBeLessThanOrEqual(0.05);
  });

  it('gets luckier: fewer plain and glitch puffs, more of every rarer finish', () => {
    expect(plain(nicotine)).toBeLessThan(plain(classic));
    expect(plain(dopamine)).toBeLessThan(plain(nicotine));
    for (const f of FINISH_IDS.filter((f) => f !== 'normal' && f !== 'glitch')) {
      expect(nicotine.finishWeights[f]).toBeGreaterThan(classic.finishWeights[f]);
      expect(dopamine.finishWeights[f]).toBeGreaterThan(nicotine.finishWeights[f]);
    }
  });

  it('gets luckier on the global rarity too, and costs more', () => {
    const atLeastLegendary = (t: typeof classic) => {
      const dist = exactRarityDistribution(catalog, t, config);
      const from = rarityIndex(config, 'legendary');
      return config.rarities.slice(from).reduce((s, r) => s + dist[r.id], 0);
    };
    expect(atLeastLegendary(nicotine)).toBeGreaterThan(atLeastLegendary(classic));
    expect(atLeastLegendary(dopamine)).toBeGreaterThan(atLeastLegendary(nicotine));
    expect(classic.cost).toBeLessThan(nicotine.cost);
    expect(nicotine.cost).toBeLessThan(dopamine.cost);
  });
});
