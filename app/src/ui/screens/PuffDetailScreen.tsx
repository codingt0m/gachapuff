import { useEffect, useMemo, useState } from 'react';
import { baseTierFor } from '../../domain/catalog.ts';
import { compareInstances } from '../../domain/collection.ts';
import { rarityTier } from '../../domain/rarity.ts';
import { assetUrl } from '../../data/manifest.ts';
import { gyroNeedsPermission, gyroSupported, requestGyroPermission } from '../../effects/tilt.ts';
import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { Button } from '../components/Button.tsx';
import { EngravingBadge } from '../components/EngravingBadge.tsx';
import { FinishBadge, FinishGlyph } from '../components/FinishBadge.tsx';
import { Icon } from '../components/Icons.tsx';
import { RarityBadge } from '../components/RarityBadge.tsx';
import { RarityIcon } from '../components/RarityIcon.tsx';
import { SmokeBadge, SmokeSwatch } from '../components/SmokeSwatch.tsx';
import { feedback } from '../feedback.ts';
import { formatDate, formatPuffs } from '../format.ts';
import { useMediaQuery } from '../hooks.ts';
import { PuffStage } from '../puff/PuffStage.tsx';
import { goBack, navigate, paths } from '../router.ts';
import styles from './PuffDetailScreen.module.css';

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export default function PuffDetailScreen({ id, uid }: { id: string; uid: string | null }) {
  const { catalog, config } = useGame();
  const collection = useGameState((s) => s.collection);
  const puff = catalog.byId.get(id);
  const copies = useMemo(
    () => collection.filter((i) => i.puffId === id).sort((a, b) => compareInstances(a, b, config)),
    [collection, id, config],
  );
  const selected = copies.find((c) => c.uid === uid) ?? copies[0];
  const touch = useMediaQuery('(pointer: coarse)');
  const [gyroGranted, setGyroGranted] = useState(false);
  const gyro = gyroSupported() && touch && (gyroGranted || !gyroNeedsPermission());

  const select = (next: string) => {
    feedback('tick');
    navigate(paths.puff(id, next), { replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goBack(paths.album);
      if (!selected || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      const index = copies.indexOf(selected);
      const next = copies[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (next) select(next.uid);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!puff) {
    return (
      <div className={styles.missing}>
        <p>Cette puff n’existe pas (ou plus) dans le catalogue.</p>
        <Button onClick={() => navigate(paths.album)}>Retour à l’album</Button>
      </div>
    );
  }

  const tier = selected ? rarityTier(config, selected.rarity) : null;
  const base = config.baseTiers.tiers[baseTierFor(puff.model, puff.puffs, config)];

  return (
    <article className={styles.screen}>
      <div className={styles.stageCol}>
        <button type="button" className={styles.back} onClick={() => goBack(paths.album)}>
          <Icon name="back" size={20} /> Album
        </button>
        <div className={styles.stage}>
          {selected && tier ? (
            <PuffStage
              puff={puff}
              finish={selected.finish}
              smoke={selected.smoke}
              engraving={selected.engraving}
              seedKey={selected.uid}
              glow={tier.color}
              turntable
              gyro={gyro}
              label={`${puff.flavor}, ${puff.model}`}
            />
          ) : (
            <div className={styles.locked}>
              <img src={assetUrl(puff.images.detail)} alt="" className={styles.silhouette} />
              <p>Pas encore obtenue</p>
            </div>
          )}
        </div>
        {selected && touch && gyroSupported() && gyroNeedsPermission() && !gyroGranted && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="gyro" size={18} />}
            className={styles.gyro}
            onClick={async () => setGyroGranted(await requestGyroPermission())}
          >
            Incliner avec le téléphone
          </Button>
        )}
      </div>

      <div className={styles.info}>
        <p className={styles.model}>{puff.model}</p>
        <h1 className={styles.flavor}>{selected ? puff.flavor : '???'}</h1>
        {selected && (
          <div className={styles.badges}>
            <RarityBadge rarity={selected.rarity} size="lg" />
          </div>
        )}
        <dl className={styles.facts}>
          <div>
            <dt>Bouffées</dt>
            <dd>{formatPuffs(puff.puffs)}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{base?.name}</dd>
          </div>
          {selected && (
            <>
              <div>
                <dt>Finition</dt>
                <dd>
                  <FinishBadge finish={selected.finish} />
                </dd>
              </div>
              <div>
                <dt>Fumée</dt>
                <dd>
                  <SmokeBadge smoke={selected.smoke} />
                </dd>
              </div>
              {selected.engraving.kind !== 'none' && (
                <div>
                  <dt>Gravure</dt>
                  <dd>
                    <EngravingBadge engraving={selected.engraving} />
                  </dd>
                </div>
              )}
              <div>
                <dt>Obtenue le</dt>
                <dd>{formatDate(selected.obtainedAt)}</dd>
              </div>
              <div>
                <dt>Origine</dt>
                <dd>{selected.origin === 'booster' ? 'Booster' : 'Recyclage'}</dd>
              </div>
            </>
          )}
        </dl>

        <section className={styles.copies} aria-labelledby="copies-title">
          <h2 id="copies-title" className={styles.copiesTitle}>
            Mes exemplaires <span>({copies.length})</span>
          </h2>
          {copies.length === 0 ? (
            <p className={styles.empty}>Aucun pour l’instant. Les boosters t’attendent !</p>
          ) : (
            <ul className={styles.copyList}>
              {copies.map((c) => {
                const t = rarityTier(config, c.rarity);
                return (
                  <li key={c.uid}>
                    <button
                      type="button"
                      className={styles.copy}
                      aria-current={c.uid === selected?.uid}
                      onClick={() => select(c.uid)}
                      style={{ borderColor: t.color }}
                    >
                      <span
                        className={styles.copyTier}
                        style={{ background: t.color, color: t.ink }}
                      >
                        <RarityIcon icon={t.icon} size={12} /> {t.name}
                      </span>
                      <FinishGlyph finish={c.finish} size={16} />
                      <SmokeSwatch smoke={c.smoke} size={16} />
                      <span className={styles.copyDate}>{shortDate.format(c.obtainedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
