import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog.ts';
import { exactRarityDistribution, simulateBoosters } from './distribution.ts';
import { createSeededRng } from './rng.ts';
import { boosterType, rollBooster, rollForRarity } from './roll.ts';
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
    for (let i = 0; i < 5_000; i++) {
      const { smoke } = rollBooster(catalog, classic, config, rng);
      if (smoke.kind === 'solid' || smoke.kind === 'glitter') {
        expect(smoke.color).toMatch(/^#[0-9a-f]{6}$/);
      }
      if ('colors' in smoke) {
        expect(smoke.colors.length).toBeGreaterThanOrEqual(2);
        expect(smoke.colors.length).toBeLessThanOrEqual(3);
      }
      // 'cloud' is stored as an absent shape.
      expect(smoke.shape).not.toBe('cloud');
    }
  });

  it('draws serial numbers inside the edition', () => {
    const rng = createSeededRng(7);
    let serials = 0;
    for (let i = 0; i < 5_000; i++) {
      const { engraving } = rollBooster(catalog, classic, config, rng);
      if (engraving.kind !== 'serial') continue;
      serials++;
      expect(engraving.serial).toBeGreaterThanOrEqual(1);
      expect(engraving.serial).toBeLessThanOrEqual(config.serialEdition);
    }
    expect(serials).toBeGreaterThan(0);
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
    // Within "uncommon", most outcomes come from base tier 2 + normal + white.
    const rng = createSeededRng(8);
    let normal = 0;
    for (let i = 0; i < 5_000; i++) {
      if (rollForRarity(catalog, classic, config, 'uncommon', rng).finish === 'normal') normal++;
    }
    expect(normal / 5_000).toBeGreaterThan(0.5);
  });
});
