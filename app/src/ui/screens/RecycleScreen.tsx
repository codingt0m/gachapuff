import { useMemo, useState, type CSSProperties } from 'react';
import { compareInstances } from '../../domain/collection.ts';
import { checkRecycle } from '../../domain/game.ts';
import type { PuffInstance, RarityId } from '../../domain/types.ts';
import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { Button } from '../components/Button.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PuffThumb } from '../components/PuffThumb.tsx';
import { RarityBadge } from '../components/RarityBadge.tsx';
import { RarityIcon } from '../components/RarityIcon.tsx';
import { feedback } from '../feedback.ts';
import { useStartReveal } from '../reveal/RevealContext.tsx';
import { paths } from '../router.ts';
import styles from './RecycleScreen.module.css';

export default function RecycleScreen() {
  const store = useGame();
  const { config, catalog } = store;
  const collection = useGameState((s) => s.collection);
  const startReveal = useStartReveal();
  const need = config.recycle.inputCount;
  const recyclable = useMemo(() => config.rarities.slice(0, -1), [config]);

  const byTier = useMemo(() => {
    const map = new Map<RarityId, PuffInstance[]>();
    for (const tier of recyclable) map.set(tier.id, []);
    for (const i of collection) map.get(i.rarity)?.push(i);
    return map;
  }, [collection, recyclable]);

  const copiesOf = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of collection) counts.set(i.puffId, (counts.get(i.puffId) ?? 0) + 1);
    return counts;
  }, [collection]);

  const firstReady = recyclable.find((t) => (byTier.get(t.id)?.length ?? 0) >= need)?.id;
  const [tierId, setTierId] = useState<RarityId>(firstReady ?? recyclable[0]?.id ?? 'common');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const tierIndex = config.rarities.findIndex((r) => r.id === tierId);
  const target = config.rarities[tierIndex + 1];
  // Duplicates first (safe to recycle), then by puff, worst copies first.
  const pool = useMemo(
    () =>
      [...(byTier.get(tierId) ?? [])].sort(
        (a, b) =>
          (copiesOf.get(b.puffId) ?? 0) - (copiesOf.get(a.puffId) ?? 0) ||
          a.puffId.localeCompare(b.puffId) ||
          compareInstances(b, a, config),
      ),
    [byTier, tierId, copiesOf, config],
  );
  const chosen = selected
    .map((uid) => pool.find((i) => i.uid === uid))
    .filter(Boolean) as PuffInstance[];
  const ready = checkRecycle({ ...store.getState(), collection }, selected, config).ok;

  /** Copies the player would lose entirely (selected = all their copies of that puff). */
  const lost = useMemo(() => {
    const picked = new Map<string, number>();
    for (const i of chosen) picked.set(i.puffId, (picked.get(i.puffId) ?? 0) + 1);
    return [...picked].filter(([id, n]) => n >= (copiesOf.get(id) ?? 0)).map(([id]) => id);
  }, [chosen, copiesOf]);

  const switchTier = (id: RarityId) => {
    feedback('tick');
    setTierId(id);
    setSelected([]);
  };

  const toggle = (uid: string) => {
    setSelected((list) => {
      if (list.includes(uid)) {
        feedback('tick');
        return list.filter((u) => u !== uid);
      }
      if (list.length >= need) {
        feedback('error');
        return list;
      }
      feedback('tap');
      return [...list, uid];
    });
  };

  const autoPick = () => {
    feedback('toggle');
    setSelected(pool.slice(0, need).map((i) => i.uid));
  };

  const fuse = () => {
    setConfirming(false);
    const inputs = chosen;
    const instance = store.recycle(selected);
    setSelected([]);
    startReveal({ intro: 'fusion', instance, inputs });
  };

  const totalReady = recyclable.filter((t) => (byTier.get(t.id)?.length ?? 0) >= need).length;

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className={styles.title}>Recyclage</h1>
        <p className={styles.lead}>
          Fusionne {need} puffs de même rareté pour en obtenir une de la rareté au-dessus.
        </p>
      </header>

      <div className={styles.tiers} role="radiogroup" aria-label="Rareté à recycler">
        {recyclable.map((t) => {
          const count = byTier.get(t.id)?.length ?? 0;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={t.id === tierId}
              className={styles.tierTab}
              style={{ '--tier': t.color, '--ink': t.ink } as CSSProperties}
              data-ready={count >= need}
              onClick={() => switchTier(t.id)}
            >
              <RarityIcon icon={t.icon} size={14} />
              <span>{t.name}</span>
              <span className={styles.tierCount}>{count}</span>
            </button>
          );
        })}
      </div>

      <section className={styles.machine} aria-label="Machine à fusion">
        <div className={styles.slots}>
          {Array.from({ length: need }, (_, i) => {
            const instance = chosen[i];
            const puff = instance ? catalog.byId.get(instance.puffId) : undefined;
            return (
              <div key={i} className={styles.slot} data-filled={Boolean(puff)}>
                {puff && instance ? (
                  <PuffThumb
                    puff={puff}
                    instance={instance}
                    showName={false}
                    onClick={() => toggle(instance.uid)}
                  />
                ) : (
                  <span className={styles.slotEmpty} aria-hidden="true">
                    +
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.formula}>
          <span>{need} ×</span>
          <RarityBadge rarity={tierId} size="sm" />
          <span aria-hidden="true">➜</span>
          <span className="visually-hidden">donnent</span>
          <span>1 ×</span>
          {target && <RarityBadge rarity={target.id} size="sm" />}
        </div>
        {lost.length > 0 && (
          <p className={styles.warning}>
            Attention : {lost.length > 1 ? `${lost.length} puffs quitteront` : 'une puff quittera'}{' '}
            ton album.
          </p>
        )}
        <div className={styles.machineActions}>
          <Button
            variant="jackpot"
            size="lg"
            block
            disabled={!ready}
            onClick={() => (lost.length > 0 ? setConfirming(true) : fuse())}
          >
            Fusionner
          </Button>
          {pool.length >= need && selected.length === 0 && (
            <Button variant="ghost" size="sm" onClick={autoPick}>
              Choisir pour moi (doublons d’abord)
            </Button>
          )}
        </div>
      </section>

      {pool.length === 0 ? (
        <div className={styles.empty}>
          <p>Aucune puff {config.rarities[tierIndex]?.name.toLowerCase()} pour l’instant.</p>
          {totalReady === 0 && (
            <Button variant="primary" onClick={() => (window.location.hash = paths.booster)}>
              Ouvrir un booster
            </Button>
          )}
        </div>
      ) : (
        <section aria-label="Tes puffs de cette rareté">
          {pool.length < need && (
            <p className={styles.hint}>
              Encore {need - pool.length} à trouver pour lancer une fusion.
            </p>
          )}
          <div className={styles.pool}>
            {pool.map((instance) => {
              const puff = catalog.byId.get(instance.puffId);
              if (!puff) return null;
              const last = (copiesOf.get(instance.puffId) ?? 0) <= 1;
              return (
                <PuffThumb
                  key={instance.uid}
                  puff={puff}
                  instance={instance}
                  count={copiesOf.get(instance.puffId) ?? 1}
                  selected={selected.includes(instance.uid)}
                  onClick={() => toggle(instance.uid)}
                  note={last ? 'dernier exemplaire' : undefined}
                />
              );
            })}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        title="Sûr de toi ?"
        confirmLabel="Fusionner quand même"
        confirmVariant="danger"
        onConfirm={fuse}
        onCancel={() => setConfirming(false)}
      >
        {lost.length > 1
          ? `Ce sont tes derniers exemplaires de : ${lost.map((id) => catalog.byId.get(id)?.flavor).join(', ')}. Ils redeviendront des silhouettes dans l’album.`
          : `C’est ton dernier exemplaire de ${catalog.byId.get(lost[0] ?? '')?.flavor ?? 'cette puff'}. Il redeviendra une silhouette dans l’album.`}
      </ConfirmDialog>
    </div>
  );
}
