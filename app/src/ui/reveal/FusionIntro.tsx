import { useEffect, type CSSProperties } from 'react';
import { motion } from '../../config/motion.ts';
import type { Catalog, PuffInstance, RarityTier } from '../../domain/types.ts';
import { assetUrl } from '../../data/manifest.ts';
import { sound } from '../../effects/sound.ts';
import styles from './RevealOverlay.module.css';

/** Three copies orbit, spiral in and melt into an orb; then the hint takes over. */
export function FusionIntro({
  inputs,
  catalog,
  from,
  hintColor,
  charge,
  onFused,
}: {
  inputs: PuffInstance[];
  catalog: Catalog;
  from: RarityTier;
  hintColor: string;
  charge: number;
  onFused: () => void;
}) {
  useEffect(() => {
    sound.play('fuse');
    const id = window.setTimeout(onFused, motion.fusionSpin);
    return () => window.clearTimeout(id);
    // Runs once: the fusion plays a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={styles.fusion}
      style={{ '--from': from.color, '--hint': hintColor, '--charge': charge } as CSSProperties}
      aria-hidden="true"
    >
      <span className={styles.orb} />
      {inputs.map((instance, i) => {
        const puff = catalog.byId.get(instance.puffId);
        return puff ? (
          <span key={instance.uid} className={styles.orbiter} style={{ '--i': i } as CSSProperties}>
            <img src={assetUrl(puff.images.thumb)} alt="" />
          </span>
        ) : null;
      })}
    </div>
  );
}
