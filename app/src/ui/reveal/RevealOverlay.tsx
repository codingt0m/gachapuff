import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from '../../config/motion.ts';
import { finishDef, rarityIndex } from '../../domain/rarity.ts';
import { boosterType } from '../../domain/roll.ts';
import { burstConfetti } from '../../effects/confetti.ts';
import { engravingLabel } from '../../effects/engraving.ts';
import { sound } from '../../effects/sound.ts';
import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icons.tsx';
import { smokeLabel } from '../components/SmokeSwatch.tsx';
import { feedback } from '../feedback.ts';
import { useReducedMotion } from '../hooks.ts';
import { PuffStage } from '../puff/PuffStage.tsx';
import { navigate, paths } from '../router.ts';
import { FusionIntro } from './FusionIntro.tsx';
import { PackIntro } from './PackIntro.tsx';
import type { RevealRequest } from './RevealContext.tsx';
import { RevealResult } from './RevealResult.tsx';
import { useRevealTimeline } from './useRevealTimeline.ts';
import styles from './RevealOverlay.module.css';

export default function RevealOverlay({
  request: initial,
  onClose,
}: {
  request: RevealRequest;
  onClose: () => void;
}) {
  const [request, setRequest] = useState(initial);
  const [round, setRound] = useState(0);
  return (
    <RevealRound
      key={round}
      request={request}
      onClose={onClose}
      onNext={(next) => {
        setRequest(next);
        setRound((r) => r + 1);
      }}
    />
  );
}

function RevealRound({
  request,
  onClose,
  onNext,
}: {
  request: RevealRequest;
  onClose: () => void;
  onNext: (next: RevealRequest) => void;
}) {
  const store = useGame();
  const { config, catalog } = store;
  const collection = useGameState((s) => s.collection);
  const stock = useGameState((s) => s.boosters.stock);
  const reduced = useReducedMotion();
  const { instance } = request;
  const puff = catalog.byId.get(instance.puffId);
  const tierIndex = rarityIndex(config, instance.rarity);
  const tier = config.rarities[tierIndex];
  const timeline = useRevealTimeline(config.rarities, tierIndex, reduced);
  const { phase, skip } = timeline;
  const rootRef = useRef<HTMLDivElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const copies = collection.filter((i) => i.puffId === instance.puffId).length;

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Confetti at the burst (not when skipped, not with reduced motion).
  useEffect(() => {
    const canvas = confettiRef.current;
    if (phase !== 'burst' || !canvas || reduced || !tier?.reveal.confetti) return;
    return burstConfetti(canvas, {
      count: tier.reveal.confetti,
      colors: [tier.color, '#f2e8d5', '#e2a93b', '#d6312b', '#121212'],
    });
  }, [phase, reduced, tier]);

  const close = () => {
    feedback('success');
    onClose();
  };

  // Esc / Space / Enter: skip the animation, then close.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (phase === 'revealed') onClose();
        else skip();
      }
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        (phase === 'charging' || phase === 'burst')
      ) {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, skip, onClose]);

  if (!puff || !tier) return null;

  const canAgain = request.intro === 'pack' && (store.unlimitedBoosters || stock > 0);
  const again = () => {
    const next = store.openBooster();
    sound.play('whoosh');
    onNext({ intro: 'pack', instance: next });
  };

  const showPuff = phase === 'burst' || phase === 'revealed';
  const burstFx = phase === 'burst' && !timeline.skipped;
  const stretch = reduced ? 1 : tier.reveal.slowMotion;
  const engraving = engravingLabel(instance.engraving, config.serialEdition);
  const announce = `${puff.flavor}, ${puff.model}. Rareté ${tier.name}, finition ${finishDef(config, instance.finish).name}, ${smokeLabel(config, instance.smoke).toLowerCase()}${engraving ? `, gravure ${engraving}` : ''}.`;

  return (
    <div
      ref={rootRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={request.intro === 'pack' ? 'Ouverture du booster' : 'Fusion'}
      tabIndex={-1}
      data-phase={phase}
      data-reduced={reduced}
      style={
        {
          '--tier': tier.color,
          '--hint': timeline.hintColor,
          '--charge': timeline.charge,
          '--shake': `${tier.reveal.shakePx}px`,
          '--stretch': stretch,
          '--burst': `${motion.burst * stretch}ms`,
        } as CSSProperties
      }
      onClick={() => {
        if (phase === 'charging' || phase === 'burst') skip();
      }}
    >
      <span className={styles.backdrop} aria-hidden="true" />
      {(tier.reveal.rays || phase === 'charging') && (
        <span className={styles.rays} aria-hidden="true" />
      )}

      <div className={styles.topBar}>
        {phase !== 'revealed' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              skip();
            }}
          >
            Passer
          </Button>
        ) : (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className={styles.content} data-shake={burstFx && tier.reveal.shakePx > 0 && !reduced}>
        <div className={styles.stageArea}>
          {!showPuff &&
            (request.intro === 'pack' ? (
              <PackIntro
                name={boosterType(config, config.defaultBoosterType).name}
                phase={phase === 'intro' ? 'intro' : 'charging'}
                hintColor={timeline.hintColor}
                charge={timeline.charge}
                onTorn={timeline.startCharging}
              />
            ) : (
              <FusionIntro
                inputs={request.inputs}
                catalog={catalog}
                from={config.rarities[Math.max(0, tierIndex - 1)] ?? tier}
                hintColor={timeline.hintColor}
                charge={timeline.charge}
                onFused={timeline.startCharging}
              />
            ))}
          {showPuff && (
            <div className={styles.puffZoom} data-skipped={timeline.skipped}>
              <PuffStage
                puff={puff}
                finish={instance.finish}
                smoke={instance.smoke}
                engraving={instance.engraving}
                seedKey={instance.uid}
                glow={tier.color}
                label={announce}
                revealDelay={timeline.skipped ? null : 0}
              />
            </div>
          )}
        </div>

        {phase === 'revealed' && (
          <RevealResult
            puff={puff}
            instance={instance}
            copies={copies}
            primaryLabel={request.intro === 'pack' ? 'Ajouter à la collection' : 'Trop bien !'}
            onPrimary={close}
            onDetails={() => {
              onClose();
              navigate(paths.puff(puff.id, instance.uid));
            }}
            onAgain={canAgain ? again : null}
          />
        )}
      </div>

      {burstFx && tier.reveal.flash && !reduced && (
        <span className={styles.flash} aria-hidden="true" />
      )}
      <canvas ref={confettiRef} className={styles.confetti} aria-hidden="true" />
      <p className="visually-hidden" aria-live="assertive">
        {phase === 'revealed' ? announce : ''}
      </p>
    </div>
  );
}
