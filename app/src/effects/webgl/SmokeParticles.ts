import { smoke as S } from '../../config/motion.ts';
import type { SmokeShape } from '../../domain/types.ts';

/** Sprite shapes drawn by SMOKE_FRAGMENT. */
const SPRITE = { cloud: 0, ring: 1, heart: 2, star: 3 } as const;
const H = S.hold;
const D = S.spiral;
/** Vertical slowdown of the normal plume (1/s). */
const PLUME_DRAG = 0.15;

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
  /**
   * Spiral (DNA helix): radius (px, 0 = not on the helix), phase, and position across the
   * helix (+1 / -1 = the two strands, in between = a rung).
   */
  orbit: number;
  phase0: number;
  across: number;
  /** Rate (1/s) at which the vertical speed settles to `lift` (px/s). */
  drag: number;
  lift: number;
  opacity: number;
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
 * with a lighter cloud around it), spiral (a DNA double helix: two strands joined by rungs).
 *
 * While `holding`, a big cloud billows out of the mouthpiece on top of the normal plume.
 */
export class SmokeParticles {
  readonly vertices = new Float32Array(S.maxParticles * VERTS_PER_PARTICLE * SMOKE_STRIDE);
  shape: SmokeShape = 'cloud';
  /** The puff is pressed: blow a big cloud. */
  holding = false;
  private particles: Particle[] = [];
  private pending = 0;
  /** Held-cloud output, 0..1, ramping with `holding`. */
  private hold = 0;
  private holdPending = 0;
  /** Starts just before an exhale peak, so a puff appears with a cloud right away. */
  private clock = S.burstEvery * FIRST_EXHALE;
  private strandPending = 0;
  private rungPending = 0;

  reset(): void {
    this.particles = [];
    this.pending = 0;
    this.strandPending = 0;
    this.rungPending = 0;
    this.hold = 0;
    this.holdPending = 0;
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
    const burst = S.burstRate * (shaped ? S.shapeBurstShare : spiral ? D.burstShare : 1);
    // The helix strands replace the thin stream.
    const trickle = spiral ? 0 : S.trickleRate;
    const rate = (trickle + burst * exhale) * (reduced ? S.reducedRate : 1);
    this.pending += rate * dt;
    while (this.pending >= 1) {
      this.pending -= 1;
      if (this.particles.length < S.maxParticles) this.spawn(origin, unit, headroom, exhale);
    }
    // Shaped puffs at each exhale peak (phase 0.25 = top of the sine).
    if (shaped && phaseBefore < 0.25 && phase >= 0.25) this.blowShapes(origin, unit, headroom);
    if (spiral) this.emitHelix(dt, origin, unit, headroom, reduced);

    this.hold = this.holding
      ? Math.min(1, this.hold + dt / H.rampUp)
      : Math.max(0, this.hold - dt / H.rampDown);
    this.holdPending += H.rate * this.hold * (reduced ? S.reducedRate : 1) * dt;
    if (this.hold === 0) this.holdPending = 0;
    while (this.holdPending >= 1) {
      this.holdPending -= 1;
      if (this.particles.length < S.maxParticles) this.billow(origin, unit, headroom);
    }

    const wind = -tiltX * S.wind * unit;
    for (const p of this.particles) {
      p.age += dt;
      // Helix dots hold their line, then wander more and more as they fray.
      const wander =
        p.orbit > 0
          ? 0.1 + 0.9 * (p.age / p.life) ** 2
          : p.sprite === SPRITE.cloud
            ? 1
            : 0.2;
      p.vx += Math.sin(p.age * 1.7 + p.seed * 10) * S.drift * unit * dt * wander;
      // Sideways speed settles to the wind; billowing puffs brake as hard as they rise.
      p.vx += (wind - p.vx) * Math.min(1, dt * Math.max(0.6 * Math.min(1, p.age), p.drag));
      p.vy += (p.lift - p.vy) * Math.min(1, dt * p.drag);
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
      let alpha = fadeIn * (1 - t) ** 1.3 * p.opacity * intensity;
      let x = p.x;
      if (p.orbit > 0) {
        // Double helix seen from the side: the nearer side bigger and denser.
        const angle = p.phase0 + p.age * D.spin;
        x += Math.sin(angle) * p.orbit * (1 + D.fray * t * t) * p.across;
        const depth = 0.5 + 0.5 * Math.cos(angle) * p.across;
        size *= 0.7 + 0.5 * depth;
        alpha *= 0.4 + 0.6 * depth;
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
      sprite: SPRITE.cloud,
      orbit: 0,
      phase0: 0,
      across: 0,
      drag: PLUME_DRAG,
      lift: 0,
      opacity: S.opacity,
    });
  }

  /** Spiral: strand pairs and rungs, all at the current phase, so they stay lined up. */
  private emitHelix(
    dt: number,
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    reduced: boolean,
  ): void {
    const factor = reduced ? S.reducedRate : 1;
    const phase = this.clock * D.twist;
    this.strandPending += D.strandRate * factor * dt;
    while (this.strandPending >= 1) {
      this.strandPending -= 1;
      this.helixDot(origin, unit, headroom, phase, 1, D.strandSize, S.opacity);
      this.helixDot(origin, unit, headroom, phase, -1, D.strandSize, S.opacity);
    }
    this.rungPending += (factor * dt) / D.rungEvery;
    while (this.rungPending >= 1) {
      this.rungPending -= 1;
      for (let i = 1; i <= D.rungDots; i++) {
        const across = 1 - (2 * i) / (D.rungDots + 1);
        this.helixDot(origin, unit, headroom, phase, across, D.rungSize, D.rungOpacity);
      }
    }
  }

  private helixDot(
    origin: { x: number; y: number },
    unit: number,
    headroom: number,
    phase: number,
    across: number,
    size: readonly [number, number],
    opacity: number,
  ): void {
    if (this.particles.length >= S.maxParticles) return;
    const life = rand(D.life[0], D.life[1]);
    // Same rise for every dot (not tied to its own life), so the helix keeps its shape.
    const meanLife = (D.life[0] + D.life[1]) / 2;
    this.particles.push({
      x: origin.x,
      y: origin.y,
      vx: 0,
      vy: (headroom * 0.85) / meanLife,
      age: 0,
      life,
      size0: size[0] * unit,
      size1: size[1] * unit * rand(0.85, 1.15),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.6, 0.6),
      seed: Math.random(),
      k0: rand(0, 0.25),
      sprite: SPRITE.cloud,
      orbit: D.radius * unit,
      phase0: phase,
      across,
      drag: PLUME_DRAG,
      lift: 0,
      opacity,
    });
  }

  /** One puff of the held cloud: shot out in a wide cone, braking, then hanging and swelling. */
  private billow(origin: { x: number; y: number }, unit: number, headroom: number): void {
    const life = rand(H.life[0], H.life[1]);
    // Biased towards the vertical, so the cloud stacks up rather than spreading flat.
    const angle = rand(-1, 1) * Math.abs(rand(-1, 1)) * H.cone;
    // Distance before stopping = speed / drag.
    const speed = headroom * H.reach * H.drag * rand(0.45, 1.1);
    this.particles.push({
      x: origin.x + rand(-0.02, 0.02) * unit,
      y: origin.y,
      vx: Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed,
      age: 0,
      life,
      size0: H.startSize * unit,
      size1: rand(H.endSize[0], H.endSize[1]) * unit,
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.4, 0.4),
      seed: Math.random(),
      k0: rand(0, 0.35),
      sprite: SPRITE.cloud,
      orbit: 0,
      phase0: 0,
      across: 0,
      drag: H.drag,
      lift: ((headroom * H.lift) / life) * rand(0.7, 1.2),
      opacity: H.opacity,
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
      across: 0,
      drag: PLUME_DRAG,
      lift: 0,
      opacity: S.opacity,
    });
  }
}
