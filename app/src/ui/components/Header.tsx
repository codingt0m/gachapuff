import { useGame } from '../../store/GameProvider.tsx';
import { paths } from '../router.ts';
import { Logo } from './Logo.tsx';
import styles from './Header.module.css';

export function Header() {
  const store = useGame();
  return (
    <header className={styles.header}>
      <a href={paths.booster} className={styles.home} aria-label="Gachapuff, accueil">
        <Logo size="sm" />
      </a>
      {store.dev && <span className={styles.dev}>DEV</span>}
    </header>
  );
}
