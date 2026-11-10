import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { burstConfetti } from '../../effects/confetti.ts';
import { haptic } from '../../effects/haptics.ts';
import { sound } from '../../effects/sound.ts';
import { BoosterPack } from '../booster/BoosterPack.tsx';
import { usePointerTilt } from '../booster/usePointerTilt.ts';
import styles from './RevealOverlay.module.css';

/** Share of the pack width to swipe across to tear it open. */
const TEAR_DONE = 0.25;
const TICK_EVERY = 0.15;
/** Below this travel (px) a press counts as a tap, which tears the pack too. */
const TAP_SLOP = 10;

/** The pack, torn open with a swipe along its seam, a simple tap, or Enter / Space. */
export function PackIntro({
  name,
  phase,
  hintColor,
  charge,
  fxColors,
  slowdown,
  onTorn,
}: {
  name: string;
  phase: 'intro' | 'charging';
  hintColor: string;
  charge: number;
  /** Colours of the drawn puff's effects: they escape from the torn seam. Null = plain puff. */
  fxColors: string[] | null;
  /** Time-stretch of the opening (sparks, tear sound). */
  slowdown: number;
  onTorn: () => void;
}) {
  const [tear, setTear] = useState(0);
  const fxCanvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    startX: number;
    width: number;
    lastTick: number;
    travel: number;
  } | null>(null);
  /** When a pointer tore the pack: the click that follows must not skip the animation. */
  const toreAt = useRef(0);
  const tilt = usePointerTilt(phase === 'intro');
  const torn = phase !== 'intro';

  // Sparkles shot out of the seam when the pack opens (the light itself is CSS, below).
  useEffect(() => {
    const canvas = fxCanvas.current;
    if (!torn || !canvas || !fxColors) return;
    return burstConfetti(canvas, {
      count: 45,
      colors: fxColors,
      origin: { x: 0.5, y: 0.4 },
      power: 0.9,
      shape: 'spark',
      slowdown,
    });
    // fxColors is stable for the lifetime of a round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torn]);

  const complete = () => {
    drag.current = null;
    setTear(1);
    sound.play('tear', slowdown);
    haptic('tear');
    onTorn();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (torn) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      width: event.currentTarget.getBoundingClientRect().width,
      lastTick: 0,
      travel: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    tilt.onPointerMove(event);
    const d = drag.current;
    if (!d || torn) return;
    d.travel = Math.max(d.travel, Math.abs(event.clientX - d.startX));
    // Normalised so the tear line reaches 1 exactly when the swipe is long enough.
    const progress = Math.min(1, Math.abs(event.clientX - d.startX) / (d.width * TEAR_DONE));
    setTear((t) => Math.max(t, progress));
    if (progress - d.lastTick >= TICK_EVERY) {
      d.lastTick = progress;
      sound.play('tick');
      haptic('tick');
    }
    if (progress >= 1) {
      toreAt.current = performance.now();
      complete();
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    if (!torn && d.travel < TAP_SLOP) {
      toreAt.current = performance.now();
      complete();
      return;
    }
    drag.current = null;
    if (!torn) setTear(0);
  };

  const onPointerCancel = () => {
    if (!drag.current) return;
    drag.current = null;
    if (!torn) setTear(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (torn || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    complete();
  };

  return (
    <div className={styles.packIntro}>
      <div
        className={styles.packTouch}
        role={torn ? undefined : 'button'}
        tabIndex={torn ? undefined : 0}
        aria-label={torn ? undefined : 'Déchirer le booster'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // The overlay skips the animation on click: the gesture that tore the pack must not.
          if (performance.now() - toreAt.current < 500) event.stopPropagation();
        }}
        onPointerLeave={tilt.onPointerLeave}
      >
        <BoosterPack name={name} tear={tear} open={torn} charge={charge} glow={hintColor} />
        {!torn && <span className={styles.swipeHint} aria-hidden="true" />}
        {/* Only a special puff makes the pack shine, in its own colour. */}
        {fxColors && (
          <div
            className={styles.openFx}
            data-on={torn}
            style={{ '--light': fxColors[0] } as CSSProperties}
            aria-hidden="true"
          >
            <span className={styles.openHalo} />
            <span className={styles.openBeams} />
            <span className={styles.openSeam} />
            <canvas ref={fxCanvas} className={styles.openSparks} />
          </div>
        )}
      </div>
      <p className={styles.instruction} aria-live="polite">
        {torn ? 'Ça vient…' : 'Glisse le long des pointillés pour déchirer'}
      </p>
    </div>
  );
}
