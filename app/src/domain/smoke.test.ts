import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng.ts';
import { colorName, rollSmoke, smokeColorNames } from './smoke.ts';
import { config } from './testing/fixtures.ts';

describe('smoke colours', () => {
  it('names palette colours, and the closest one for older random colours', () => {
    expect(colorName(config, '#ff2d87')).toBe('rose néon');
    expect(colorName(config, '#FFA82E')).toBe('orange');
    expect(colorName(config, '#ff3090')).toBe('rose néon');
    expect(colorName(config, '#20dde0')).toBe('turquoise');
  });

  it('lists the readable colours of a smoke, none for a white one', () => {
    expect(smokeColorNames(config, { kind: 'white' })).toEqual([]);
    expect(smokeColorNames(config, { kind: 'rainbow' })).toEqual(['arc-en-ciel']);
    expect(smokeColorNames(config, { kind: 'duo', colors: ['#ff2d87', '#ffa82e'] })).toEqual([
      'rose néon',
      'orange',
    ]);
    expect(smokeColorNames(config, { kind: 'solid', color: '#22e0e6' })).toEqual(['turquoise']);
  });

  it('draws random colours except for white, rainbow and the gachapuff smoke', () => {
    const rng = createSeededRng(4);
    const solids = new Set(
      Array.from({ length: 200 }, () => {
        const smoke = rollSmoke(rng, config, 'solid');
        return smoke.kind === 'solid' ? smoke.color : '';
      }),
    );
    expect(solids.size).toBeGreaterThan(5);
    expect(rollSmoke(rng, config, 'white', 'hearts')).toEqual({ kind: 'white', shape: 'hearts' });
    expect(rollSmoke(rng, config, 'rainbow')).toEqual({ kind: 'rainbow' });
    for (let i = 0; i < 20; i++) {
      expect(rollSmoke(rng, config, 'gachapuff')).toEqual({
        kind: 'gachapuff',
        colors: config.smokeColors.gachapuff,
      });
    }
  });
});
