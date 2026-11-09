import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layout } from '../../../config/layout.ts';
import { globalProgress } from '../../../domain/collection.ts';
import { useGame, useGameState } from '../../../store/GameProvider.tsx';
import { Counter } from '../../components/Counter.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { AlbumFiltersPanel } from './AlbumFiltersPanel.tsx';
import { AlbumGrid } from './AlbumGrid.tsx';
import { buildAlbum, DEFAULT_FILTERS, type AlbumFilters } from './albumModel.ts';
import styles from './AlbumScreen.module.css';

/** Survives navigation to a puff and back: same filters, same scroll position. */
const memory = { filters: DEFAULT_FILTERS, scrollY: 0 };

export default function AlbumScreen() {
  const { catalog, config } = useGame();
  const collection = useGameState((s) => s.collection);
  const [filters, setFilters] = useState<AlbumFilters>(memory.filters);
  const gridRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => buildAlbum(catalog, collection, config, filters),
    [catalog, collection, config, filters],
  );
  const owned = useMemo(() => new Set(collection.map((i) => i.puffId)), [collection]);
  const progress = globalProgress(catalog, owned);

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
        </div>
      </header>

      {empty && (
        <div className={styles.banner}>
          <p>
            <strong>Ton album est vide.</strong> Chaque booster ajoute une puff : la première
            t’attend !
          </p>
        </div>
      )}

      <div className={styles.body}>
        <AlbumFiltersPanel filters={filters} onChange={setFilters} />
        <div ref={gridRef} className={styles.gridArea}>
          {sections.length === 0 ? (
            <div className={styles.noResult}>
              <p>
                {filters.ownership === 'missing'
                  ? 'Il ne te manque plus rien : album complet !'
                  : 'Aucune puff ici pour l’instant.'}
              </p>
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
