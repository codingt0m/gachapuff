import { smoke as S } from '../../config/motion.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  rot: number;
  vrot: number;
  seed: number;
  k0: number;
}

/** Floats per vertex: clip x, clip y, u, v, alpha, seed, gradient position. */
export const SMOKE_STRIDE = 7;
const VERTS_PER_PARTICLE = 6;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
/** Phase (share of the exhale period) at which a new puff starts: just before the peak. */
const FIRST_EXHALE = 0.17;

/**
 * Vape smoke as soft sprites: a thin stream plus rhythmic exhales from the mouthpiece,
 * rising, swelling, swirling and fading. Positions are kept in drawing-buffer pixels
 * (y up), so puffs already emitted stay put when the device tilts.
 */
export class SmokeParticles {
  readonly vertices = new Float32Array(S.maxParticles * VERTS_PER_PARTICLE * SMOKE_STRIDE);
  private particles: Particle[] = [];
  private pending = 0;
  /** Starts just before an exhale peak, so a puff appears with a cloud right away. */
  private clock = S.burstEvery * FIRST_EXHALE;

  reset(): void {
    this.particles = [];
    this.pending = 0;
    this.clock = S.burstEvery * FIRST_EXHALE;
  }

  /**
   * @param origin mouthpiece position (px, y up)
   * @param unit   pixels per puff-square unit
   * @param headroom pixels available above the mouthpiece
   */
  update(
    dt: number,
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    reduced: boolean,
  ): void {
    this.clock += dt;
    const exhale = Math.max(0, Math.sin((this.clock / S.burstEvery) * Math.PI * 2)) ** 6;
    const rate = (S.trickleRate + S.burstRate * exhale) * (reduced ? S.reducedRate : 1);
    this.pending += rate * dt;
    while (this.pending >= 1) {
      this.pending -= 1;
      if (this.particles.length < S.maxParticles) this.spawn(origin, unit, headroom, exhale);
    }
    for (const p of this.particles) {
      p.age += dt;
      p.vx += Math.sin(p.age * 1.7 + p.seed * 10) * S.drift * unit * dt;
      p.vy *= 1 - dt * 0.15;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  /** Writes the sprites into `vertices`; returns the vertex count to draw. */
  fill(width: number, height: number, intensity: number): number {
    let o = 0;
    const v = this.vertices;
    for (const p of this.particles) {
      const t = p.age / p.life;
      const size = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) ** 2);
      const fadeIn = Math.min(1, t / 0.08);
      const alpha = fadeIn * (1 - t) ** 1.3 * S.opacity * intensity;
      const k = Math.min(1, p.k0 + t);
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      for (const [cx, cy] of CORNERS) {
        v[o++] = ((p.x + cx * size) / width) * 2 - 1;
        v[o++] = ((p.y + cy * size) / height) * 2 - 1;
        v[o++] = cx * cos - cy * sin;
        v[o++] = cx * sin + cy * cos;
        v[o++] = alpha;
        v[o++] = p.seed;
        v[o++] = k;
      }
    }
    return o / SMOKE_STRIDE;
  }

  private spawn(
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    exhale: number,
  ): void {
    const life = rand(S.life[0], S.life[1]);
    this.particles.push({
      x: origin.x + rand(-0.005, 0.005) * unit,
      y: origin.y,
      vx: rand(-1, 1) * S.drift * unit * (0.5 + exhale),
      vy: ((headroom * 0.85) / life) * rand(0.75, 1.1) * (1 + exhale * 0.4),
      age: 0,
      life,
      size0: S.startSize * unit,
      size1: rand(S.endSize[0], S.endSize[1]) * unit * (0.7 + exhale * 0.5),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.6, 0.6),
      seed: Math.random(),
      k0: rand(0, 0.25),
    });
  }
}
