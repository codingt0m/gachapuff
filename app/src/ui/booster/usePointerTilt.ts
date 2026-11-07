import { useCallback, type PointerEvent } from 'react';
import { tilt } from '../../config/motion.ts';

const RAD_TO_DEG = 180 / Math.PI;

/** CSS-variable tilt for light DOM objects (the booster pack): no WebGL, no re-render. */
export function usePointerTilt(enabled = true) {
  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const max = tilt.maxAngle * RAD_TO_DEG * 0.6;
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    },
    [enabled],
  );
  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
  }, []);
  return { onPointerMove, onPointerLeave };
}
