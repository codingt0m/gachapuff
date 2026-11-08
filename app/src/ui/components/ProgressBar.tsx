import type { CSSProperties } from 'react';
import styles from './ProgressBar.module.css';

export function ProgressBar({
  value,
  max,
  label,
  color,
  size = 'md',
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
  size?: 'sm' | 'md';
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      className={`${styles.track} ${styles[size]}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      data-complete={ratio >= 1}
      style={{ '--fill': `${ratio * 100}%`, '--bar': color ?? 'var(--c-primary)' } as CSSProperties}
    >
      <span className={styles.fill} />
    </div>
  );
}
