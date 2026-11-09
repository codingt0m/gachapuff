import { feedback } from '../../feedback.ts';
import type { AlbumFilters, AlbumSort, Ownership } from './albumModel.ts';
import styles from './AlbumFiltersPanel.module.css';

const OWNERSHIP: { value: Ownership; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'owned', label: 'Obtenues' },
  { value: 'missing', label: 'Manquantes' },
];

const SORTS: { value: AlbumSort; label: string }[] = [
  { value: 'model', label: 'Par modèle' },
  { value: 'rarity', label: 'Par rareté' },
  { value: 'recent', label: 'Plus récentes' },
  { value: 'name', label: 'Par saveur (A→Z)' },
];

/** Two controls only: what to show, and in which order. */
export function AlbumFiltersPanel({
  filters,
  onChange,
}: {
  filters: AlbumFilters;
  onChange: (f: AlbumFilters) => void;
}) {
  const set = <K extends keyof AlbumFilters>(key: K, value: AlbumFilters[K]) => {
    feedback('tick');
    onChange({ ...filters, [key]: value });
  };
  return (
    <section className={styles.panel} aria-label="Affichage et tri">
      <fieldset className={styles.segment}>
        <legend className="visually-hidden">Afficher</legend>
        {OWNERSHIP.map((o) => (
          <label key={o.value} className={styles.segmentItem}>
            <input
              type="radio"
              name="ownership"
              value={o.value}
              checked={filters.ownership === o.value}
              onChange={() => set('ownership', o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>

      <label className={styles.field}>
        <span>Tri</span>
        <select value={filters.sort} onChange={(e) => set('sort', e.target.value as AlbumSort)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
