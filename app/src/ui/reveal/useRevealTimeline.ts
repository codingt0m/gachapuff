import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from '../../config/motion.ts';
import type { RarityTier } from '../../domain/types.ts';
import { haptic, hapticReveal } from '../../effects/haptics.ts';
import { sound } from '../../effects/sound.ts';

/**
 * Phases of a reveal:
 *   intro     pack waiting to be torn, or the fusion animation
 *   charging  the hint: glow climbs through the tier colours, sound rises
 *   burst     flash / rays / confetti / shake, the puff floods into colour
 *   revealed  the result card is shown
 */
export type RevealPhase = 'intro' | 'charging' | 'burst' | 'revealed';

export interface RevealTimeline {
  phase: RevealPhase;
  /** Colour of the hint glow (climbs tier by tier). */
  hintColor: string;
  /** 0..1 build-up. */
  charge: number;
  /** True when the burst effects were skipped (instant reveal). */
  skipped: boolean;
  startCharging: () => void;
  skip: () => void;
}

export function useRevealTimeline(
  tiers: readonly RarityTier[],
  tierIndex: number,
  reduced: boolean,
): RevealTimeline {
  const tier = tiers[tierIndex] as RarityTier;
  const choreo = tier.reveal;
  const [phase, setPhase] = useState<RevealPhase>('intro');
  const [step, setStep] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  const startCharging = useCallback(() => {
    if (phase !== 'intro') return;
    clear();
    setPhase('charging');
    // Climb from the lowest tier to the drawn one, never past it: the hint never lies.
    const steps = Math.min(choreo.hintSteps, tierIndex + 1);
    const first = tierIndex + 1 - steps;
    const suspense = reduced ? choreo.suspenseMs / 2 : choreo.suspenseMs;
    const interval = suspense / steps;
    for (let i = 0; i < steps; i++) {
      at(i * interval, () => {
        setStep(first + i);
        sound.riser(first + i);
        haptic('tick');
      });
    }
    at(suspense, () => {
      setPhase('burst');
      sound.reveal(tierIndex, tiers.length);
      hapticReveal(tierIndex);
    });
    const stretch = reduced ? 1 : choreo.slowMotion;
    at(suspense + motion.burst * stretch, () => setPhase('revealed'));
  }, [phase, choreo, tierIndex, reduced, tiers.length]);

  const skip = useCallback(() => {
    if (phase === 'revealed') return;
    clear();
    if (phase === 'intro' || phase === 'charging') sound.reveal(tierIndex, tiers.length);
    setSkipped(true);
    setStep(tierIndex);
    setPhase('revealed');
  }, [phase, tierIndex, tiers.length]);

  const shown = Math.max(0, step);
  return {
    phase,
    hintColor: step < 0 ? 'var(--c-gold)' : (tiers[shown]?.color ?? tier.color),
    charge: step < 0 ? 0 : (shown + 1) / (tierIndex + 1),
    skipped,
    startCharging,
    skip,
  };
}
