import { render } from '../../config/motion.ts';
import type { Engraving, FinishId, Smoke } from '../../domain/types.ts';
import { drawEngraving } from '../engraving.ts';
import { compileProgram, createQuad, hexToRgb, loadImage, uniforms, uploadTexture } from './gl.ts';
import {
  PUFF_FRAGMENT,
  PUFF_VERTEX,
  SIDE_FRAGMENT,
  SMOKE_FRAGMENT,
  SMOKE_VERTEX,
} from './shaders.ts';
import { SMOKE_STRIDE, SmokeParticles } from './SmokeParticles.ts';
import {
  boxiness,
  gridHeights,
  gridMesh,
  inflate,
  normalMap,
  sampleHeight,
  type HeightField,
} from './volume.ts';

export interface PuffLook {
  imageUrl: string;
  finish: FinishId;
  smoke: Smoke;
  engraving: Engraving;
  /** Size of the numbered edition, for the serial label. */
  serialEdition: number;
  /** Mouthpiece position in the image, [0, 1]. */
  nozzle: { x: number; y: number };
  /** Opaque bounding box in the image, [0, 1]. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Varies sparkle / facet layouts between copies. */
  seed: number;
}

/** Must match the uFinish branches of PUFF_FRAGMENT. */
const FINISH_INDEX: Record<FinishId, number> = {
  normal: 0,
  shiny: 1,
  golden: 2,
  chromatic: 3,
  crystal: 4,
  cosmic: 5,
  silver: 6,
  bronze: 7,
  ruby: 8,
  emerald: 9,
  amethyst: 10,
  lava: 11,
  frost: 12,
  glitch: 16,
  chrome: 17,
};

/** Must match smokeColor() in SMOKE_FRAGMENT. */
const SMOKE_INDEX: Record<Smoke['kind'], number> = {
  white: 0,
  solid: 1,
  gradient: 2,
  rainbow: 3,
  glitter: 4,
  halo: 5,
  swirl: 6,
  alternate: 7,
};

/** Side wall colour per finish (rgb, amount mixed over the print). */
const SIDE_TINT: Partial<Record<FinishId, [number, number, number, number]>> = {
  golden: [0.86, 0.58, 0.13, 0.8],
  silver: [0.62, 0.65, 0.7, 0.8],
  bronze: [0.78, 0.45, 0.36, 0.8],
  chrome: [0.72, 0.76, 0.82, 0.85],
  ruby: [0.62, 0.04, 0.12, 0.7],
  emerald: [0.05, 0.52, 0.26, 0.7],
  amethyst: [0.45, 0.16, 0.75, 0.7],
  crystal: [0.82, 0.9, 1.0, 0.6],
  cosmic: [0.22, 0.08, 0.45, 0.75],
  lava: [0.35, 0.08, 0.02, 0.75],
  frost: [0.82, 0.92, 1.0, 0.7],
};
const NO_TINT: [number, number, number, number] = [1, 1, 1, 0];

const ENGRAVING_INDEX: Record<Engraving['kind'], number> = { none: 0, signature: 1, serial: 2 };

const TIME_WRAP = 1000; // seconds; keeps shader time precise on mediump GPUs
const TEXTURE_SIZE = 512;
const FLOAT_BYTES = 4;

const PUFF_UNIFORMS = [
  'uCenter',
  'uHalf',
  'uRot',
  'uCamera',
  'uTex',
  'uTexel',
  'uTilt',
  'uTime',
  'uFinish',
  'uReveal',
  'uSeed',
  'uMotion',
  'uEngrave',
  'uEngraveKind',
  'uNormal',
  'uDepth',
  'uZ',
] as const;

const SIDE_UNIFORMS = [
  'uCenter',
  'uHalf',
  'uRot',
  'uCamera',
  'uDepth',
  'uZ',
  'uTex',
  'uTexel',
  'uReveal',
  'uSideTint',
] as const;

const V = render.volume;
const GRID = gridMesh(V.gridCells);

/** Relief built from one puff image. */
interface Volume {
  field: HeightField;
  /** Side wall depth, in units. */
  thickness: number;
  /** Relief height under the mouthpiece (smoke origin), in units, depth applied. */
  nozzleHeight: number;
}

/** Inflates the image's silhouette (alpha > 50 %) into a relief. */
function buildVolume(image: HTMLImageElement, look: PuffLook): Volume {
  const size = V.fieldSize;
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
  const box = boxiness(look.bbox, V.slimAspect, V.wideAspect);
  const lerp = ([a, b]: readonly [number, number]) => a + (b - a) * box;
  const field = inflate(mask, size, lerp(V.roundness));
  return {
    field,
    thickness: lerp(V.thickness) * field.maxDistance * 2,
    // A little below the tip, where the mouthpiece has some body.
    nozzleHeight: sampleHeight(field, look.nozzle.x, look.nozzle.y + 0.02) * V.depth,
  };
}

const SMOKE_UNIFORMS = ['uKind', 'uColorCount', 'uC0', 'uC1', 'uC2', 'uTime'] as const;

type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;

/** Column-major rotation Rx(tiltY) * Ry(tiltX). */
function rotation(tx: number, ty: number): Float32Array {
  const ca = Math.cos(tx);
  const sa = Math.sin(tx);
  const cb = Math.cos(ty);
  const sb = Math.sin(ty);
  return new Float32Array([ca, sb * sa, -cb * sa, 0, cb, sb, sa, -sb * ca, cb * ca]);
}

function smokeColors(smoke: Smoke): string[] {
  if ('colors' in smoke) return smoke.colors;
  if ('color' in smoke) return [smoke.color];
  return ['#ffffff'];
}

/**
 * Renders one puff (finish + smoke) on a canvas, with a 3D tilt.
 * One renderer = one WebGL context: create it only for the puff on screen.
 */
export class PuffRenderer {
  /** Current tilt in radians (x: around the vertical axis, y: around the horizontal one). */
  tilt = { x: 0, y: 0 };
  /** 0 = white silhouette, 1 = full colour. */
  reveal = 1;
  reducedMotion = false;
  /** Called before each frame with the elapsed time (s). */
  onFrame: ((dt: number) => void) | null = null;
  /** Called when the GPU drops the context: the caller switches to the CSS fallback. */
  onContextLost: (() => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly quad: WebGLBuffer;
  private readonly smokeBuffer: WebGLBuffer | null;
  private readonly puff: { program: WebGLProgram; u: Uniforms<(typeof PUFF_UNIFORMS)[number]> };
  private readonly smoke: { program: WebGLProgram; u: Uniforms<(typeof SMOKE_UNIFORMS)[number]> };
  private readonly side: { program: WebGLProgram; u: Uniforms<(typeof SIDE_UNIFORMS)[number]> };
  private readonly gridPositions: WebGLBuffer | null;
  private readonly gridIndices: WebGLBuffer | null;
  private readonly gridHeights: WebGLBuffer | null;
  private normalTexture: WebGLTexture | null = null;
  private volume: Volume | null = null;
  private readonly particles = new SmokeParticles();
  private texture: WebGLTexture | null = null;
  private engraveTexture: WebGLTexture | null = null;
  private engraveKey = '';
  private look: PuffLook | null = null;
  private lookToken = 0;
  private raf = 0;
  private running = false;
  private lastFrame = 0;
  private time = 0;
  private smokeIntensity = 0;
  private disposed = false;
  private revealAnim: { start: number; duration: number } | null = null;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.quad = createQuad(gl);
    this.smokeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.particles.vertices.byteLength, gl.DYNAMIC_DRAW);
    const puffProgram = compileProgram(gl, PUFF_VERTEX, PUFF_FRAGMENT, ['aPos', 'aH']);
    const sideProgram = compileProgram(gl, PUFF_VERTEX, SIDE_FRAGMENT, ['aPos', 'aH']);
    this.side = { program: sideProgram, u: uniforms(gl, sideProgram, SIDE_UNIFORMS) };
    this.gridPositions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridPositions);
    gl.bufferData(gl.ARRAY_BUFFER, GRID.positions, gl.STATIC_DRAW);
    this.gridHeights = gl.createBuffer();
    this.gridIndices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, GRID.indices, gl.STATIC_DRAW);
    const smokeProgram = compileProgram(gl, SMOKE_VERTEX, SMOKE_FRAGMENT, ['aPos', 'aUv', 'aData']);
    this.puff = { program: puffProgram, u: uniforms(gl, puffProgram, PUFF_UNIFORMS) };
    this.smoke = { program: smokeProgram, u: uniforms(gl, smokeProgram, SMOKE_UNIFORMS) };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
  }

  /** Returns null when WebGL is unavailable (the caller then uses the CSS fallback). */
  static create(canvas: HTMLCanvasElement): PuffRenderer | null {
    try {
      const gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        depth: true,
        powerPreference: 'default',
      });
      return gl ? new PuffRenderer(canvas, gl) : null;
    } catch (error) {
      console.warn('WebGL unavailable', error);
      return null;
    }
  }

  async setLook(look: PuffLook): Promise<void> {
    const token = ++this.lookToken;
    const sameImage = this.look?.imageUrl === look.imageUrl;
    this.look = look;
    this.particles.shape = look.smoke.shape ?? 'cloud';
    await this.updateEngraving(look, token);
    if (sameImage && this.texture) return;
    this.smokeIntensity = 0;
    this.particles.reset();
    const image = await loadImage(look.imageUrl);
    if (token !== this.lookToken || this.disposed) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = uploadTexture(this.gl, image);
    this.setVolume(buildVolume(image, look));
  }

  private setVolume(volume: Volume): void {
    const gl = this.gl;
    this.volume = volume;
    const { size } = volume.field;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridHeights);
    gl.bufferData(gl.ARRAY_BUFFER, gridHeights(volume.field, V.gridCells), gl.STATIC_DRAW);
    if (this.normalTexture) gl.deleteTexture(this.normalTexture);
    this.normalTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const normals = normalMap(volume.field, V.depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, normals);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private async updateEngraving(look: PuffLook, token: number): Promise<void> {
    const key = JSON.stringify([look.engraving, look.bbox, look.serialEdition]);
    if (key === this.engraveKey) return;
    this.engraveKey = key;
    if (this.engraveTexture) this.gl.deleteTexture(this.engraveTexture);
    this.engraveTexture = null;
    if (look.engraving.kind === 'none') return;
    const canvas = await drawEngraving(look.engraving, look.bbox, look.serialEdition, TEXTURE_SIZE);
    if (token !== this.lookToken || this.disposed) return;
    this.engraveTexture = uploadTexture(this.gl, canvas);
  }

  /** Press and hold: the puff blows a big cloud until released. */
  setHolding(holding: boolean): void {
    this.particles.holding = holding;
  }

  /** White silhouette flooding into colour, after `delay` ms. */
  animateReveal(duration: number, delay = 0): void {
    this.reveal = 0;
    this.revealAnim = { start: performance.now() + delay, duration };
  }

  showInstantly(): void {
    this.revealAnim = null;
    this.reveal = 1;
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Frees the GPU context right away (browsers cap the number of live contexts). */
  dispose(): void {
    this.stop();
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.engraveTexture) this.gl.deleteTexture(this.engraveTexture);
    if (this.normalTexture) this.gl.deleteTexture(this.normalTexture);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.stop();
    this.onContextLost?.();
  };

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const speed = this.reducedMotion ? render.reducedSpeed : 1;
    this.time = (this.time + dt * speed) % TIME_WRAP;
    if (this.texture) {
      this.smokeIntensity = Math.min(1, this.smokeIntensity + (dt * 1000) / render.smokeFadeIn);
    }
    if (this.revealAnim) {
      const t = Math.max(0, Math.min(1, (now - this.revealAnim.start) / this.revealAnim.duration));
      this.reveal = 1 - (1 - t) ** 3;
      if (t >= 1) this.revealAnim = null;
    }
    this.onFrame?.(dt);
    this.draw(dt * speed);
    this.raf = requestAnimationFrame(this.frame);
  };

  private resize(): { w: number; h: number } {
    const small = window.innerWidth < render.mobileBreakpoint;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      small ? render.mobilePixelRatio : render.maxPixelRatio,
    );
    const w = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h };
  }

  private draw(dt: number): void {
    const gl = this.gl;
    const { w, h } = this.resize();
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.texture || !this.look || !this.volume) return;

    // Puff square layout, in pixels then clip space.
    const size = Math.min(w * render.puffWidth, h * render.puffHeight);
    const centerYFromTop = h * (1 - render.bottomMargin) - size / 2;
    const center = [0, 1 - (2 * centerYFromTop) / h] as const;
    const half = [size / w, size / h] as const;
    const rot = rotation(this.tilt.x, this.tilt.y);

    // Depth test so the relief hides the side wall behind it; the smoke draws without.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.drawSide(rot, center, half);

    const p = this.puff;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridPositions);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridHeights);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.uniform1f(p.u.uDepth, V.depth);
    gl.uniform1f(p.u.uZ, 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
    gl.uniform1i(p.u.uNormal, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(p.u.uTex, 0);
    gl.uniform2f(p.u.uTexel, 1 / TEXTURE_SIZE, 1 / TEXTURE_SIZE);
    gl.uniform2f(p.u.uCenter, center[0], center[1]);
    gl.uniform2f(p.u.uHalf, half[0], half[1]);
    gl.uniformMatrix3fv(p.u.uRot, false, rot);
    gl.uniform1f(p.u.uCamera, render.camera);
    gl.uniform2f(p.u.uTilt, this.tilt.x, this.tilt.y);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1f(p.u.uFinish, FINISH_INDEX[this.look.finish]);
    gl.uniform1f(p.u.uReveal, this.reveal);
    gl.uniform1f(p.u.uSeed, this.look.seed);
    gl.uniform1f(p.u.uMotion, this.reducedMotion ? render.reducedSpeed : 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.engraveTexture ?? this.texture);
    gl.uniform1i(p.u.uEngrave, 1);
    gl.uniform1f(
      p.u.uEngraveKind,
      this.engraveTexture ? ENGRAVING_INDEX[this.look.engraving.kind] : 0,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndices);
    gl.drawElements(gl.TRIANGLES, GRID.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(1);
    gl.disable(gl.DEPTH_TEST);

    this.drawSmoke(dt, w, h, rot, center, half, size);
  }

  /** Side wall: silhouette layers stacked behind the relief, deepest first. */
  private drawSide(
    rot: Float32Array,
    center: readonly [number, number],
    half: readonly [number, number],
  ): void {
    const { gl, volume, look } = this;
    if (!volume || !look || volume.thickness <= 0) return;
    const small = window.innerWidth < render.mobileBreakpoint;
    const cap = small ? V.mobileMaxLayers : V.maxLayers;
    const layers = Math.min(cap, Math.max(2, Math.ceil(volume.thickness / V.layerStep)));
    const s = this.side;
    gl.useProgram(s.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.vertexAttrib1f(1, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(s.u.uTex, 0);
    gl.uniform2f(s.u.uTexel, 1 / TEXTURE_SIZE, 1 / TEXTURE_SIZE);
    gl.uniform2f(s.u.uCenter, center[0], center[1]);
    gl.uniform2f(s.u.uHalf, half[0], half[1]);
    gl.uniformMatrix3fv(s.u.uRot, false, rot);
    gl.uniform1f(s.u.uCamera, render.camera);
    gl.uniform1f(s.u.uDepth, 0);
    gl.uniform1f(s.u.uReveal, this.reveal);
    gl.uniform4fv(s.u.uSideTint, SIDE_TINT[look.finish] ?? NO_TINT);
    for (let i = layers; i >= 1; i--) {
      gl.uniform1f(s.u.uZ, -(volume.thickness * i) / layers);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private drawSmoke(
    dt: number,
    w: number,
    h: number,
    rot: Float32Array,
    center: readonly [number, number],
    half: readonly [number, number],
    size: number,
  ): void {
    const look = this.look;
    if (!look || !this.smokeBuffer) return;
    const gl = this.gl;
    // Project the mouthpiece with the same transform as the puff vertex shader.
    const lx = look.nozzle.x * 2 - 1;
    const ly = 1 - look.nozzle.y * 2;
    const lz = this.volume?.nozzleHeight ?? 0;
    const px = (rot[0] ?? 1) * lx + (rot[3] ?? 0) * ly + (rot[6] ?? 0) * lz;
    const py = (rot[1] ?? 0) * lx + (rot[4] ?? 1) * ly + (rot[7] ?? 0) * lz;
    const pz = (rot[2] ?? 0) * lx + (rot[5] ?? 0) * ly + (rot[8] ?? 1) * lz;
    const wDiv = (render.camera - pz) / render.camera;
    const origin = {
      x: ((center[0] + (px * half[0]) / wDiv) * 0.5 + 0.5) * w,
      y: ((center[1] + (py * half[1]) / wDiv) * 0.5 + 0.5) * h,
    };
    this.particles.update(
      dt,
      origin,
      size,
      Math.max(size * 0.15, h - origin.y),
      this.reducedMotion,
      this.tilt.x,
    );
    const count = this.particles.fill(w, h, this.smokeIntensity * this.reveal);
    if (count === 0) return;

    const s = this.smoke;
    const colors = smokeColors(look.smoke);
    const rgb = (i: number) => hexToRgb(colors[Math.min(i, colors.length - 1)] ?? '#ffffff');
    gl.useProgram(s.program);
    gl.uniform1f(s.u.uKind, SMOKE_INDEX[look.smoke.kind]);
    gl.uniform1f(s.u.uTime, this.time);
    gl.uniform1f(s.u.uColorCount, colors.length);
    gl.uniform3fv(s.u.uC0, rgb(0));
    gl.uniform3fv(s.u.uC1, rgb(1));
    gl.uniform3fv(s.u.uC2, rgb(2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.smokeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.particles.vertices.subarray(0, count * SMOKE_STRIDE));
    const stride = SMOKE_STRIDE * FLOAT_BYTES;
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * FLOAT_BYTES);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * FLOAT_BYTES);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }
}
