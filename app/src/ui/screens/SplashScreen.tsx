import { Logo } from '../components/Logo.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import styles from './SplashScreen.module.css';

/** Shown while the catalog and the save load. */
export function SplashScreen() {
  return (
    <main className={styles.splash} aria-busy="true">
      <div className={styles.logo}>
        <Logo size="lg" />
      </div>
      <Skeleton width={220} height={300} radius="var(--r-lg)" />
      <Skeleton width={260} height={64} radius="var(--r-lg)" />
      <p className="visually-hidden">Chargement de la collection…</p>
    </main>
  );
}
