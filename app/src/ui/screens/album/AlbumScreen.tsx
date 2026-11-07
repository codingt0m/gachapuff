import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layout } from '../../../config/layout.ts';
import { globalProgress } from '../../../domain/collection.ts';
import { useGame, useGameState } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { Counter } from '../../components/Counter.tsx';
import { Icon } from '../../components/Icons.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { DESKTOP_QUERY, useMediaQuery } from '../../hooks.ts';
import { paths } from '../../router.ts';
import { AlbumFiltersPanel } from './AlbumFiltersPanel.tsx';
import { AlbumGrid } from './AlbumGrid.tsx';
import { buildAlbum, DEFAULT_FILTERS, filtersActive, type AlbumFilters } from './albumModel.ts';
import styles from './AlbumScreen.module.css';

/** Survives navigation to a puff and back: same filters, same scroll position. */
const memory = { filters: DEFAULT_FILTERS, scrollY: 0 };

export default function AlbumScreen() {
  const { catalog, config } = useGame();
  const collection = useGameState((s) => s.collection);
  const [filters, setFilters] = useState<AlbumFilters>(memory.filters);
  const [panelOpen, setPanelOpen] = useState(false);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const gridRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => buildAlbum(catalog, collection, config, filters),
    [catalog, collection, config, filters],
  );
  const owned = useMemo(() => new Set(collection.map((i) => i.puffId)), [collection]);
  const progress = globalProgress(catalog, owned);
  const active = filtersActive(filters);

  useEffect(() => {
    memory.filters = filters;
  }, [filters]);

  useLayoutEffect(() => {
    const y = memory.scrollY;
    const id = requestAnimationFrame(() => window.scrollTo(0, y));
    const save = () => (memory.scrollY = window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', save);
    };
  }, []);

  const empty = collection.length === 0;
  const showPanel = desktop || panelOpen;

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Album</h1>
          <span className={styles.count}>
            <Counter value={owned.size} />{' '}
            <span className={styles.muted}>/ {catalog.puffs.length}</span>
          </span>
        </div>
        <ProgressBar
          value={owned.size}
          max={catalog.puffs.length}
          label="Progression globale de l’album"
        />
        <div className={styles.toolbar}>
          <span className={styles.percent}>
            {(progress * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % complété
          </span>
          {!desktop && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="filter" size={18} />}
              aria-expanded={panelOpen}
              aria-controls="album-filters"
              onClick={() => setPanelOpen((v) => !v)}
            >
              Filtres{active ? ' •' : ''}
            </Button>
          )}
        </div>
      </header>

      {empty && (
        <div className={styles.banner}>
          <p>
            <strong>Ton album est vide.</strong> Chaque booster ajoute une puff : la première
            t’attend !
          </p>
          <Button variant="jackpot" onClick={() => (window.location.hash = paths.booster)}>
            Ouvrir un booster
          </Button>
        </div>
      )}

      <div className={styles.body}>
        {showPanel && (
          <AlbumFiltersPanel
            id="album-filters"
            filters={filters}
            onChange={setFilters}
            models={catalog.models}
            config={config}
          />
        )}
        <div ref={gridRef} className={styles.gridArea}>
          {sections.length === 0 ? (
            <div className={styles.noResult}>
              <p>Aucune puff ne correspond à ces filtres.</p>
              <Button
                variant="secondary"
                onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
              >
                Tout afficher
              </Button>
            </div>
          ) : (
            <AlbumGrid
              containerRef={gridRef}
              sections={sections}
              config={config}
              albumLayout={layout.album}
            />
          )}
        </div>
      </div>
    </div>
  );
}
