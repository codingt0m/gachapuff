import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';
import { parsePuffCount, slugify } from './naming.ts';

describe('slugify', () => {
  it('builds stable url-safe slugs', () => {
    expect(slugify('Big Mac 100K')).toBe('big-mac-100k');
    expect(slugify('Pêche Glacée')).toBe('peche-glacee');
    expect(slugify('Falcon Gem+ 30K')).toBe('falcon-gem-plus-30k');
    expect(slugify('  Chicspire 26.5K ')).toBe('chicspire-26-5k');
  });
});

describe('parsePuffCount', () => {
  it('extracts the capacity from the model name', () => {
    expect(parsePuffCount('Alien 10K')).toBe(10_000);
    expect(parsePuffCount('Chicspire 26.5K')).toBe(26_500);
    expect(parsePuffCount('Quads 4in1 120K')).toBe(120_000);
    expect(parsePuffCount('Cruiser')).toBeNull();
    expect(parsePuffCount('Glide Pen')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('handles quotes, separators inside quotes and CRLF', () => {
    expect(parseCsv('a;b\r\n"x;y";"he said ""hi"""\r\n', ';')).toEqual([
      ['a', 'b'],
      ['x;y', 'he said "hi"'],
    ]);
  });
});
