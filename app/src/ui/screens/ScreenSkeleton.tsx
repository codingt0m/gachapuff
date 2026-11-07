import { Skeleton } from '../components/Skeleton.tsx';
import styles from './ScreenSkeleton.module.css';

/** Placeholder while a lazily loaded screen arrives. */
export function ScreenSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <Skeleton width="45%" height={36} />
      <Skeleton width="70%" height={16} />
      <div className={styles.grid}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} height="auto" className={styles.cell} radius="var(--r-md)" />
        ))}
      </div>
    </div>
  );
}
