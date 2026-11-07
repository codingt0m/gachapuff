import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { feedback } from '../feedback.ts';
import { paths } from '../router.ts';
import { Icon } from './Icons.tsx';
import { Logo } from './Logo.tsx';
import styles from './Header.module.css';

export function Header() {
  const store = useGame();
  const soundOn = useGameState((s) => s.settings.sound);
  return (
    <header className={styles.header}>
      <a href={paths.booster} className={styles.home} aria-label="Gachapuff, accueil">
        <Logo size="sm" />
      </a>
      {store.dev && <span className={styles.dev}>DEV</span>}
      <button
        type="button"
        className={styles.sound}
        aria-pressed={soundOn}
        aria-label={soundOn ? 'Couper le son' : 'Activer le son'}
        onClick={() => {
          store.updateSettings({ sound: !soundOn });
          if (!soundOn) queueMicrotask(() => feedback('toggle'));
        }}
      >
        <Icon name={soundOn ? 'soundOn' : 'soundOff'} />
      </button>
    </header>
  );
}
