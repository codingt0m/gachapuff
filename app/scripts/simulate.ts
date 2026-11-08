/**
 * Simulates booster openings with the real catalog and src/config/gameConfig.ts.
 * Usage: npm run simulate [-- --draws 100000 --seed 1 --booster classic]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gameConfig } from '../src/config/gameConfig.ts';
import { buildCatalog } from '../src/domain/catalog.ts';
import { exactRarityDistribution, simulateBoosters } from '../src/domain/distribution.ts';
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

const pct = (v: number) => `${(v * 100).toFixed(3).padStart(7)} %`;
const oneIn = (v: number) => (v > 0 ? `1 / ${(1 / v).toFixed(1)}` : '—');

console.info(`${type.name}: ${draws.toLocaleString('fr-FR')} ouvertures (graine ${seed})`);
console.info(`Catalogue : ${catalog.puffs.length} puffs, ${catalog.models.length} modèles\n`);
console.info('Rareté        simulée      exacte      fréquence');
for (const tier of gameConfig.rarities) {
  const p = sim.rarity[tier.id] / draws;
  console.info(
    `${tier.name.padEnd(12)} ${pct(p)}  ${pct(exact[tier.id])}   ${oneIn(exact[tier.id])}`,
  );
}
console.info('\nFinition');
for (const f of gameConfig.finishes)
  console.info(`${f.name.padEnd(12)} ${pct(sim.finish[f.id] / draws)}`);
console.info('\nFumée');
for (const s of gameConfig.smokes)
  console.info(`${s.name.padEnd(12)} ${pct(sim.smoke[s.kind] / draws)}`);
console.info('\nForme de fumée');
for (const s of gameConfig.smokeShapes)
  console.info(`${s.name.padEnd(12)} ${pct(sim.shape[s.shape] / draws)}`);
console.info('\nGravure');
for (const e of gameConfig.engravings)
  console.info(`${e.name.padEnd(12)} ${pct(sim.engraving[e.kind] / draws)}`);
console.info('\nPalier de base');
gameConfig.baseTiers.tiers.forEach((t, i) => {
  const size = catalog.byBaseTier[i]?.length ?? 0;
  console.info(`${t.name.padEnd(12)} ${pct((sim.baseTier[i] ?? 0) / draws)}  (${size} puffs)`);
});
console.info(`\nPuffs distinctes vues : ${sim.distinctPuffs} / ${catalog.puffs.length}`);
