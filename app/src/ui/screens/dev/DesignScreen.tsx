import { useState } from 'react';
import { motion } from '../../../config/motion.ts';
import type { PuffInstance } from '../../../domain/types.ts';
import { useGame } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { Counter } from '../../components/Counter.tsx';
import { FinishBadge } from '../../components/FinishBadge.tsx';
import { Logo } from '../../components/Logo.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { PuffThumb } from '../../components/PuffThumb.tsx';
import { RarityBadge } from '../../components/RarityBadge.tsx';
import { Skeleton } from '../../components/Skeleton.tsx';
import { SmokeBadge } from '../../components/SmokeSwatch.tsx';
import { Switch } from '../../components/Switch.tsx';
import { useToast } from '../../components/Toast.tsx';
import styles from './DevScreens.module.css';

const COLORS = [
  'felt',
  'felt-dark',
  'paper',
  'ink',
  'bg-deep',
  'surface',
  'surface-2',
  'surface-3',
  'line',
  'text',
  'text-muted',
  'text-faint',
  'primary',
  'primary-hi',
  'gold',
  'cyan',
  'lime',
  'danger',
  'success',
];
const TYPE = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
const SPACE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const RADII = ['sm', 'md', 'lg', 'xl', 'pill'];
const SHADOWS = ['chunky', 'card', 'float'];

/** /dev/design: every token and base component, to keep the system consistent. */
export default function DesignScreen() {
  const { catalog, config } = useGame();
  const toast = useToast();
  const [count, setCount] = useState(42);
  const [on, setOn] = useState(true);
  const sample = catalog.puffs[0];
  const fake = (finish: PuffInstance['finish'], rarity: PuffInstance['rarity']): PuffInstance => ({
    uid: `demo-${finish}-${rarity}`,
    puffId: sample?.id ?? '',
    finish,
    smoke: { kind: 'gradient', colors: ['#ff3d7f', '#2de2e6'] },
    engraving: { kind: 'none' },
    rarity,
    points: 0,
    obtainedAt: 0,
    origin: 'booster',
  });

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Design system</h1>

      <section className={styles.section}>
        <h2>Logo</h2>
        <div className={styles.row}>
          <Logo size="sm" />
          <Logo size="md" />
          <Logo size="lg" />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Couleurs</h2>
        <div className={styles.swatches}>
          {COLORS.map((c) => (
            <div key={c} className={styles.swatch}>
              <span style={{ background: `var(--c-${c})` }} />
              <code>--c-{c}</code>
            </div>
          ))}
        </div>
        <h3>Raretés (config)</h3>
        <div className={styles.row}>
          {config.rarities.map((r) => (
            <RarityBadge key={r.id} rarity={r.id} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Typographie</h2>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-2xl)' }}>
          Pixelify Sans — titres, chiffres, boutons
        </p>
        <p>Atkinson Hyperlegible Next — texte courant et libellés.</p>
        {TYPE.map((t) => (
          <p key={t} style={{ fontSize: `var(--fs-${t})`, lineHeight: 1.2 }}>
            <code>--fs-{t}</code> Ouvre ton booster
          </p>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Espacements (base 4 px)</h2>
        {SPACE.map((s) => (
          <div key={s} className={styles.space}>
            <code>--sp-{s}</code>
            <span style={{ width: `var(--sp-${s})` }} />
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Rayons & ombres</h2>
        <div className={styles.row}>
          {RADII.map((r) => (
            <div key={r} className={styles.box} style={{ borderRadius: `var(--r-${r})` }}>
              --r-{r}
            </div>
          ))}
        </div>
        <div className={styles.row}>
          {SHADOWS.map((s) => (
            <div key={s} className={styles.box} style={{ boxShadow: `var(--sh-${s})` }}>
              --sh-{s}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Mouvement</h2>
        <ul className={styles.list}>
          {Object.entries(motion).map(([k, v]) => (
            <li key={k}>
              <code>--dur-{k}</code> {v} ms
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          Vocabulaire : enter, exit, pop, reward, shake, float, shimmer (ui/styles/motion.css).
        </p>
      </section>

      <section className={styles.section}>
        <h2>Boutons</h2>
        <div className={styles.row}>
          <Button variant="jackpot">Jackpot</Button>
          <Button>Primaire</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Désactivé</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Petit</Button>
          <Button size="md">Moyen</Button>
          <Button size="lg">Grand</Button>
          <Button size="xl" variant="jackpot">
            Énorme
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Badges</h2>
        <div className={styles.row}>
          {config.finishes.map((f) => (
            <FinishBadge key={f.id} finish={f.id} />
          ))}
        </div>
        <div className={styles.row}>
          <SmokeBadge smoke={{ kind: 'white' }} />
          <SmokeBadge smoke={{ kind: 'solid', color: '#2de2e6' }} />
          <SmokeBadge smoke={{ kind: 'gradient', colors: ['#ff3d7f', '#ffd23f', '#2de2e6'] }} />
        </div>
      </section>

      {sample && (
        <section className={styles.section}>
          <h2>Vignettes</h2>
          <div className={styles.thumbs}>
            <PuffThumb puff={sample} />
            <PuffThumb puff={sample} instance={fake('normal', 'common')} />
            <PuffThumb puff={sample} instance={fake('chromatic', 'epic')} count={3} />
            <PuffThumb
              puff={sample}
              instance={fake('golden', 'legendary')}
              selected
              onClick={() => undefined}
            />
            <PuffThumb
              puff={sample}
              instance={fake('cosmic', 'divine')}
              note="dernier exemplaire"
            />
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2>Compteurs, progression, états</h2>
        <div className={styles.row}>
          <Counter value={count} className={styles.bigNumber} />
          <Button size="sm" onClick={() => setCount((c) => c + 137)}>
            +137
          </Button>
        </div>
        <ProgressBar value={count % 100} max={100} label="Exemple" />
        <ProgressBar value={100} max={100} label="Complet" />
        <Skeleton height={48} />
        <Switch label="Interrupteur" checked={on} onChange={setOn} />
        <Button variant="secondary" onClick={() => toast('Ceci est un toast !', 'success')}>
          Afficher un toast
        </Button>
      </section>
    </div>
  );
}
