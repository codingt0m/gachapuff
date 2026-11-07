import { useEffect, useState, useSyncExternalStore } from 'react';
import { useGameState } from '../store/GameProvider.tsx';
import { isReducedMotion } from './theme.ts';

/** Current time, refreshed every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (cb: () => void) => {
  const q = matchMedia(motionQuery);
  q.addEventListener('change', cb);
  return () => q.removeEventListener('change', cb);
};

/** True when animations should be calm (player setting, or system preference). */
export function useReducedMotion(): boolean {
  const pref = useGameState((s) => s.settings.motion);
  // Re-render when the system preference changes.
  useSyncExternalStore(subscribeMotion, () => matchMedia(motionQuery).matches);
  return isReducedMotion(pref);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = matchMedia(query);
      q.addEventListener('change', cb);
      return () => q.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
  );
}

export const DESKTOP_QUERY = '(min-width: 1024px)';
