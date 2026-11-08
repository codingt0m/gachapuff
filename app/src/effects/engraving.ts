import type { Engraving } from '../domain/types.ts';

const SIGNATURE_TEXT = 'Gachapuff';
const SIGNATURE_FONT =
  "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', cursive";
const SERIAL_FONT = "'Pixelify Sans Variable', 'Courier New', monospace";

/** "Nº 042/500" */
export function serialLabel(serial: number, edition: number): string {
  return `Nº ${String(serial).padStart(String(edition).length, '0')}/${edition}`;
}

/** Text shown for an engraving (null when there is none). */
export function engravingLabel(engraving: Engraving, edition: number): string | null {
  if (engraving.kind === 'serial') return serialLabel(engraving.serial, edition);
  if (engraving.kind === 'signature') return engraving.by ?? SIGNATURE_TEXT;
  return null;
}

async function loadFont(font: string): Promise<void> {
  try {
    await document.fonts.load(font);
  } catch {
    // The canvas falls back to another font: still readable.
  }
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: string,
  max: number,
  maxWidth: number,
): number {
  let px = max;
  ctx.font = `${weight} ${px}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) px = Math.floor((px * maxWidth) / width);
  ctx.font = `${weight} ${px}px ${family}`;
  return px;
}

/**
 * Draws the engraving as a white mask on a transparent square canvas laid over the
 * puff image (same size, same coordinates). The shader gives it its material.
 */
export async function drawEngraving(
  engraving: Engraving,
  bbox: { x: number; y: number; w: number; h: number },
  edition: number,
  size: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const text = engravingLabel(engraving, edition);
  if (!ctx || !text) return canvas;

  const cx = (bbox.x + bbox.w / 2) * size;
  const maxWidth = bbox.w * size * 0.78;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (engraving.kind === 'signature') {
    await loadFont(`italic 600 40px ${SIGNATURE_FONT}`);
    const cy = (bbox.y + bbox.h * 0.8) * size;
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    const px = fitFont(ctx, text, SIGNATURE_FONT, 'italic 600', size * 0.09, maxWidth);
    ctx.fillText(text, 0, 0);
    // Flourish under the name.
    const w = Math.min(maxWidth, ctx.measureText(text).width);
    ctx.lineWidth = Math.max(1.5, px * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, px * 0.55);
    ctx.bezierCurveTo(-w * 0.1, px * 0.85, w * 0.2, px * 0.2, w * 0.55, px * 0.5);
    ctx.stroke();
    return canvas;
  }

  await loadFont(`600 30px ${SERIAL_FONT}`);
  const cy = (bbox.y + bbox.h * 0.86) * size;
  const px = fitFont(ctx, text, SERIAL_FONT, '600', size * 0.065, maxWidth * 0.95);
  const w = ctx.measureText(text).width + px * 1.2;
  const h = px * 1.7;
  // Laser-etched plate: outline + text.
  ctx.lineWidth = Math.max(1.5, px * 0.08);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.25);
  ctx.stroke();
  ctx.fillText(text, cx, cy + px * 0.05);
  return canvas;
}
