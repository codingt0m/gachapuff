import { render } from '../../config/motion.ts';
import { loadImage } from './gl.ts';
import { computeVolume, type VolumeData, type VolumeInput } from './volumeData.ts';

/**
 * Puff reliefs, computed in a Worker and kept per image. Built inside the reveal they took
 * a ~70 ms (fast CPU) to ~270 ms (phone) block on the main thread; the opening now starts
 * them while the pack is still closed (`prepareVolume`).
 */

const CACHE_SIZE = 6;
const cache = new Map<string, Promise<VolumeData>>();

interface PuffShape {
  imageUrl: string;
  bbox: { w: number; h: number };
  nozzle: { x: number; y: number };
}

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (d: VolumeData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./volumeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; data?: VolumeData; error?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.data) job.resolve(event.data.data);
      else job.reject(new Error(event.data.error ?? 'volume worker failed'));
    };
    worker.onerror = () => {
      // Unusable worker: settle what is waiting on the main thread, and stop using it.
      worker?.terminate();
      worker = null;
      for (const job of pending.values()) job.reject(new Error('volume worker crashed'));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Silhouette mask (alpha > 50 %) at the field resolution. Cheap: one small drawImage. */
function readMask(image: HTMLImageElement): Uint8Array {
  const size = render.volume.fieldSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const mask = new Uint8Array(size * size);
  if (ctx) {
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < mask.length; i++) mask[i] = (pixels[i * 4 + 3] ?? 0) > 127 ? 1 : 0;
  }
  return mask;
}

/** In the worker when there is one, else (or if it fails) on the main thread. */
function compute(input: VolumeInput): Promise<VolumeData> {
  const w = getWorker();
  if (!w) return Promise.resolve().then(() => computeVolume(input));
  // The mask is transferred to the worker: keep a copy for the main-thread fallback.
  const fallback = { ...input, mask: input.mask.slice() };
  const id = nextId++;
  return new Promise<VolumeData>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, input }, [input.mask.buffer]);
  }).catch(() => computeVolume(fallback));
}

/** The relief of a puff image (shared by every renderer showing it). */
export function loadVolume(shape: PuffShape): Promise<VolumeData> {
  const cached = cache.get(shape.imageUrl);
  if (cached) {
    cache.delete(shape.imageUrl);
    cache.set(shape.imageUrl, cached);
    return cached;
  }
  const promise = loadImage(shape.imageUrl).then((image) => {
    return compute({ mask: readMask(image), bbox: shape.bbox, nozzle: shape.nozzle });
  });
  promise.catch(() => cache.delete(shape.imageUrl));
  cache.set(shape.imageUrl, promise);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return promise;
}

/** Starts fetching the image and computing its relief now (e.g. while the pack is closed). */
export function prepareVolume(shape: PuffShape): void {
  loadVolume(shape).catch(() => {});
}
