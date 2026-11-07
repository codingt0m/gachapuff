import { render } from '../../config/motion.ts';
import type { FinishId, Smoke } from '../../domain/types.ts';
import { compileProgram, createQuad, hexToRgb, loadImage, uniforms, uploadTexture } from './gl.ts';
import { PUFF_FRAGMENT, PUFF_VERTEX, SMOKE_FRAGMENT, SMOKE_VERTEX } from './shaders.ts';
import { SMOKE_STRIDE, SmokeParticles } from './SmokeParticles.ts';

export interface PuffLook {
  imageUrl: string;
  finish: FinishId;
  smoke: Smoke;
  /** Mouthpiece position in the image, [0, 1]. */
  nozzle: { x: number; y: number };
  /** Varies sparkle / facet layouts between copies. */
  seed: number;
}

const FINISH_INDEX: Record<FinishId, number> = {
  normal: 0,
  shiny: 1,
  golden: 2,
  chromatic: 3,
  crystal: 4,
  cosmic: 5,
};

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
] as const;

const SMOKE_UNIFORMS = ['uKind', 'uColorCount', 'uC0', 'uC1', 'uC2'] as const;

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
  if (smoke.kind === 'solid') return [smoke.color];
  if (smoke.kind === 'gradient') return smoke.colors;
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
  private readonly particles = new SmokeParticles();
  private texture: WebGLTexture | null = null;
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
    const puffProgram = compileProgram(gl, PUFF_VERTEX, PUFF_FRAGMENT);
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
    if (sameImage && this.texture) return;
    this.smokeIntensity = 0;
    this.particles.reset();
    const image = await loadImage(look.imageUrl);
    if (token !== this.lookToken || this.disposed) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = uploadTexture(this.gl, image);
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
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.texture || !this.look) return;

    // Puff square layout, in pixels then clip space.
    const size = Math.min(w * render.puffWidth, h * render.puffHeight);
    const centerYFromTop = h * (1 - render.bottomMargin) - size / 2;
    const center = [0, 1 - (2 * centerYFromTop) / h] as const;
    const half = [size / w, size / h] as const;
    const rot = rotation(this.tilt.x, this.tilt.y);

    const p = this.puff;
    gl.useProgram(p.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.drawSmoke(dt, w, h, rot, center, half, size);
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
    const px = (rot[0] ?? 1) * lx + (rot[3] ?? 0) * ly;
    const py = (rot[1] ?? 0) * lx + (rot[4] ?? 1) * ly;
    const pz = (rot[2] ?? 0) * lx + (rot[5] ?? 0) * ly;
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
    );
    const count = this.particles.fill(w, h, this.smokeIntensity * this.reveal);
    if (count === 0) return;

    const s = this.smoke;
    const colors = smokeColors(look.smoke);
    const rgb = (i: number) => hexToRgb(colors[Math.min(i, colors.length - 1)] ?? '#ffffff');
    gl.useProgram(s.program);
    gl.uniform1f(s.u.uKind, look.smoke.kind === 'white' ? 0 : look.smoke.kind === 'solid' ? 1 : 2);
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
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 4 * FLOAT_BYTES);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }
}
