import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--r-sm)',
  className,
}: {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
