import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog.ts';
import { exactRarityDistribution, simulateBoosters } from './distribution.ts';
import { createSeededRng } from './rng.ts';
import { boosterType, enumerateOutcomes, rollBooster, rollForRarity } from './roll.ts';
import { catalog, config, definitions } from './testing/fixtures.ts';
import { FINISH_IDS, type BoosterType, type FinishId } from './types.ts';

const classic = boosterType(config, 'classic');

describe('rollBooster', () => {
  it('is deterministic with a seeded rng', () => {
    const a = rollBooster(catalog, classic, config, createSeededRng(5));
    const b = rollBooster(catalog, classic, config, createSeededRng(5));
    expect(a).toEqual(b);
  });

  it('never draws an excluded model', () => {
    const rng = createSeededRng(11);
    for (let i = 0; i < 2_000; i++) {
      expect(rollBooster(catalog, classic, config, rng).puff.model).not.toBe('Non classe');
    }
  });

  it('draws smoke colours matching the smoke kind', () => {
    const rng = createSeededRng(12);
    const palette = config.smokeColors.palette.map((c) => c.hex);
    for (let i = 0; i < 5_000; i++) {
      const { smoke } = rollBooster(catalog, classic, config, rng);
      if (smoke.kind === 'solid' || smoke.kind === 'glitter') {
        expect(palette).toContain(smoke.color);
      }
      if (smoke.kind === 'duo') {
        expect(smoke.colors).toHaveLength(2);
        expect(smoke.colors[0]).not.toBe(smoke.colors[1]);
        for (const c of smoke.colors) expect(palette).toContain(c);
      }
      // The gachapuff smoke always has the brand colours.
      if (smoke.kind === 'gachapuff') expect(smoke.colors).toEqual(config.smokeColors.gachapuff);
      // 'cloud' is stored as an absent shape.
      expect(smoke.shape).not.toBe('cloud');
    }
  });

  it('matches the exact distribution over 100 000 openings', () => {
    const sim = simulateBoosters(catalog, classic, config, createSeededRng(2026), 100_000);
    const exact = exactRarityDistribution(catalog, classic, config);
    for (const tier of config.rarities) {
      const p = exact[tier.id];
      const sigma = Math.sqrt((p * (1 - p)) / sim.draws);
      expect(Math.abs(sim.rarity[tier.id] / sim.draws - p)).toBeLessThan(5 * sigma + 1e-4);
    }
  });

  it('skips base tiers with no puff in the catalog', () => {
    const small = buildCatalog(definitions.slice(0, 2), config);
    const rng = createSeededRng(4);
    for (let i = 0; i < 500; i++) {
      expect(small.baseTierOf.get(rollBooster(small, classic, config, rng).puff.id)).toBe(0);
    }
  });

  it('supports other booster types (drop tables)', () => {
    const titanOnly: BoosterType = {
      ...classic,
      id: 'titan',
      baseTierWeights: [0, 0, 0, 0, 1],
      finishWeights: {
        ...Object.fromEntries(FINISH_IDS.map((f) => [f, 0])),
        cosmic: 1,
      } as Record<FinishId, number>,
    };
    const roll = rollBooster(catalog, titanOnly, config, createSeededRng(1));
    expect(roll.puff.model).toBe('Big Mac 100K');
    expect(roll.finish).toBe('cosmic');
  });
});

describe('rollForRarity', () => {
  it('always lands on the requested rarity', () => {
    const rng = createSeededRng(77);
    for (const tier of config.rarities) {
      for (let i = 0; i < 300; i++) {
        expect(rollForRarity(catalog, classic, config, tier.id, rng).rarity).toBe(tier.id);
      }
    }
  });

  it('follows the booster odds within the tier', () => {
    // Share of plain finishes among the "uncommon" outcomes, exact vs drawn.
    const uncommon = enumerateOutcomes(catalog, classic, config).filter(
      (o) => o.rarity === 'uncommon',
    );
    const total = uncommon.reduce((s, o) => s + o.probability, 0);
    const p =
      uncommon.filter((o) => o.finish === 'normal').reduce((s, o) => s + o.probability, 0) / total;
    const rng = createSeededRng(8);
    const draws = 5_000;
    let normal = 0;
    for (let i = 0; i < draws; i++) {
      if (rollForRarity(catalog, classic, config, 'uncommon', rng).finish === 'normal') normal++;
    }
    expect(Math.abs(normal / draws - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / draws));
  });
});
