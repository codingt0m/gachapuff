import { render } from '../../config/motion.ts';
import {
  boxiness,
  distanceToEdge,
  gridHeights,
  inflate,
  normalMap,
  sampleHeight,
} from './volume.ts';

const V = render.volume;

/** What the relief computation needs from a puff (all in image space, [0, 1]). */
export interface VolumeInput {
  /** Silhouette (alpha > 50 %), V.fieldSize² bytes, 1 inside. */
  mask: Uint8Array;
  bbox: { w: number; h: number };
  nozzle: { x: number; y: number };
}

/** The relief of one puff, ready for upload. Plain typed arrays: it crosses a Worker. */
export interface VolumeData {
  /** Side of the field / normal texture, in texels. */
  size: number;
  /** Side wall depth, in units. */
  thickness: number;
  /** Relief height under the mouthpiece (smoke origin), in units, depth applied. */
  nozzleHeight: number;
  /** Height of each grid vertex (V.gridCells + 1)², for a depth factor of 1. */
  heights: Float32Array;
  /** RGBA texels: rgb = relief normal, a = distance to the edge (frost growth). */
  texels: Uint8Array;
}

/** Distance to the edge, normalised by the shape's own deepest point (frost growth). */
function inwardMap(mask: Uint8Array, size: number): Uint8Array {
  const dist = distanceToEdge(mask, size);
  let far = 1;
  for (const d of dist) if (d > far) far = d;
  const out = new Uint8Array(dist.length);
  for (let i = 0; i < dist.length; i++) out[i] = Math.round(((dist[i] ?? 0) / far) * 255);
  return out;
}

/**
 * Inflates the silhouette into a relief (pure; ~70 ms on a fast CPU, run off the main
 * thread by volumeJobs.ts).
 */
export function computeVolume({ mask, bbox, nozzle }: VolumeInput): VolumeData {
  const size = V.fieldSize;
  const box = boxiness(bbox, V.slimAspect, V.wideAspect);
  const lerp = ([a, b]: readonly [number, number]) => a + (b - a) * box;
  const field = inflate(mask, size, lerp(V.roundness));
  const normals = normalMap(field, V.depth);
  const inward = inwardMap(mask, size);
  const texels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    texels[i * 4] = normals[i * 3] ?? 128;
    texels[i * 4 + 1] = normals[i * 3 + 1] ?? 128;
    texels[i * 4 + 2] = normals[i * 3 + 2] ?? 255;
    texels[i * 4 + 3] = inward[i] ?? 0;
  }
  return {
    size,
    thickness: lerp(V.thickness) * field.maxDistance * 2,
    // A little below the tip, where the mouthpiece has some body.
    nozzleHeight: sampleHeight(field, nozzle.x, nozzle.y + 0.02) * V.depth,
    heights: gridHeights(field, V.gridCells),
    texels,
  };
}
