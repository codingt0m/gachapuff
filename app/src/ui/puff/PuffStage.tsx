import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from '../../config/motion.ts';
import type { Engraving, FinishId, PuffDefinition, Smoke } from '../../domain/types.ts';
import { assetUrl } from '../../data/manifest.ts';
import { engravingLabel } from '../../effects/engraving.ts';
import { haptic } from '../../effects/haptics.ts';
import { TiltController } from '../../effects/tilt.ts';
import { PuffRenderer, type PuffLook } from '../../effects/webgl/PuffRenderer.ts';
import { markWebglUnavailable, seedFrom, webglAvailable } from '../../effects/webglSupport.ts';
import { useReducedMotion } from '../hooks.ts';
import { CssPuff } from './CssPuff.tsx';
import styles from './PuffStage.module.css';

const NO_ENGRAVING: Engraving = { kind: 'none' };

/** What the WebGL renderer draws for these props (also used to prewarm a reveal). */
export function puffLook(o: {
  puff: PuffDefinition;
  finish: FinishId;
  smoke: Smoke;
  engraving?: Engraving;
  seedKey: string;
}): PuffLook {
  return {
    imageUrl: assetUrl(o.puff.images.detail),
    finish: o.finish,
    smoke: o.smoke,
    engraving: o.engraving ?? NO_ENGRAVING,
    nozzle: o.puff.nozzle,
    bbox: o.puff.bbox,
    seed: seedFrom(o.seedKey),
  };
}

/**
 * Starts building the WebGL rendering of a puff before it is shown (shaders, image,
 * relief): the next PuffStage mounted with the same puff and finish adopts it at once.
 */
export function prewarmPuffStage(look: PuffLook): () => void {
  if (webglAvailable()) PuffRenderer.prewarm(look);
  return () => PuffRenderer.discardPrewarmed();
}

export interface PuffStageProps {
  puff: PuffDefinition;
  finish: FinishId;
  smoke: Smoke;
  engraving?: Engraving;
  /** Seed for sparkle/facet layouts (instance uid). */
  seedKey: string;
  /** Halo colour (rarity colour, or the puff's own colour). */
  glow: string;
  label: string;
  /** Idle presentation: a wide, slow turn instead of the small wobble. */
  turntable?: boolean;
  /** Delay (ms) before the white silhouette floods into colour; null = shown at once. */
  revealDelay?: number | null;
  /** Duration (ms) of that colour flood. */
  revealDuration?: number;
  /** Listen to the gyroscope (permission handled by the caller). */
  gyro?: boolean;
  className?: string;
}

/**
 * The contemplative view of one puff: WebGL finish + smoke with a 3D tilt that follows
 * the finger / mouse / gyroscope. Falls back to a CSS rendering without WebGL.
 */
export function PuffStage({
  puff,
  finish,
  smoke,
  engraving = NO_ENGRAVING,
  seedKey,
  glow,
  label,
  turntable = false,
  revealDelay = null,
  revealDuration = motion.colorFlood,
  gyro = false,
  className,
}: PuffStageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<PuffRenderer | null>(null);
  const tiltRef = useRef(new TiltController());
  const holdingRef = useRef(false);
  const [fallback, setFallback] = useState(() => !webglAvailable());
  const reduced = useReducedMotion();
  // Look at mount time, to adopt a renderer prewarmed for it.
  const initialLook = useRef<PuffLook | null>(null);
  initialLook.current ??= puffLook({ puff, finish, smoke, engraving, seedKey });

  // Pointer / touch tilt, shared by the WebGL and the CSS renderings.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    return wrapper ? tiltRef.current.attach(wrapper) : undefined;
  }, []);

  // Press and hold on the puff: it blows a big cloud of its smoke until released.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const setHolding = (holding: boolean) => {
      if (holdingRef.current === holding) return;
      holdingRef.current = holding;
      rendererRef.current?.setHolding(holding);
      wrapper.toggleAttribute('data-holding', holding);
      if (holding) haptic('tap');
    };
    const press = (event: PointerEvent) => {
      if (event.button === 0) setHolding(true);
    };
    const release = () => setHolding(false);
    // A long press would otherwise open the context menu on touch screens.
    const noMenu = (event: Event) => event.preventDefault();
    wrapper.addEventListener('pointerdown', press);
    wrapper.addEventListener('pointerleave', release);
    wrapper.addEventListener('pointercancel', release);
    wrapper.addEventListener('contextmenu', noMenu);
    window.addEventListener('pointerup', release);
    window.addEventListener('blur', release);
    return () => {
      wrapper.removeEventListener('pointerdown', press);
      wrapper.removeEventListener('pointerleave', release);
      wrapper.removeEventListener('pointercancel', release);
      wrapper.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);

  useEffect(() => {
    tiltRef.current.reducedMotion = reduced;
    if (rendererRef.current) rendererRef.current.reducedMotion = reduced;
  }, [reduced]);

  useEffect(() => {
    tiltRef.current.turntable = turntable;
  }, [turntable]);

  useEffect(() => {
    if (!gyro) return;
    const tilt = tiltRef.current;
    tilt.enableGyro();
    return () => tilt.disableGyro();
  }, [gyro]);

  // One WebGL context per stage, released on unmount, paused when off screen.
  // Each renderer gets a fresh canvas: a released context can never be reused.
  useEffect(() => {
    const host = hostRef.current;
    const wrapper = wrapperRef.current;
    if (fallback || !host || !wrapper) return;
    // A renderer prewarmed during the pack opening already has its shaders and relief.
    const prewarmed = initialLook.current ? PuffRenderer.takePrewarmed(initialLook.current) : null;
    const canvas = prewarmed?.canvas ?? document.createElement('canvas');
    canvas.className = styles.canvas ?? '';
    host.appendChild(canvas);
    const renderer = prewarmed?.renderer ?? PuffRenderer.create(canvas);
    if (!renderer) {
      canvas.remove();
      markWebglUnavailable();
      queueMicrotask(() => setFallback(true));
      return;
    }
    rendererRef.current = renderer;
    renderer.setHolding(holdingRef.current);
    renderer.onContextLost = () => setFallback(true);
    const halo = haloRef.current;
    const shadow = shadowRef.current;
    renderer.onFrame = (dt) => {
      const t = tiltRef.current.update(dt);
      renderer.tilt = t;
      // Halo and contact shadow slide with the tilt (resting pose in PuffStage.module.css).
      const x = Number(t.x.toFixed(3));
      const y = Number(t.y.toFixed(3));
      if (halo) halo.style.transform = `translate(calc(-50% + ${x * -30}px), ${y * -20}px)`;
      if (shadow) {
        shadow.style.transform = `translateX(calc(-50% + ${x * 40}px)) scaleX(${1 + x * 0.2})`;
      }
    };
    let visible = true;
    const sync = () => (visible && !document.hidden ? renderer.start() : renderer.stop());
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      sync();
    });
    observer.observe(wrapper);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      renderer.dispose();
      canvas.remove();
      rendererRef.current = null;
    };
  }, [fallback]);

  const smokeKey = JSON.stringify(smoke);
  const engravingKey = JSON.stringify(engraving);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.reducedMotion = reduced;
    renderer
      .setLook(
        puffLook({
          puff,
          finish,
          smoke: JSON.parse(smokeKey) as Smoke,
          engraving: JSON.parse(engravingKey) as Engraving,
          seedKey,
        }),
      )
      .catch((error: unknown) => console.warn(error));
    // `reduced` is synced by its own effect; re-running here would reload the look.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puff, finish, smokeKey, engravingKey, seedKey, fallback]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (revealDelay === null) renderer.showInstantly();
    else renderer.animateReveal(revealDuration, revealDelay);
  }, [revealDelay, revealDuration, fallback]);

  return (
    <div
      ref={wrapperRef}
      className={`${styles.stage} ${className ?? ''}`}
      role="img"
      aria-label={label}
      data-finish={finish}
      style={{ '--glow': glow } as CSSProperties}
    >
      <span ref={haloRef} className={styles.halo} aria-hidden="true" />
      <span ref={shadowRef} className={styles.shadow} aria-hidden="true" />
      {fallback ? (
        <CssPuff
          puff={puff}
          finish={finish}
          smoke={smoke}
          engravingText={engravingLabel(engraving)}
          engravingKind={engraving.kind}
          tiltRef={tiltRef}
        />
      ) : (
        <div ref={hostRef} className={styles.canvas} />
      )}
    </div>
  );
}
