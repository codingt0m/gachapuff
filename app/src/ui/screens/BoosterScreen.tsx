import { useCallback, useEffect, useMemo } from 'react';
import { nextBoosterAt } from '../../domain/boosters.ts';
import { globalProgress } from '../../domain/collection.ts';
import { boosterType } from '../../domain/roll.ts';
import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { BoosterPack } from '../booster/BoosterPack.tsx';
import { usePointerTilt } from '../booster/usePointerTilt.ts';
import { Button } from '../components/Button.tsx';
import { Counter } from '../components/Counter.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { PuffThumb } from '../components/PuffThumb.tsx';
import { feedback } from '../feedback.ts';
import { useNow } from '../hooks.ts';
import { useStartReveal } from '../reveal/RevealContext.tsx';
import { paths } from '../router.ts';
import { formatCountdown } from '../format.ts';
import styles from './BoosterScreen.module.css';

const RECENT_COUNT = 6;

export function BoosterScreen() {
  const store = useGame();
  const { config, catalog } = store;
  const boosters = useGameState((s) => s.boosters);
  const collection = useGameState((s) => s.collection);
  const startReveal = useStartReveal();
  const now = useNow();
  const tilt = usePointerTilt();
  const type = boosterType(config, config.defaultBoosterType);
  const max = config.regen.maxStock;
  const unlimited = store.unlimitedBoosters;
  const canOpen = unlimited || boosters.stock > 0;
  const next = nextBoosterAt(boosters, config.regen);
  const remaining = next === null ? 0 : Math.max(0, next - now);

  const owned = useMemo(() => new Set(collection.map((i) => i.puffId)), [collection]);
  const progress = globalProgress(catalog, owned);
  const recent = useMemo(
    () => [...collection].sort((a, b) => b.obtainedAt - a.obtainedAt).slice(0, RECENT_COUNT),
    [collection],
  );

  const open = useCallback(() => {
    if (!canOpen) {
      feedback('error');
      return;
    }
    const instance = store.openBooster();
    startReveal({ intro: 'pack', instance });
  }, [canOpen, store, startReveal]);

  // Space / Enter anywhere on the screen opens the booster (desktop).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      event.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.screen}>
      <h1 className="visually-hidden">Ouvrir un booster</h1>
      <div className={styles.hero}>
        <section className={styles.stage} aria-label="Booster du moment">
          <div
            className={styles.stock}
            role="img"
            aria-label={`${unlimited ? 'Illimités' : `${boosters.stock} sur ${max}`} boosters en stock`}
          >
            {unlimited ? (
              <span className={styles.unlimited}>∞ boosters</span>
            ) : (
              Array.from({ length: max }, (_, i) => (
                <span key={i} className={styles.pip} data-full={i < boosters.stock} />
              ))
            )}
          </div>
          <div className={styles.packArea} {...tilt}>
            {/* Tapping the pack is a shortcut for pointers; the button below is the accessible action. */}
            <div
              className={styles.packButton}
              onClick={canOpen ? open : undefined}
              aria-hidden="true"
            >
              <BoosterPack
                name={type.name}
                className={canOpen ? styles.packReady : styles.packEmpty}
              />
            </div>
          </div>
          <p className={styles.timer} aria-live="polite">
            {unlimited
              ? 'Mode dev : ouvre autant que tu veux.'
              : next === null
                ? 'Stock plein ! Ouvre-les sans modération.'
                : boosters.stock > 0
                  ? `+1 booster dans ${formatCountdown(remaining)}`
                  : `Prochain booster dans ${formatCountdown(remaining)}`}
          </p>
        </section>

        <div className={styles.cta}>
          <Button
            variant="jackpot"
            size="xl"
            block
            onClick={open}
            disabled={!canOpen}
            withFeedback={false}
          >
            {canOpen ? 'Ouvrir !' : formatCountdown(remaining)}
          </Button>
        </div>
      </div>

      <aside className={styles.side} aria-label="Ta collection">
        <div className={styles.progress}>
          <div className={styles.progressHead}>
            <span>Collection</span>
            <span>
              <Counter value={owned.size} /> / {catalog.puffs.length}
            </span>
          </div>
          <ProgressBar
            value={owned.size}
            max={catalog.puffs.length}
            label="Progression de la collection"
          />
          <span className={styles.percent}>
            <Counter value={Math.round(progress * 1000) / 10} suffix=" %" />
          </span>
        </div>
        <h2 className={styles.recentTitle}>Dernières trouvailles</h2>
        {recent.length === 0 ? (
          <p className={styles.empty}>Rien pour l’instant… ton premier booster t’attend !</p>
        ) : (
          <div className={styles.recent}>
            {recent.map((instance) => {
              const puff = catalog.byId.get(instance.puffId);
              return puff ? (
                <PuffThumb
                  key={instance.uid}
                  puff={puff}
                  instance={instance}
                  href={paths.puff(puff.id, instance.uid)}
                />
              ) : null;
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
