/**
 * Simulates booster openings with the real catalog and src/config/gameConfig.ts.
 * Checks that every drop table sums to 100 % and compares the simulated rates with them.
 * Usage: npm run simulate [-- --draws 100000 --seed 1 --booster classic]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gameConfig } from '../src/config/gameConfig.ts';
import { buildCatalog } from '../src/domain/catalog.ts';
import { exactRarityDistribution, simulateBoosters } from '../src/domain/distribution.ts';
import { totalWeight } from '../src/domain/dropRates.ts';
import { createSeededRng } from '../src/domain/rng.ts';
import { boosterType } from '../src/domain/roll.ts';
import type { PuffDefinition } from '../src/domain/types.ts';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const draws = Number(arg('draws', '100000'));
const seed = Number(arg('seed', String(Date.now())));
const type = boosterType(gameConfig, arg('booster', gameConfig.defaultBoosterType));

const manifestPath = path.resolve(import.meta.dirname, '..', 'public', 'puffs', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { puffs: PuffDefinition[] };
const catalog = buildCatalog(manifest.puffs, gameConfig);
const exact = exactRarityDistribution(catalog, type, gameConfig);
const sim = simulateBoosters(catalog, type, gameConfig, createSeededRng(seed), draws);

const NAME = 16;
const pct = (v: number) => `${(v * 100).toFixed(3).padStart(7)} %`;
const oneIn = (v: number) => (v > 0 ? `1 / ${(1 / v).toFixed(1)}` : '—');

/** Prints simulated vs expected rates of one axis; false when its weights miss 100 %. */
function table<K extends string>(
  title: string,
  rows: readonly { id: K; name: string }[],
  weights: Record<K, number>,
  counts: Record<K, number>,
): boolean {
  const total = totalWeight(weights);
  const ok = Math.abs(total - 100) < 1e-9;
  const sum = ok ? `somme ${total} %` : `somme ${total} % ≠ 100 % !`;
  console.info(`\n${title.padEnd(NAME)} simulée    attendue   (${sum})`);
  for (const r of rows) {
    const expected = pct((weights[r.id] ?? 0) / 100);
    console.info(`${r.name.padEnd(NAME)} ${pct(counts[r.id] / draws)}  ${expected}`);
  }
  return ok;
}

console.info(`${type.name}: ${draws.toLocaleString('fr-FR')} ouvertures (graine ${seed})`);
console.info(`Catalogue : ${catalog.puffs.length} puffs, ${catalog.models.length} modèles\n`);
console.info(`${'Rareté'.padEnd(NAME)} simulée      exacte      fréquence`);
for (const tier of gameConfig.rarities) {
  const p = sim.rarity[tier.id] / draws;
  console.info(
    `${tier.name.padEnd(NAME)} ${pct(p)}  ${pct(exact[tier.id])}   ${oneIn(exact[tier.id])}`,
  );
}
const sums = [
  table(
    'Finition',
    gameConfig.finishes.map((f) => ({ id: f.id, name: f.name })),
    type.finishWeights,
    sim.finish,
  ),
  table(
    'Fumée',
    gameConfig.smokes.map((s) => ({ id: s.kind, name: s.name })),
    type.smokeWeights,
    sim.smoke,
  ),
  table(
    'Puff signée',
    gameConfig.engravings.map((e) => ({ id: e.kind, name: e.name })),
    type.engravingWeights,
    sim.engraving,
  ),
];
console.info('\nForme de fumée');
for (const s of gameConfig.smokeShapes)
  console.info(`${s.name.padEnd(NAME)} ${pct(sim.shape[s.shape] / draws)}`);
console.info('\nPalier de base');
gameConfig.baseTiers.tiers.forEach((t, i) => {
  const size = catalog.byBaseTier[i]?.length ?? 0;
  console.info(`${t.name.padEnd(NAME)} ${pct((sim.baseTier[i] ?? 0) / draws)}  (${size} puffs)`);
});
console.info(`\nPuffs distinctes vues : ${sim.distinctPuffs} / ${catalog.puffs.length}`);
if (sums.includes(false)) {
  console.error('\nUne table de drop ne fait pas 100 % : corrige src/config/gameConfig.ts.');
  process.exitCode = 1;
}
