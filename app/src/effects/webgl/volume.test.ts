import { describe, expect, it } from 'vitest';
import { boxiness, distanceToEdge, gridHeights, gridMesh, inflate, normalMap } from './volume.ts';

const SIZE = 64;

/** A centred disk of the given radius (texels). */
function disk(radius: number): Uint8Array {
  const mask = new Uint8Array(SIZE * SIZE);
  const c = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      mask[y * SIZE + x] = Math.hypot(x + 0.5 - c, y + 0.5 - c) < radius ? 1 : 0;
    }
  }
  return mask;
}

const at = (a: ArrayLike<number>, x: number, y: number) => a[y * SIZE + x] ?? NaN;

describe('distanceToEdge', () => {
  it('is 0 outside and grows towards the centre', () => {
    const d = distanceToEdge(disk(20), SIZE);
    expect(at(d, 0, 0)).toBe(0);
    expect(at(d, 32, 32)).toBeGreaterThan(18);
    expect(at(d, 32, 32)).toBeGreaterThan(at(d, 20, 32));
  });
});

describe('inflate', () => {
  it('domes a round silhouette: highest in the middle, flat outside', () => {
    const field = inflate(disk(20), SIZE, 1);
    const centre = at(field.heights, 32, 32);
    expect(at(field.heights, 2, 2)).toBe(0);
    expect(centre).toBeGreaterThan(at(field.heights, 18, 32));
    // Fully round: the dome is about as high as the silhouette is wide / 2.
    expect(centre).toBeCloseTo(field.maxDistance, 1);
  });

  it('flattens the face when roundness is low', () => {
    const field = inflate(disk(20), SIZE, 0.3);
    expect(at(field.heights, 32, 32)).toBeCloseTo(at(field.heights, 26, 32), 3);
  });
});

describe('normalMap', () => {
  it('faces the camera on top of the dome and leans outward on the sides', () => {
    const n = normalMap(inflate(disk(20), SIZE, 1), 1);
    const px = (x: number, y: number, c: number) =>
      ((n[(y * SIZE + x) * 3 + c] ?? 0) - 127.5) / 127.5;
    expect(px(32, 32, 2)).toBeGreaterThan(0.95);
    expect(px(16, 32, 0)).toBeLessThan(-0.3); // left side leans left
    expect(px(32, 16, 1)).toBeGreaterThan(0.3); // top side leans up
  });
});

describe('gridMesh', () => {
  it('builds a vertex grid with matching heights', () => {
    const mesh = gridMesh(8);
    expect(mesh.positions.length).toBe(81 * 2);
    expect(mesh.indices.length).toBe(8 * 8 * 6);
    expect(Math.max(...mesh.indices)).toBe(80);
    expect(gridHeights(inflate(disk(20), SIZE, 1), 8).length).toBe(81);
  });
});

describe('boxiness', () => {
  it('maps slim bboxes to 0 and wide ones to 1', () => {
    expect(boxiness({ w: 0.22, h: 0.84 }, 0.3, 0.5)).toBe(0);
    expect(boxiness({ w: 0.64, h: 0.84 }, 0.3, 0.5)).toBe(1);
  });
});
