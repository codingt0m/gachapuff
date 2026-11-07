import { useEffect, useRef, type RefObject } from 'react';
import { tilt as tiltConfig } from '../../config/motion.ts';
import type { FinishId, PuffDefinition, Smoke } from '../../domain/types.ts';
import { assetUrl } from '../../data/manifest.ts';
import type { TiltController } from '../../effects/tilt.ts';
import { smokeBackground } from '../components/SmokeSwatch.tsx';
import styles from './CssPuff.module.css';

const RAD_TO_DEG = 180 / Math.PI;
const SMOKE_PUFFS = 6;

/** Fallback rendering without WebGL: CSS 3D tilt, masked foil gradient, CSS smoke. */
export function CssPuff({
  puff,
  finish,
  smoke,
  tiltRef,
}: {
  puff: PuffDefinition;
  finish: FinishId;
  smoke: Smoke;
  tiltRef: RefObject<TiltController>;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const image = assetUrl(puff.images.detail);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const t = tiltRef.current.update(Math.min(0.05, (now - last) / 1000));
      last = now;
      const body = bodyRef.current;
      if (body) {
        body.style.transform = `rotateY(${(-t.x * RAD_TO_DEG).toFixed(2)}deg) rotateX(${(t.y * RAD_TO_DEG).toFixed(2)}deg)`;
        body.style.setProperty('--shine', `${(50 + (t.x / tiltConfig.maxAngle) * 40).toFixed(1)}%`);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [tiltRef]);

  const mask = { maskImage: `url("${image}")`, WebkitMaskImage: `url("${image}")` };
  return (
    <div className={styles.scene}>
      <div
        className={styles.smoke}
        style={{ left: `${puff.nozzle.x * 100}%`, top: `${puff.nozzle.y * 100}%` }}
        aria-hidden="true"
      >
        {Array.from({ length: SMOKE_PUFFS }, (_, i) => (
          <span
            key={i}
            style={{ background: smokeBackground(smoke), animationDelay: `${i * 0.6}s` }}
          />
        ))}
      </div>
      <div ref={bodyRef} className={styles.body}>
        <img className={styles.img} src={image} alt="" draggable={false} />
        {finish !== 'normal' && <span className={styles.foil} data-finish={finish} style={mask} />}
        <span className={styles.gloss} style={mask} />
      </div>
    </div>
  );
}
