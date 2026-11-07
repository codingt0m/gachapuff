import type { GameConfig } from '../../../domain/types.ts';
import { Button } from '../../components/Button.tsx';
import { feedback } from '../../feedback.ts';
import {
  DEFAULT_FILTERS,
  filtersActive,
  type AlbumFilters,
  type AlbumSort,
  type Ownership,
} from './albumModel.ts';
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

export function AlbumFiltersPanel({
  id,
  filters,
  onChange,
  models,
  config,
}: {
  id: string;
  filters: AlbumFilters;
  onChange: (f: AlbumFilters) => void;
  models: readonly string[];
  config: GameConfig;
}) {
  const set = <K extends keyof AlbumFilters>(key: K, value: AlbumFilters[K]) => {
    feedback('tick');
    onChange({ ...filters, [key]: value });
  };
  return (
    <section id={id} className={styles.panel} aria-label="Filtres et tri">
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

      <label className={styles.field}>
        <span>Modèle</span>
        <select value={filters.model} onChange={(e) => set('model', e.target.value)}>
          <option value="all">Tous les modèles</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Rareté</span>
        <select
          value={filters.rarity}
          onChange={(e) => set('rarity', e.target.value as AlbumFilters['rarity'])}
        >
          <option value="all">Toutes</option>
          {config.rarities.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Finition</span>
        <select
          value={filters.finish}
          onChange={(e) => set('finish', e.target.value as AlbumFilters['finish'])}
        >
          <option value="all">Toutes</option>
          {config.finishes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Fumée</span>
        <select
          value={filters.smoke}
          onChange={(e) => set('smoke', e.target.value as AlbumFilters['smoke'])}
        >
          <option value="all">Toutes</option>
          {config.smokes.map((s) => (
            <option key={s.kind} value={s.kind}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {filtersActive(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
        >
          Réinitialiser les filtres
        </Button>
      )}
    </section>
  );
}
