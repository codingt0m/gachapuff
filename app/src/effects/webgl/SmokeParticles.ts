import { smoke as S } from '../../config/motion.ts';
import type { SmokeShape } from '../../domain/types.ts';

/** Sprite shapes drawn by SMOKE_FRAGMENT. */
const SPRITE = { cloud: 0, ring: 1, heart: 2, star: 3 } as const;

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
  /** Sprite shape, see SPRITE. */
  sprite: number;
  /** Spiral: horizontal orbit radius growth (px/s), 0 = none, and starting angle. */
  orbit: number;
  phase0: number;
}

/** Floats per vertex: clip x, clip y, u, v, alpha, seed, gradient position, sprite. */
export const SMOKE_STRIDE = 8;
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
 *
 * Shapes: cloud (plain), rings / hearts / stars (one shaped puff blown at each exhale,
 * with a lighter cloud around it), spiral (the stream twists in a double helix).
 */
export class SmokeParticles {
  readonly vertices = new Float32Array(S.maxParticles * VERTS_PER_PARTICLE * SMOKE_STRIDE);
  shape: SmokeShape = 'cloud';
  private particles: Particle[] = [];
  private pending = 0;
  /** Starts just before an exhale peak, so a puff appears with a cloud right away. */
  private clock = S.burstEvery * FIRST_EXHALE;
  private strand = 0;

  reset(): void {
    this.particles = [];
    this.pending = 0;
    this.clock = S.burstEvery * FIRST_EXHALE;
  }

  /**
   * @param origin mouthpiece position (px, y up)
   * @param unit   pixels per puff-square unit
   * @param headroom pixels available above the mouthpiece
   * @param tiltX  puff tilt around the vertical axis (rad): the smoke leans with it
   */
  update(
    dt: number,
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    reduced: boolean,
    tiltX = 0,
  ): void {
    const phaseBefore = (this.clock / S.burstEvery) % 1;
    this.clock += dt;
    const phase = (this.clock / S.burstEvery) % 1;
    const exhale = Math.max(0, Math.sin(phase * Math.PI * 2)) ** 6;
    const shaped = this.shape === 'rings' || this.shape === 'hearts' || this.shape === 'stars';
    const spiral = this.shape === 'spiral';
    const burst = S.burstRate * (shaped ? S.shapeBurstShare : spiral ? S.spiral.burstShare : 1);
    const trickle = S.trickleRate * (spiral ? S.spiral.trickleBoost : 1);
    const rate = (trickle + burst * exhale) * (reduced ? S.reducedRate : 1);
    this.pending += rate * dt;
    while (this.pending >= 1) {
      this.pending -= 1;
      if (this.particles.length < S.maxParticles) this.spawn(origin, unit, headroom, exhale);
    }
    // Shaped puffs at each exhale peak (phase 0.25 = top of the sine).
    if (shaped && phaseBefore < 0.25 && phase >= 0.25) this.blowShapes(origin, unit, headroom);

    const wind = -tiltX * S.wind * unit;
    for (const p of this.particles) {
      p.age += dt;
      const wander = p.sprite === SPRITE.cloud && p.orbit === 0 ? 1 : 0.2;
      p.vx += Math.sin(p.age * 1.7 + p.seed * 10) * S.drift * unit * dt * wander;
      p.vx += (wind - p.vx) * dt * 0.6 * Math.min(1, p.age);
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
      let size = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) ** 2);
      const fadeIn = Math.min(1, t / 0.08);
      let alpha = fadeIn * (1 - t) ** 1.3 * S.opacity * intensity;
      let x = p.x;
      if (p.orbit > 0) {
        // Helix: orbit around the column, nearer side bigger and denser.
        const angle = p.phase0 + p.age * S.spiral.spin;
        x += Math.sin(angle) * p.orbit * p.age;
        const depth = 0.5 + 0.5 * Math.cos(angle);
        size *= 0.8 + 0.3 * depth;
        alpha *= 0.55 + 0.45 * depth;
      }
      const k = Math.min(1, p.k0 + t);
      const cos = Math.cos(p.rot);
      const sin = Math.sin(p.rot);
      for (const [cx, cy] of CORNERS) {
        v[o++] = ((x + cx * size) / width) * 2 - 1;
        v[o++] = ((p.y + cy * size) / height) * 2 - 1;
        v[o++] = cx * cos - cy * sin;
        v[o++] = cx * sin + cy * cos;
        v[o++] = alpha;
        v[o++] = p.seed;
        v[o++] = k;
        v[o++] = p.sprite;
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
    const spiral = this.shape === 'spiral';
    // Two strands half a turn apart make a double helix.
    this.strand = (this.strand + 1) % 2;
    this.particles.push({
      x: origin.x + rand(-0.005, 0.005) * unit,
      y: origin.y,
      vx: spiral ? 0 : rand(-1, 1) * S.drift * unit * (0.5 + exhale),
      vy: ((headroom * 0.85) / life) * rand(0.75, 1.1) * (1 + exhale * 0.4),
      age: 0,
      life,
      size0: S.startSize * unit,
      size1:
        rand(S.endSize[0], S.endSize[1]) *
        unit *
        (0.7 + exhale * 0.5) *
        (spiral ? S.spiral.sizeScale : 1),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.6, 0.6),
      seed: Math.random(),
      k0: rand(0, 0.25),
      sprite: SPRITE.cloud,
      orbit: spiral ? S.spiral.radius * unit : 0,
      phase0: spiral ? this.clock * S.spiral.spin + this.strand * Math.PI : 0,
    });
  }

  private blowShapes(origin: { x: number; y: number }, unit: number, headroom: number): void {
    if (this.shape === 'rings') {
      this.push(origin, unit, headroom, SPRITE.ring, S.ringSize, 0, 0, rand(-0.15, 0.15));
    } else if (this.shape === 'hearts') {
      this.push(origin, unit, headroom, SPRITE.heart, S.heartSize, 0, rand(-0.15, 0.15), 0);
    } else {
      // A little cluster of stars of different sizes, slowly spinning.
      for (let i = 0; i < 3; i++) {
        const scale = i === 0 ? 1 : rand(0.5, 0.65);
        const size: [number, number] = [S.starSize[0] * scale, S.starSize[1] * scale];
        const dx = i === 0 ? 0 : (i === 1 ? -1 : 1) * rand(0.12, 0.18);
        this.push(origin, unit, headroom, SPRITE.star, size, dx, rand(-0.3, 0.3), rand(-0.8, 0.8));
      }
    }
  }

  private push(
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    sprite: number,
    size: readonly [number, number],
    dx: number,
    rot: number,
    vrot: number,
  ): void {
    if (this.particles.length >= S.maxParticles) return;
    const life = S.life[1] * 1.1;
    this.particles.push({
      x: origin.x,
      y: origin.y + S.startSize * unit,
      vx: dx * unit * 0.6,
      vy: ((headroom * 0.7) / life) * rand(0.95, 1.15),
      age: 0,
      life,
      size0: size[0] * unit,
      size1: size[1] * unit,
      rot,
      vrot,
      seed: Math.random(),
      k0: rand(0, 0.25),
      sprite,
      orbit: 0,
      phase0: 0,
    });
  }
}
