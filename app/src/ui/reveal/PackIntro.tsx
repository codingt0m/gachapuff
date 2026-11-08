import { useRef, useState, type PointerEvent } from 'react';
import { haptic } from '../../effects/haptics.ts';
import { sound } from '../../effects/sound.ts';
import { BoosterPack } from '../booster/BoosterPack.tsx';
import { usePointerTilt } from '../booster/usePointerTilt.ts';
import { Button } from '../components/Button.tsx';
import styles from './RevealOverlay.module.css';

/** Share of the pack width to swipe across to tear it open. */
const TEAR_DONE = 0.25;
const TICK_EVERY = 0.15;

/** The pack, torn open with a swipe along its seam (or a button / Enter for accessibility). */
export function PackIntro({
  name,
  phase,
  hintColor,
  charge,
  onTorn,
}: {
  name: string;
  phase: 'intro' | 'charging';
  hintColor: string;
  charge: number;
  onTorn: () => void;
}) {
  const [tear, setTear] = useState(0);
  const drag = useRef<{ startX: number; width: number; lastTick: number } | null>(null);
  const tilt = usePointerTilt(phase === 'intro');
  const torn = phase !== 'intro';

  const complete = () => {
    drag.current = null;
    setTear(1);
    sound.play('tear');
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
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    tilt.onPointerMove(event);
    const d = drag.current;
    if (!d || torn) return;
    // Normalised so the tear line reaches 1 exactly when the swipe is long enough.
    const progress = Math.min(1, Math.abs(event.clientX - d.startX) / (d.width * TEAR_DONE));
    setTear((t) => Math.max(t, progress));
    if (progress - d.lastTick >= TICK_EVERY) {
      d.lastTick = progress;
      sound.play('tick');
      haptic('tick');
    }
    if (progress >= 1) complete();
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (!torn) setTear(0);
  };

  return (
    <div className={styles.packIntro}>
      <div
        className={styles.packTouch}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={tilt.onPointerLeave}
      >
        <BoosterPack name={name} tear={tear} open={torn} charge={charge} glow={hintColor} />
        {!torn && <span className={styles.swipeHint} aria-hidden="true" />}
      </div>
      <p className={styles.instruction} aria-live="polite">
        {torn ? 'Ça vient…' : 'Glisse le long des pointillés pour déchirer'}
      </p>
      {!torn && (
        <Button
          variant="secondary"
          onClick={(event) => {
            // The overlay skips the animation on click: this one must not reach it.
            event.stopPropagation();
            complete();
          }}
          withFeedback={false}
        >
          Déchirer
        </Button>
      )}
    </div>
  );
}
