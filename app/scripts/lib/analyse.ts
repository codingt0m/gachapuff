/**
 * Pixel analysis of a puff (square RGBA buffer):
 *  - color:  dominant vivid colour, used for halos and default glows;
 *  - bbox:   opaque bounding box, normalised to [0, 1];
 *  - nozzle: centre of the mouthpiece (top of the silhouette), where smoke comes out.
 */
export interface PixelAnalysis {
  color: string;
  nozzle: { x: number; y: number };
  bbox: { x: number; y: number; w: number; h: number };
}

const OPAQUE = 40;
const SOLID = 200;
const HUE_BUCKETS = 24;
const NOZZLE_BAND = 0.04; // top fraction of the silhouette considered as the mouthpiece

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

const toHex = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, '0');

export function analysePixels(data: Uint8Array | Buffer, size: number): PixelAnalysis {
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const mean = { w: 0, r: 0, g: 0, b: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = data[i + 3] ?? 0;
      if (a <= OPAQUE) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (a < SOLID) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      mean.w++;
      mean.r += r;
      mean.g += g;
      mean.b += b;
      const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
      // Favour saturated, mid-lightness pixels: they carry the puff's identity.
      const weight = s * s * (1 - Math.abs(l - 0.5) * 2);
      const bucket = buckets[Math.floor(h * HUE_BUCKETS) % HUE_BUCKETS];
      if (!bucket || weight <= 0) continue;
      bucket.w += weight;
      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
    }
  }

  if (maxX < 0) {
    return { color: '#ffffff', nozzle: { x: 0.5, y: 0.1 }, bbox: { x: 0, y: 0, w: 1, h: 1 } };
  }

  const best = buckets.reduce((acc, b) => (b.w > acc.w ? b : acc));
  const vivid = best.w > mean.w * 0.02;
  const source = vivid ? best : mean;
  const color = `#${toHex(source.r / source.w)}${toHex(source.g / source.w)}${toHex(source.b / source.w)}`;

  const bandEnd = minY + Math.max(1, Math.round((maxY - minY) * NOZZLE_BAND));
  let sumX = 0;
  let count = 0;
  for (let y = minY; y <= bandEnd; y++) {
    for (let x = minX; x <= maxX; x++) {
      if ((data[(y * size + x) * 4 + 3] ?? 0) > OPAQUE) {
        sumX += x;
        count++;
      }
    }
  }
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    color,
    nozzle: { x: round((sumX / count + 0.5) / size), y: round(minY / size) },
    bbox: {
      x: round(minX / size),
      y: round(minY / size),
      w: round((maxX - minX + 1) / size),
      h: round((maxY - minY + 1) / size),
    },
  };
}
