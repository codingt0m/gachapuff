/**
 * Gives the flat puff photo a body: the silhouette is "inflated" into a height field
 * (rounded edges, flat or domed face), which displaces a grid mesh and gives the
 * lighting its normals. A stack of silhouettes behind it draws the side wall.
 * Pure functions on typed arrays: no DOM, no WebGL.
 *
 * Units: the puff image square spans 2 units (-1..1), like the vertex positions.
 */

const INF = 1e20;

export interface HeightField {
  size: number;
  /** Height of each texel in units, for a depth factor of 1. Row 0 is the image top. */
  heights: Float32Array;
  /** Largest distance from the silhouette edge, in units (about half the puff width). */
  maxDistance: number;
}

/** 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  const at = (i: number) => v[i] ?? 0;
  const fv = (i: number) => f[at(i)] ?? 0;
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    const fq = (f[q] ?? 0) + q * q;
    let s = (fq - (fv(k) + at(k) * at(k))) / (2 * q - 2 * at(k));
    while (s <= (z[k] ?? -INF)) {
      k--;
      s = (fq - (fv(k) + at(k) * at(k))) / (2 * q - 2 * at(k));
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? INF) < q) k++;
    d[q] = (q - at(k)) * (q - at(k)) + fv(k);
  }
}

/** Distance (texels) from each inside texel to the nearest outside one; 0 outside. */
export function distanceToEdge(mask: Uint8Array, size: number): Float32Array {
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? INF : 0;
  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = grid[y * size + x] ?? 0;
    edt1d(f, size, d, v, z);
    for (let y = 0; y < size; y++) grid[y * size + x] = d[y] ?? 0;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = grid[y * size + x] ?? 0;
    edt1d(f, size, d, v, z);
    for (let x = 0; x < size; x++) out[y * size + x] = Math.sqrt(d[x] ?? 0);
  }
  return out;
}

/** Two 3x3 box-blur passes, then re-cut to the silhouette (smooths the distance ridges). */
function smooth(src: Float32Array, mask: Uint8Array, size: number): Float32Array {
  let a: Float32Array = src;
  let b: Float32Array = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let count = 0;
        for (let j = -1; j <= 1; j++) {
          const yy = y + j;
          if (yy < 0 || yy >= size) continue;
          for (let i = -1; i <= 1; i++) {
            const xx = x + i;
            if (xx < 0 || xx >= size) continue;
            sum += a[yy * size + xx] ?? 0;
            count++;
          }
        }
        b[y * size + x] = sum / count;
      }
    }
    [a, b] = [b, a];
  }
  for (let i = 0; i < a.length; i++) if (!mask[i]) a[i] = 0;
  return a;
}

/**
 * Inflates a silhouette. `roundness` is the share of the max edge distance over which the
 * edge curls round: 1 = fully round (cylinder), lower = flat face with rounded edges (box).
 */
export function inflate(mask: Uint8Array, size: number, roundness: number): HeightField {
  const dist = distanceToEdge(mask, size);
  let max = 0;
  for (const d of dist) if (d > max) max = d;
  const radius = Math.max(1, max * Math.min(1, Math.max(0.05, roundness)));
  const unit = 2 / size;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < heights.length; i++) {
    if (!mask[i]) continue;
    const t = Math.min((dist[i] ?? 0) / radius, 1);
    heights[i] = radius * Math.sqrt(1 - (1 - t) * (1 - t)) * unit;
  }
  return { size, heights: smooth(heights, mask, size), maxDistance: max * unit };
}

/** Bilinear height at a point of the image, u/v in [0, 1] (v down). */
export function sampleHeight(field: HeightField, u: number, v: number): number {
  const { size, heights } = field;
  const fx = Math.min(size - 1.001, Math.max(0, u * size - 0.5));
  const fy = Math.min(size - 1.001, Math.max(0, v * size - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const h = (x: number, y: number) => heights[y * size + x] ?? 0;
  const top = h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx;
  const bottom = h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Normal map (RGB bytes, xyz * 0.5 + 0.5, y up) of the field scaled by `depth`. */
export function normalMap(field: HeightField, depth: number): Uint8Array {
  const { size, heights } = field;
  const out = new Uint8Array(size * size * 3);
  const h = (x: number, y: number) =>
    heights[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))] ?? 0;
  const span = 4 / size; // two texels, in units
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (-(h(x + 1, y) - h(x - 1, y)) * depth) / span;
      const ny = (-(h(x, y - 1) - h(x, y + 1)) * depth) / span;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 3;
      out[o] = Math.round((nx / len) * 127.5 + 127.5);
      out[o + 1] = Math.round((ny / len) * 127.5 + 127.5);
      out[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
    }
  }
  return out;
}

export interface GridMesh {
  /** xy per vertex, -1..1, y up. */
  positions: Float32Array;
  indices: Uint16Array;
}

/** A (cells + 1)² vertex grid over the puff square. */
export function gridMesh(cells: number): GridMesh {
  const side = cells + 1;
  if (side * side > 65535) throw new Error('grid too fine for 16-bit indices');
  const positions = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const k = (j * side + i) * 2;
      positions[k] = -1 + (2 * i) / cells;
      positions[k + 1] = 1 - (2 * j) / cells;
    }
  }
  const indices = new Uint16Array(cells * cells * 6);
  let k = 0;
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * side + i;
      const c = a + side;
      indices.set([a, c, a + 1, a + 1, c, c + 1], k);
      k += 6;
    }
  }
  return { positions, indices };
}

/** Height of each grid vertex, for a depth factor of 1. */
export function gridHeights(field: HeightField, cells: number): Float32Array {
  const side = cells + 1;
  const out = new Float32Array(side * side);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) out[j * side + i] = sampleHeight(field, i / cells, j / cells);
  }
  return out;
}

/** 0 for slim puffs (round), 1 for wide ones (boxy), from the opaque bbox aspect. */
export function boxiness(bbox: { w: number; h: number }, slim: number, wide: number): number {
  const aspect = bbox.h > 0 ? bbox.w / bbox.h : 0;
  return Math.min(1, Math.max(0, (aspect - slim) / (wide - slim)));
}
