/** Confetti burst on a 2D canvas. Stops and clears itself when every piece has fallen. */
export interface ConfettiOptions {
  count: number;
  colors: readonly string[];
  /** Burst origin, as a share of the canvas size. */
  origin?: { x: number; y: number };
  /** Initial speed, as a share of the canvas height per second. */
  power?: number;
  /** 'spark': glowing, twinkling dots that float down slowly instead of paper confetti. */
  shape?: 'confetti' | 'spark';
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
}

const GRAVITY = 1.4; // canvas heights / s²
const DRAG = 0.985;
const PIECE_SIZE = 0.012; // share of the canvas height

export function burstConfetti(canvas: HTMLCanvasElement, o: ConfettiOptions): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || o.count <= 0) return () => undefined;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  const H = canvas.height;
  const origin = o.origin ?? { x: 0.5, y: 0.45 };
  const power = o.power ?? 1.6;
  const spark = o.shape === 'spark';
  const gravity = spark ? GRAVITY * 0.35 : GRAVITY;
  const pieces: Piece[] = Array.from({ length: o.count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.3 + Math.random() * 0.7) * power * H;
    const size = PIECE_SIZE * H * (0.6 + Math.random() * 0.8);
    return {
      x: origin.x * canvas.width,
      y: origin.y * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - power * H * 0.5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 18,
      w: size,
      h: size * (0.4 + Math.random() * 0.4),
      color: o.colors[i % o.colors.length] ?? '#ffffff',
      wobble: Math.random() * Math.PI * 2,
    };
  });

  let raf = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, canvas.width, H);
    let alive = 0;
    for (const p of pieces) {
      p.vy += gravity * H * dt;
      p.vx *= DRAG;
      p.vy *= DRAG;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.wobble += dt * 10;
      if (p.y > H + p.w) continue;
      alive++;
      if (spark) {
        drawSpark(ctx, p);
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, H);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, canvas.width, H);
  };
}

/** A glowing dot: white-hot core, coloured halo, twinkling radius. */
function drawSpark(ctx: CanvasRenderingContext2D, p: Piece): void {
  const r = p.w * (0.5 + 0.5 * Math.abs(Math.sin(p.wobble * 0.6)));
  const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.5);
  halo.addColorStop(0, '#ffffff');
  halo.addColorStop(0.3, p.color);
  halo.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
