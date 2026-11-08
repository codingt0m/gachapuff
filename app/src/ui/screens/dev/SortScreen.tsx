import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { assetUrl } from '../../../data/manifest.ts';
import type { PuffDefinition } from '../../../domain/types.ts';
import { useGame } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icons.tsx';
import { useToast } from '../../components/Toast.tsx';
import styles from './SortScreen.module.css';

type Verdict = 'keep' | 'drop';

interface SortState {
  decisions: Record<string, Verdict>;
  /** Decision order, to undo the last one. */
  history: string[];
}

const STORAGE_KEY = 'gachapuff.tri.v1';
const SWIPE_DISTANCE = 110;
const FLY_MS = 220;

const EMPTY: SortState = { decisions: {}, history: [] };

function load(): SortState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    return {
      decisions: parsed.decisions && typeof parsed.decisions === 'object' ? parsed.decisions : {},
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return EMPTY;
  }
}

function save(state: SortState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: the sort still works for this visit */
  }
}

/** `Model/Flavor` — same layout as the dataset folders, so the result maps back to files. */
const label = (p: PuffDefinition) => `${p.model}/${p.flavor}`;

export function buildReport(puffs: readonly PuffDefinition[], decisions: Record<string, Verdict>) {
  const lines = (verdict: Verdict) =>
    puffs
      .filter((p) => decisions[p.id] === verdict)
      .map(label)
      .sort((a, b) => a.localeCompare(b));
  const keep = lines('keep');
  const drop = lines('drop');
  const pending = puffs.length - keep.length - drop.length;
  return [
    `GARDÉES (${keep.length})`,
    ...keep,
    '',
    `ÉCARTÉES (${drop.length})`,
    ...drop,
    ...(pending > 0 ? ['', `NON TRIÉES (${pending})`] : []),
  ].join('\n');
}

export default function SortScreen() {
  const { catalog } = useGame();
  const toast = useToast();
  const puffs = catalog.puffs;
  const [state, setState] = useState<SortState>(load);
  const [showResult, setShowResult] = useState(false);
  const [drag, setDrag] = useState<{ x: number; flying: boolean }>({ x: 0, flying: false });
  const start = useRef<{ x: number; id: number } | null>(null);
  const flying = useRef(false);

  const queue = useMemo(
    () => puffs.filter((p) => state.decisions[p.id] === undefined),
    [puffs, state.decisions],
  );
  const current = queue[0];
  const done = puffs.length - queue.length;

  useEffect(() => save(state), [state]);

  // Warm the next cards so a swipe never shows an empty frame.
  useEffect(() => {
    queue.slice(1, 4).forEach((p) => {
      new Image().src = assetUrl(p.images.detail);
    });
  }, [queue]);

  const decide = (verdict: Verdict) => {
    if (!current || flying.current) return;
    flying.current = true;
    setDrag({ x: (verdict === 'keep' ? 1 : -1) * window.innerWidth, flying: true });
    window.setTimeout(() => {
      setState((s) => ({
        decisions: { ...s.decisions, [current.id]: verdict },
        history: [...s.history, current.id],
      }));
      setDrag({ x: 0, flying: false });
      flying.current = false;
    }, FLY_MS);
  };

  const undo = () => {
    if (flying.current) return;
    setShowResult(false);
    setState((s) => {
      const last = s.history[s.history.length - 1];
      if (last === undefined) return s;
      const decisions = Object.fromEntries(
        Object.entries(s.decisions).filter(([id]) => id !== last),
      );
      return { decisions, history: s.history.slice(0, -1) };
    });
  };

  const decideRef = useRef(decide);
  const undoRef = useRef(undo);
  useEffect(() => {
    decideRef.current = decide;
    undoRef.current = undo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') decideRef.current('keep');
      else if (e.key === 'ArrowLeft') decideRef.current('drop');
      else if (e.key === 'ArrowDown' || e.key === 'Backspace') undoRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (flying.current) return;
    start.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, flying: false });
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    start.current = null;
    if (Math.abs(dx) >= SWIPE_DISTANCE) decide(dx > 0 ? 'keep' : 'drop');
    else setDrag({ x: 0, flying: false });
  };

  const report = useMemo(() => buildReport(puffs, state.decisions), [puffs, state.decisions]);
  const keptCount = Object.values(state.decisions).filter((v) => v === 'keep').length;
  const droppedCount = Object.values(state.decisions).filter((v) => v === 'drop').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast('Résultat copié.', 'success');
    } catch {
      toast('Copie impossible : sélectionne le texte à la main.', 'warning');
    }
  };

  const reset = () => {
    if (!window.confirm('Effacer tout le tri et recommencer ?')) return;
    setState(EMPTY);
    setShowResult(false);
  };

  if (!current || showResult) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>{current ? 'Résultat du tri' : 'Tri terminé'}</h1>
        <p className={styles.muted}>
          {keptCount} gardées · {droppedCount} écartées · {queue.length} non triées
        </p>
        <textarea
          className={styles.report}
          readOnly
          value={report}
          aria-label="Résultat du tri en texte"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className={styles.actions}>
          <Button onClick={() => void copy()}>Copier le texte</Button>
          {current && (
            <Button variant="secondary" onClick={() => setShowResult(false)}>
              Continuer le tri
            </Button>
          )}
          <Button variant="secondary" onClick={undo} disabled={state.history.length === 0}>
            Annuler la dernière
          </Button>
          <Button variant="danger" onClick={reset}>
            Tout recommencer
          </Button>
        </div>
      </div>
    );
  }

  const rotation = Math.max(-18, Math.min(18, drag.x / 14));
  const intent = Math.min(1, Math.abs(drag.x) / SWIPE_DISTANCE);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Tri du dataset</h1>
      <div className={styles.progress}>
        <progress max={puffs.length} value={done} aria-label="Avancement du tri" />
        <span>
          {done} / {puffs.length}
        </span>
      </div>

      <div className={styles.stage}>
        <div
          className={styles.card}
          data-flying={drag.flying}
          data-side={drag.x === 0 ? undefined : drag.x > 0 ? 'keep' : 'drop'}
          style={{
            transform: `translateX(${drag.x}px) rotate(${rotation}deg)`,
            ['--intent' as string]: intent,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <img
            key={current.id}
            className={styles.img}
            src={assetUrl(current.images.detail)}
            alt={`${current.flavor}, ${current.model}`}
            width={512}
            height={512}
            draggable={false}
          />
          <span className={styles.stamp} data-kind="keep">
            Garder
          </span>
          <span className={styles.stamp} data-kind="drop">
            Écarter
          </span>
        </div>
        <p className={styles.model}>{current.model}</p>
        <p className={styles.flavor}>{current.flavor}</p>
      </div>

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.round}
          data-kind="drop"
          onClick={() => decide('drop')}
          aria-label="Écarter (flèche gauche)"
        >
          <Icon name="close" size={32} />
        </button>
        <button
          type="button"
          className={styles.undo}
          onClick={undo}
          disabled={state.history.length === 0}
        >
          Retour
        </button>
        <button
          type="button"
          className={styles.round}
          data-kind="keep"
          onClick={() => decide('keep')}
          aria-label="Garder (flèche droite)"
        >
          <Icon name="check" size={32} />
        </button>
      </div>

      <p className={styles.muted}>
        Glisse à droite pour garder, à gauche pour écarter · {keptCount} gardées · {droppedCount}{' '}
        écartées
      </p>
      <Button variant="ghost" onClick={() => setShowResult(true)}>
        Voir le résultat maintenant
      </Button>
    </div>
  );
}
