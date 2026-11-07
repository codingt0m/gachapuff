import { Button } from '../components/Button.tsx';
import { PuffMark } from '../components/Logo.tsx';
import { navigate, paths } from '../router.ts';
import styles from './ErrorScreen.module.css';

export default function NotFoundScreen() {
  return (
    <div className={styles.screen} style={{ minHeight: '60dvh' }}>
      <span className={styles.mark}>
        <PuffMark size={96} />
      </span>
      <h1 className={styles.title}>Page partie en fumée</h1>
      <p className={styles.text}>
        Il n’y a rien ici… mais il y a peut-être un booster qui t’attend.
      </p>
      <Button variant="jackpot" onClick={() => navigate(paths.booster)}>
        Retour aux boosters
      </Button>
    </div>
  );
}
