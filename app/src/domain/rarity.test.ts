import { describe, expect, it } from 'vitest';
import { baseTierFor, buildCatalog } from './catalog.ts';
import { exactRarityDistribution } from './distribution.ts';
import { nextRarity, rarityForPoints, rarityPoints } from './rarity.ts';
import { boosterType, enumerateOutcomes } from './roll.ts';
import { catalog, config, definitions } from './testing/fixtures.ts';

describe('base tiers', () => {
  it('derives the tier from the capacity', () => {
    expect(baseTierFor('Alien 10K', 10_000, config)).toBe(0);
    expect(baseTierFor('Mega Box 25K', 25_000, config)).toBe(1);
    expect(baseTierFor('X 35K', 35_000, config)).toBe(2);
    expect(baseTierFor('X 50K', 50_000, config)).toBe(3);
    expect(baseTierFor('Big Mac 100K', 100_000, config)).toBe(4);
  });

  it('uses the configured tier for unknown capacities, and manual overrides first', () => {
    expect(baseTierFor('Cruiser', null, config)).toBe(config.baseTiers.unknownCapacityTier);
    const custom = {
      ...config,
      baseTiers: { ...config.baseTiers, modelOverrides: { 'Alien 10K': 3 } },
    };
    expect(baseTierFor('Alien 10K', 10_000, custom)).toBe(3);
  });

  it('excludes the configured models from the catalog', () => {
    expect(catalog.puffs).toHaveLength(definitions.length - 1);
    expect(catalog.models).not.toContain('Non classe');
  });
});

describe('global rarity', () => {
  it('sums the points of the three axes', () => {
    expect(rarityPoints(config, 0, 'normal', 'white')).toBe(0);
    expect(rarityPoints(config, 4, 'cosmic', 'gradient')).toBe(4 + 7 + 2);
  });

  it('maps points to the highest reached tier', () => {
    expect(rarityForPoints(config, 0).id).toBe('common');
    expect(rarityForPoints(config, 1).id).toBe('common');
    expect(rarityForPoints(config, 2).id).toBe('uncommon');
    expect(rarityForPoints(config, 9).id).toBe('mythic');
    expect(rarityForPoints(config, 99).id).toBe('divine');
  });

  it('has a next tier everywhere but the last one', () => {
    expect(nextRarity(config, 'common')?.id).toBe('uncommon');
    expect(nextRarity(config, 'divine')).toBeNull();
  });

  it('keeps tier thresholds strictly increasing', () => {
    const thresholds = config.rarities.map((r) => r.minPoints);
    expect(thresholds[0]).toBe(0);
    thresholds.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(thresholds[i] as number));
  });
});

describe('default configuration', () => {
  const full = buildCatalog(definitions, config);
  const type = boosterType(config, config.defaultBoosterType);

  it('has outcome probabilities summing to 1', () => {
    const total = enumerateOutcomes(full, type, config).reduce((s, o) => s + o.probability, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('can produce every rarity tier (so every tier can be recycled into)', () => {
    const dist = exactRarityDistribution(full, type, config);
    for (const tier of config.rarities) expect(dist[tier.id]).toBeGreaterThan(0);
  });

  it('is a pyramid: each tier is rarer than the one below', () => {
    const dist = exactRarityDistribution(full, type, config);
    const values = config.rarities.map((r) => dist[r.id]);
    values.slice(1).forEach((p, i) => expect(p).toBeLessThan(values[i] as number));
  });
});
