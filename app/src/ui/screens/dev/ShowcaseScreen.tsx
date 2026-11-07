import { useState } from 'react';
import type { Smoke, SmokeKind } from '../../../domain/types.ts';
import { useGame } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { PuffStage } from '../../puff/PuffStage.tsx';
import styles from './DevScreens.module.css';

const SMOKES: Record<SmokeKind, Smoke> = {
  white: { kind: 'white' },
  solid: { kind: 'solid', color: '#2de2e6' },
  gradient: { kind: 'gradient', colors: ['#ff3d7f', '#ffd23f', '#6c5bff'] },
};

/** /dev/vitrine: one puff in every finish, with the chosen smoke, to validate the rendering. */
export default function ShowcaseScreen() {
  const { catalog, config } = useGame();
  const [puffId, setPuffId] = useState(
    () =>
      catalog.puffs.find((p) => p.model.startsWith('Falcon 16K'))?.id ?? catalog.puffs[0]?.id ?? '',
  );
  const [smokeKind, setSmokeKind] = useState<SmokeKind>('white');
  const puff = catalog.byId.get(puffId);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Vitrine</h1>
      <p className={styles.muted}>
        Une même puff dans toutes les finitions. Change la fumée pour voir les 18 combinaisons.
        Survole / touche une puff pour l’incliner.
      </p>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Puff</span>
          <select value={puffId} onChange={(e) => setPuffId(e.target.value)}>
            {catalog.puffs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.model} — {p.flavor}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setPuffId(catalog.puffs[Math.floor(Math.random() * catalog.puffs.length)]?.id ?? puffId)
          }
        >
          Au hasard
        </Button>
        <div className={styles.segment} role="radiogroup" aria-label="Fumée">
          {config.smokes.map((s) => (
            <button
              key={s.kind}
              type="button"
              role="radio"
              aria-checked={smokeKind === s.kind}
              onClick={() => setSmokeKind(s.kind)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {puff && (
        <div className={styles.showcase}>
          {config.finishes.map((f) => (
            <figure key={f.id} className={styles.cell}>
              <div className={styles.cellStage}>
                <PuffStage
                  puff={puff}
                  finish={f.id}
                  smoke={SMOKES[smokeKind]}
                  seedKey={f.id}
                  glow={puff.color}
                  label={`${puff.flavor}, finition ${f.name}`}
                />
              </div>
              <figcaption>
                <strong>{f.name}</strong> · {f.description}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
