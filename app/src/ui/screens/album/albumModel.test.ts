import { describe, expect, it } from 'vitest';
import { catalog, config, instance } from '../../../domain/testing/fixtures.ts';
import { buildAlbum, DEFAULT_FILTERS } from './albumModel.ts';

const collection = [
  instance({ uid: '1', puffId: 'alien-10k--mango', rarity: 'common', obtainedAt: 1 }),
  instance({
    uid: '2',
    puffId: 'alien-10k--mango',
    rarity: 'epic',
    finish: 'chromatic',
    points: 5,
    obtainedAt: 2,
  }),
  instance({ uid: '3', puffId: 'big-mac-100k--melon', rarity: 'rare', points: 4, obtainedAt: 3 }),
];

describe('buildAlbum', () => {
  it('groups every catalog puff by model, with progress', () => {
    const sections = buildAlbum(catalog, collection, config, DEFAULT_FILTERS);
    expect(sections.map((s) => s.model)).toEqual(catalog.models);
    const alien = sections.find((s) => s.model === 'Alien 10K');
    expect(alien).toMatchObject({ owned: 1, total: 2 });
    expect(alien?.entries.find((e) => e.puff.id === 'alien-10k--mango')?.count).toBe(2);
  });

  it('filters owned / missing', () => {
    const owned = buildAlbum(catalog, collection, config, {
      ...DEFAULT_FILTERS,
      ownership: 'owned',
    });
    expect(
      owned
        .flatMap((s) => s.entries)
        .map((e) => e.puff.id)
        .sort(),
    ).toEqual(['alien-10k--mango', 'big-mac-100k--melon']);
    const missing = buildAlbum(catalog, collection, config, {
      ...DEFAULT_FILTERS,
      ownership: 'missing',
    });
    expect(missing.flatMap((s) => s.entries)).toHaveLength(catalog.puffs.length - 2);
  });

  it('filters on copies (finish) and shows the matching copy first', () => {
    const [section] = buildAlbum(catalog, collection, config, {
      ...DEFAULT_FILTERS,
      finish: 'chromatic',
      sort: 'rarity',
    });
    expect(section?.entries.map((e) => e.instances[0]?.uid)).toEqual(['2']);
  });

  it('sorts by rarity, owned first', () => {
    const [section] = buildAlbum(catalog, collection, config, {
      ...DEFAULT_FILTERS,
      sort: 'rarity',
    });
    expect(section?.entries.slice(0, 2).map((e) => e.puff.id)).toEqual([
      'alien-10k--mango',
      'big-mac-100k--melon',
    ]);
    expect(section?.entries.at(-1)?.count).toBe(0);
  });

  it('sorts by number of copies owned, most first, reversible, missing puffs last', () => {
    const many = [
      ...collection,
      instance({ uid: '4', puffId: 'big-mac-100k--melon', obtainedAt: 4 }),
      instance({ uid: '5', puffId: 'big-mac-100k--melon', obtainedAt: 5 }),
      instance({ uid: '6', puffId: 'cruiser--mint', obtainedAt: 6 }),
    ];
    const ids = (sort: 'copies' | 'copies-asc') => {
      const [section] = buildAlbum(catalog, many, config, { ...DEFAULT_FILTERS, sort });
      return section?.entries.map((e) => [e.puff.id, e.count]) ?? [];
    };
    const desc = ids('copies');
    expect(desc.slice(0, 3)).toEqual([
      ['big-mac-100k--melon', 3],
      ['alien-10k--mango', 2],
      ['cruiser--mint', 1],
    ]);
    const asc = ids('copies-asc');
    expect(asc.slice(0, 3)).toEqual([
      ['cruiser--mint', 1],
      ['alien-10k--mango', 2],
      ['big-mac-100k--melon', 3],
    ]);
    expect(desc.at(-1)?.[1]).toBe(0);
    expect(asc.at(-1)?.[1]).toBe(0);
  });

  it('sorts by most recent', () => {
    const [section] = buildAlbum(catalog, collection, config, {
      ...DEFAULT_FILTERS,
      sort: 'recent',
    });
    expect(section?.entries[0]?.puff.id).toBe('big-mac-100k--melon');
  });
});
