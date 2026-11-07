import { useEffect, useRef, useState } from 'react';
import { motion } from '../../config/motion.ts';
import { useReducedMotion } from '../hooks.ts';

const format = new Intl.NumberFormat('fr-FR');

/** A number that counts up/down to its new value, casino style. */
export function Counter({
  value,
  suffix = '',
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (reduced) {
      shownRef.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / motion.counter);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(from + (value - from) * eased);
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {format.format(shown)}
      {suffix}
    </span>
  );
}
