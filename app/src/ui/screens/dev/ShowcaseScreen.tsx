import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  Engraving,
  EngravingKind,
  Smoke,
  SmokeKind,
  SmokeShape,
} from '../../../domain/types.ts';
import { useGame } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { PuffStage } from '../../puff/PuffStage.tsx';
import styles from './DevScreens.module.css';

const SMOKES: Record<SmokeKind, Smoke> = {
  white: { kind: 'white' },
  solid: { kind: 'solid', color: '#2de2e6' },
  gradient: { kind: 'gradient', colors: ['#ff3d7f', '#ffd23f', '#6c5bff'] },
  halo: { kind: 'halo', colors: ['#ffd23f', '#ff3d7f', '#6c5bff'] },
  swirl: { kind: 'swirl', colors: ['#2de2e6', '#ff3d7f'] },
  alternate: { kind: 'alternate', colors: ['#ff3d7f', '#2de2e6', '#ffd23f'] },
  glitter: { kind: 'glitter', color: '#6c5bff' },
  rainbow: { kind: 'rainbow' },
};

const ENGRAVINGS: Record<EngravingKind, Engraving> = {
  none: { kind: 'none' },
  signature: { kind: 'signature' },
  serial: { kind: 'serial', serial: 7 },
};

/**
 * Mounts its content only while near the viewport: each stage holds a WebGL context and
 * browsers cap them (~16), fewer than the number of finishes.
 */
function WhenVisible({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      {
        rootMargin: '200px 0px',
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={styles.cellStage}>
      {visible && children}
    </div>
  );
}

function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segment} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

/** /dev/vitrine: one puff in every finish, with the chosen smoke, to validate the rendering. */
export default function ShowcaseScreen() {
  const { catalog, config } = useGame();
  const [puffId, setPuffId] = useState(
    () =>
      catalog.puffs.find((p) => p.model.startsWith('Falcon 16K'))?.id ?? catalog.puffs[0]?.id ?? '',
  );
  const [smokeKind, setSmokeKind] = useState<SmokeKind>('white');
  const [smokeShape, setSmokeShape] = useState<SmokeShape>('cloud');
  const [engravingKind, setEngravingKind] = useState<EngravingKind>('none');
  const puff = catalog.byId.get(puffId);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Vitrine</h1>
      <p className={styles.muted}>
        Une même puff dans toutes les finitions. Change la fumée, sa forme ou la gravure. Survole /
        touche une puff pour l’incliner.
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
        <Segment
          label="Fumée"
          options={config.smokes.map((s) => ({ id: s.kind, name: s.name }))}
          value={smokeKind}
          onChange={setSmokeKind}
        />
        <Segment
          label="Forme de fumée"
          options={config.smokeShapes.map((s) => ({ id: s.shape, name: s.name }))}
          value={smokeShape}
          onChange={setSmokeShape}
        />
        <Segment
          label="Gravure"
          options={config.engravings.map((e) => ({ id: e.kind, name: e.name }))}
          value={engravingKind}
          onChange={setEngravingKind}
        />
      </div>
      {puff && (
        <div className={styles.showcase}>
          {config.finishes.map((f) => (
            <figure key={f.id} className={styles.cell}>
              <WhenVisible>
                <PuffStage
                  puff={puff}
                  finish={f.id}
                  smoke={{ ...SMOKES[smokeKind], shape: smokeShape }}
                  engraving={ENGRAVINGS[engravingKind]}
                  seedKey={f.id}
                  glow={puff.color}
                  label={`${puff.flavor}, finition ${f.name}`}
                />
              </WhenVisible>
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
