import { useState } from 'react';
import { Button } from '../components/Button.tsx';
import { PuffMark } from '../components/Logo.tsx';
import styles from './ErrorScreen.module.css';

/** A playful dead end: the puff can be poked while you decide to reload. */
export function ErrorScreen({ error }: { error: Error }) {
  const [pokes, setPokes] = useState(0);
  return (
    <main className={styles.screen}>
      <button
        type="button"
        className={styles.mark}
        onClick={() => setPokes((n) => n + 1)}
        aria-label="Secouer la puff"
        data-poked={pokes % 2 === 1}
      >
        <PuffMark size={120} />
      </button>
      <h1 className={styles.title}>Oups, fausse route !</h1>
      <p className={styles.text}>
        Quelque chose s’est coincé dans la machine. Ta collection est en sécurité.
      </p>
      <p className={styles.detail}>{error.message}</p>
      {pokes >= 5 && <p className={styles.easter}>Ça ne va pas la réparer, mais ça soulage.</p>}
      <Button variant="jackpot" size="lg" onClick={() => window.location.reload()}>
        Relancer la machine
      </Button>
    </main>
  );
}
