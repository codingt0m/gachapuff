import type { CSSProperties } from 'react';
import { PuffMark } from '../components/Logo.tsx';
import styles from './BoosterPack.module.css';

export interface BoosterPackProps {
  name: string;
  /** Tear progress along the top seam, 0..1. */
  tear?: number;
  /** The top strip is torn off and light pours out. */
  open?: boolean;
  /** Build-up before the reveal, 0..1 (shake + glow). */
  charge?: number;
  /** Colour of the light coming out of the pack (rarity hint). */
  glow?: string;
  className?: string;
}

/** The booster pack: foil wrapper, crimped seams, holographic sheen following the pointer. */
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
      <div className={styles.strip}>
        <span className={styles.stripFoil} />
      </div>
      <div className={styles.seam}>
        <span className={styles.cut} />
      </div>
      <div className={styles.body}>
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
      </div>
      <span className={styles.light} />
    </div>
  );
}
