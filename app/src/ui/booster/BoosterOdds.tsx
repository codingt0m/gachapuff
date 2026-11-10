import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { exactRarityDistribution } from '../../domain/distribution.ts';
import { totalWeight } from '../../domain/dropRates.ts';
import { forPlayer } from '../../domain/game.ts';
import type { BoosterType, Catalog, GameConfig } from '../../domain/types.ts';
import { Button } from '../components/Button.tsx';
import { RarityIcon } from '../components/RarityIcon.tsx';
import styles from './BoosterOdds.module.css';

const percent = (ratio: number) =>
  ratio > 0 && ratio < 0.0001
    ? '< 0,01 %'
    : `${(ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/** "1 sur 260" for the rare ones, where a percentage says little. */
const oneIn = (ratio: number) =>
  ratio > 0 && ratio < 0.01 ? `1 sur ${Math.round(1 / ratio).toLocaleString('fr-FR')}` : '';

interface Row {
  key: string;
  name: string;
  ratio: number;
}

/** Rows of one drop table, as shares of its total (the draw normalises the same way). */
function rows<K extends string>(
  items: readonly { id: K; name: string }[],
  weights: Record<K, number>,
): Row[] {
  const total = totalWeight(weights);
  return items.map((i) => ({ key: i.id, name: i.name, ratio: weights[i.id] / total }));
}

function Table({ title, items, note }: { title: string; items: Row[]; note?: string }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <dl className={styles.rows}>
        {items.map((r) => (
          <div key={r.key} className={styles.row}>
            <dt>{r.name}</dt>
            <dd>{percent(r.ratio)}</dd>
          </div>
        ))}
      </dl>
      {note && <p className={styles.note}>{note}</p>}
    </section>
  );
}

/**
 * The odds of a booster type, read from the very weights it is drawn with
 * (config.boosterTypes, built from `dropRates`): never typed by hand.
 */
export function BoosterOdds({
  open,
  type,
  config,
  catalog,
  pseudo,
  onClose,
}: {
  open: boolean;
  type: BoosterType;
  config: GameConfig;
  catalog: Catalog;
  pseudo: string | undefined;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The only focusable is the close button at the bottom: start from the top anyway.
      dialog.scrollTop = 0;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The player's real odds: without a pseudo, no signed puff.
  const rarity = useMemo(
    () => exactRarityDistribution(catalog, forPlayer(type, pseudo), config),
    [catalog, type, pseudo, config],
  );
  const tiers = config.baseTiers.tiers.map((t, i) => ({ id: String(i), name: t.name }));
  const baseWeights = Object.fromEntries(type.baseTierWeights.map((w, i) => [String(i), w]));

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="odds-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A tap on the backdrop closes the sheet.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet}>
        <h2 id="odds-title" className={styles.title}>
          Probabilités
          <span className={styles.subtitle}>{type.name}</span>
        </h2>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Rareté de la puff</h3>
          <dl className={styles.rows}>
            {config.rarities.map((r) => (
              <div key={r.id} className={styles.row} style={{ '--tier': r.color } as CSSProperties}>
                <dt className={styles.tier}>
                  <RarityIcon icon={r.icon} size={14} /> {r.name}
                </dt>
                <dd>
                  {percent(rarity[r.id])}
                  <small>{oneIn(rarity[r.id])}</small>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={styles.columns}>
          <Table
            title="Finition"
            items={rows(
              config.finishes.map((f) => ({ id: f.id, name: f.name })),
              type.finishWeights,
            )}
          />
          <Table
            title="Fumée"
            items={rows(
              config.smokes.map((s) => ({ id: s.kind, name: s.name })),
              type.smokeWeights,
            )}
          />
          <Table
            title="Forme de fumée"
            items={rows(
              config.smokeShapes.map((s) => ({ id: s.shape, name: s.name })),
              type.smokeShapeWeights,
            )}
          />
          <Table title="Format" items={rows(tiers, baseWeights)} />
          <Table
            title="Puff signée"
            items={rows(
              config.engravings
                .filter((e) => e.kind !== 'none')
                .map((e) => ({ id: e.kind, name: e.name })),
              type.engravingWeights,
            )}
            note={pseudo ? undefined : 'Seulement avec un pseudo (Réglages).'}
          />
        </div>

        <Button variant="secondary" block onClick={onClose}>
          Fermer
        </Button>
      </div>
    </dialog>
  );
}
