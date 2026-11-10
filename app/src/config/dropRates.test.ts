import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../domain/catalog.ts';
import { simulateBoosters } from '../domain/distribution.ts';
import { sumsTo100, totalWeight } from '../domain/dropRates.ts';
import { finishDef } from '../domain/rarity.ts';
import { createSeededRng } from '../domain/rng.ts';
import { boosterType } from '../domain/roll.ts';
import { definitions } from '../domain/testing/fixtures.ts';
import { ENGRAVING_KINDS, FINISH_IDS, SMOKE_KINDS } from '../domain/types.ts';
import { dropRates, gameConfig as config } from './gameConfig.ts';

const classic = boosterType(config, 'classic');
const DRAWS = 100_000;
const sim = simulateBoosters(
  buildCatalog(definitions, config),
  classic,
  config,
  createSeededRng(2026),
  DRAWS,
);

/** Simulated share within 5 standard deviations of the expected one (p in %). */
function expectNear(count: number, percent: number) {
  const p = percent / 100;
  const sigma = Math.sqrt((p * (1 - p)) / DRAWS);
  expect(Math.abs(count / DRAWS - p)).toBeLessThanOrEqual(5 * sigma + 1e-9);
}

describe('drop rates', () => {
  it('finish tiers sum to 100 % and cover every finish exactly once', () => {
    expect(sumsTo100(classic.finishWeights)).toBe(true);
    expect(
      totalWeight(Object.fromEntries(dropRates.finishTiers.map((t, i) => [i, t.weight]))),
    ).toBe(100);
    const ids = dropRates.finishTiers.flatMap((t) => t.ids);
    expect([...ids].sort()).toEqual([...FINISH_IDS].sort());
  });

  it('has 7 finish tiers, each rarer than the one below and worth at least as many points', () => {
    const tiers = dropRates.finishTiers;
    expect(tiers).toHaveLength(7);
    tiers.slice(1).forEach((tier, i) => {
      const below = tiers[i] as (typeof tiers)[number];
      expect(tier.weight).toBeLessThan(below.weight);
      const points = Math.min(...tier.ids.map((id) => finishDef(config, id).points));
      const pointsBelow = Math.max(...below.ids.map((id) => finishDef(config, id).points));
      expect(points).toBeGreaterThan(pointsBelow);
    });
    // Within a tier, every finish has the same weight and the same points.
    for (const tier of tiers) {
      const share = tier.weight / tier.ids.length;
      const points = new Set(tier.ids.map((id) => finishDef(config, id).points));
      expect(points.size).toBe(1);
      for (const id of tier.ids) expect(classic.finishWeights[id]).toBeCloseTo(share, 12);
    }
  });

  it('keeps signed puffs very rare: between rubis and galaxie, and 100 % in total', () => {
    expect(sumsTo100(classic.engravingWeights)).toBe(true);
    expect(classic.engravingWeights.signature).toBeLessThanOrEqual(classic.finishWeights.ruby);
    expect(classic.engravingWeights.signature).toBeGreaterThanOrEqual(classic.finishWeights.cosmic);
  });

  it('smokes sum to 100 %, white stays the classic at 50 % or more, gachapuff is the rarest', () => {
    expect(sumsTo100(classic.smokeWeights)).toBe(true);
    expect(classic.smokeWeights.white).toBeGreaterThanOrEqual(50);
    const others = SMOKE_KINDS.filter((k) => k !== 'gachapuff');
    for (const k of others) {
      expect(classic.smokeWeights.gachapuff).toBeLessThan(classic.smokeWeights[k]);
    }
  });

  it(`follows the finish rates over ${DRAWS.toLocaleString('en')} openings`, () => {
    for (const id of FINISH_IDS) expectNear(sim.finish[id], classic.finishWeights[id]);
  });

  it('follows the smoke rates', () => {
    for (const id of SMOKE_KINDS) expectNear(sim.smoke[id], classic.smokeWeights[id]);
  });

  it('follows the signed puff rate', () => {
    for (const id of ENGRAVING_KINDS) expectNear(sim.engraving[id], classic.engravingWeights[id]);
  });
});
