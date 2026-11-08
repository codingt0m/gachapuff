import type { CSSProperties } from 'react';
import { PuffMark } from '../components/Logo.tsx';
import styles from './BoosterPack.module.css';

export interface BoosterPackProps {
  name: string;
  /** Tear progress along the top seam, 0..1. */
  tear?: number;
  /** The top strip is torn off and light pours out. */
  open?: boolean;
  /** Build-up before the reveal, 0..1 (shake + the bag swells). */
  charge?: number;
  /** Colour of the light coming out of the pack (rarity hint). */
  glow?: string;
  className?: string;
}

/** Flank layers between the flat seals (mid-plane) and the printed face. */
const FLANK_LAYERS = 10;
/** Layers of the back half, mostly hidden: they keep the bag closed when tilted. */
const BACK_LAYERS = 4;

/**
 * Pillow profile: layer k sits on a quarter circle from the mid-plane (k = 0, full size)
 * to the face (k = count, fully inset). `--z` is the share of the depth, `--in` the share
 * of the inset.
 */
function layerStyle(k: number, count: number, back: boolean): CSSProperties {
  const angle = (k / count) * (Math.PI / 2);
  const z = Math.sin(angle);
  return {
    '--z': (back ? -z : z).toFixed(3),
    '--in': (1 - Math.cos(angle)).toFixed(3),
  } as CSSProperties;
}

/**
 * The booster pack: a puffed-up foil bag. Flat crimped seals on the mid-plane, rounded
 * flanks built from stacked layers, and the printed face pushed forward in Z, so the bag
 * shows its thickness as it tilts.
 */
export function BoosterPack({
  name,
  tear = 0,
  open = false,
  charge = 0,
  glow = 'var(--c-gold)',
  className,
}: BoosterPackProps) {
  const style = {
    '--tear': tear,
    '--charge': charge,
    '--glow': glow,
  } as CSSProperties;
  return (
    <div
      className={`${styles.pack} ${className ?? ''}`}
      style={style}
      data-open={open}
      data-charging={charge > 0}
      aria-hidden="true"
    >
      <span className={styles.cast} />
      <span className={styles.backFace} />
      {Array.from({ length: BACK_LAYERS }, (_, i) => (
        <span
          key={`b${i}`}
          className={styles.layer}
          style={layerStyle(BACK_LAYERS - i, BACK_LAYERS + 1, true)}
        />
      ))}
      {Array.from({ length: FLANK_LAYERS }, (_, k) => (
        <span
          key={`f${k}`}
          className={styles.layer}
          data-rim={k === 0}
          style={layerStyle(k, FLANK_LAYERS, false)}
        />
      ))}
      <div className={styles.sealBottom} />
      <div className={styles.strip}>
        <span className={styles.stripFoil} />
      </div>
      <div className={styles.seam}>
        <span className={styles.cut} />
      </div>
      <div className={styles.face}>
        <span className={styles.holo} />
        <span className={styles.burst} />
        <div className={styles.medal}>
          <PuffMark size={88} />
          <span className={styles.question}>?</span>
        </div>
        <span className={styles.brand}>Gachapuff</span>
        <span className={styles.name}>{name}</span>
        <span className={styles.sticker}>
          1<small>puff</small>
        </span>
        <span className={styles.gloss} />
      </div>
      <span className={styles.light} />
    </div>
  );
}
