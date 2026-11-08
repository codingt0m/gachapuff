/**
 * Builds the game assets from the dataset:
 *   dataset/notes.csv + dataset/<Model>/<Flavor>.png  ->  public/puffs/
 *     <model-slug>/<flavor-slug>-512.webp   detail view
 *     <model-slug>/<flavor-slug>-256.webp   album grid
 *     manifest.json                         catalog consumed by the game
 *
 * Idempotent: a cache keyed on each source file's size + mtime skips unchanged images.
 * Usage: npm run assets [-- --force]
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { analysePixels, type PixelAnalysis } from './lib/analyse.ts';
import { parseCsv } from './lib/csv.ts';
import { parsePuffCount, slugify } from './lib/naming.ts';

const PIPELINE_VERSION = 4; // bump when the encoding or the analysis changes
const SIZES = { detail: 512, thumb: 256 } as const;
const ANALYSIS_SIZE = 128;
const WEBP = { quality: 82, alphaQuality: 90, effort: 4 } as const;

/** Models whose source images are stored upside down: rotated 180° before encoding and analysis. */
const UPSIDE_DOWN_MODELS = new Set(['mega-shisha-hookah-100k']);

const APP_DIR = path.resolve(import.meta.dirname, '..');
const DATASET_DIR = path.resolve(APP_DIR, '..', 'dataset');
const OUT_DIR = path.join(APP_DIR, 'public', 'puffs');
const CACHE_FILE = path.join(OUT_DIR, '.cache.json');

interface NoteRow {
  model: string;
  flavor: string;
  file: string;
  integrity: number;
  resolution: number;
}

interface CacheEntry extends PixelAnalysis {
  signature: string;
}

interface Cache {
  version: number;
  entries: Record<string, CacheEntry>;
}

const BOM = 0xfeff;
const stripBom = (text: string) => (text.charCodeAt(0) === BOM ? text.slice(1) : text);

async function readNotes(): Promise<NoteRow[]> {
  const text = await readFile(path.join(DATASET_DIR, 'notes.csv'), 'utf8');
  const [header, ...rows] = parseCsv(stripBom(text), ';');
  if (!header) throw new Error('notes.csv is empty');
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`notes.csv: missing column "${name}"`);
    return index;
  };
  const c = {
    model: col('modele'),
    flavor: col('saveur'),
    file: col('fichier'),
    integrity: col('integrite_sur_5'),
    resolution: col('resolution_sur_5'),
  };
  return rows
    .filter((r) => r.length > 1)
    .map((r) => ({
      model: r[c.model] ?? '',
      flavor: r[c.flavor] ?? '',
      file: r[c.file] ?? '',
      integrity: Number(r[c.integrity]),
      resolution: Number(r[c.resolution]),
    }));
}

async function readCache(force: boolean): Promise<Cache> {
  if (force || !existsSync(CACHE_FILE)) return { version: PIPELINE_VERSION, entries: {} };
  const cache = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as Cache;
  return cache.version === PIPELINE_VERSION ? cache : { version: PIPELINE_VERSION, entries: {} };
}

async function processOne(
  src: string,
  outBase: string,
  cached: CacheEntry | undefined,
  flip: boolean,
): Promise<{ entry: CacheEntry; built: boolean }> {
  const s = await stat(src);
  const signature = `${s.size}:${Math.round(s.mtimeMs)}${flip ? ':flip' : ''}`;
  const outputs = Object.values(SIZES).map((size) => `${outBase}-${size}.webp`);
  if (cached?.signature === signature && outputs.every((o) => existsSync(o))) {
    return { entry: cached, built: false };
  }
  await mkdir(path.dirname(outBase), { recursive: true });
  const input = (flip ? sharp(src).rotate(180) : sharp(src)).ensureAlpha();
  await Promise.all(
    Object.values(SIZES).map((size) =>
      input
        .clone()
        .resize(size, size, { fit: 'contain', kernel: 'lanczos3' })
        .webp(WEBP)
        .toFile(`${outBase}-${size}.webp`),
    ),
  );
  const { data } = await input
    .clone()
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'contain' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { entry: { signature, ...analysePixels(data, ANALYSIS_SIZE) }, built: true };
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const force = process.argv.includes('--force');
  if (!existsSync(DATASET_DIR)) {
    throw new Error(`Dataset not found at ${DATASET_DIR} (see the README to rebuild it).`);
  }
  const notes = await readNotes();
  const cache = await readCache(force);
  const seen = new Set<string>();
  const started = performance.now();
  let built = 0;

  const puffs = await mapConcurrent(
    notes,
    Math.max(2, os.availableParallelism() - 1),
    async (n) => {
      const modelSlug = slugify(n.model);
      const flavorSlug = slugify(n.flavor);
      const id = `${modelSlug}--${flavorSlug}`;
      if (seen.has(id)) throw new Error(`Duplicate puff id "${id}"`);
      seen.add(id);
      const rel = `${modelSlug}/${flavorSlug}`;
      const result = await processOne(
        path.join(DATASET_DIR, n.file),
        path.join(OUT_DIR, rel),
        cache.entries[id],
        UPSIDE_DOWN_MODELS.has(modelSlug),
      );
      cache.entries[id] = result.entry;
      if (result.built) built++;
      const { color, nozzle, bbox } = result.entry;
      return {
        id,
        model: n.model,
        modelSlug,
        flavor: n.flavor,
        puffs: parsePuffCount(n.model),
        images: {
          thumb: `puffs/${rel}-${SIZES.thumb}.webp`,
          detail: `puffs/${rel}-${SIZES.detail}.webp`,
        },
        quality: { integrity: n.integrity, resolution: n.resolution },
        color,
        nozzle,
        bbox,
      };
    },
  );

  // Forget cache entries for puffs that left the dataset.
  cache.entries = Object.fromEntries(Object.entries(cache.entries).filter(([id]) => seen.has(id)));

  puffs.sort((a, b) => a.model.localeCompare(b.model) || a.flavor.localeCompare(b.flavor));
  const manifest = { version: 1, count: puffs.length, puffs };
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(CACHE_FILE, JSON.stringify(cache));
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.info(
    `${puffs.length} puffs, ${built} rebuilt, ${puffs.length - built} cached (${seconds}s)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
