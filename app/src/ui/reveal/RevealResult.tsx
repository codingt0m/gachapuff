import type { PuffDefinition, PuffInstance } from '../../domain/types.ts';
import { Button } from '../components/Button.tsx';
import { EngravingBadge } from '../components/EngravingBadge.tsx';
import { FinishBadge } from '../components/FinishBadge.tsx';
import { RarityBadge } from '../components/RarityBadge.tsx';
import { SmokeBadge } from '../components/SmokeSwatch.tsx';
import { formatPuffs } from '../format.ts';
import styles from './RevealOverlay.module.css';

/** The card under the revealed puff: what it is, and one obvious next step. */
export function RevealResult({
  puff,
  instance,
  copies,
  onClose,
  onAgain,
}: {
  puff: PuffDefinition;
  instance: PuffInstance;
  /** Number of copies of this puff now owned (including this one). */
  copies: number;
  onClose: () => void;
  /** Opens the next booster; null when none is left (or after a fusion). */
  onAgain: (() => void) | null;
}) {
  const isNew = copies <= 1;
  return (
    <div className={styles.result}>
      <div className={styles.resultHead}>
        <RarityBadge rarity={instance.rarity} size="lg" />
        <span className={isNew ? styles.new : styles.dupe}>
          {isNew ? 'Nouvelle !' : `Doublon · ×${copies}`}
        </span>
      </div>
      <h2 className={styles.flavor}>{puff.flavor}</h2>
      <p className={styles.model}>
        {puff.model} · {formatPuffs(puff.puffs)}
      </p>
      <div className={styles.chips}>
        <FinishBadge finish={instance.finish} />
        <SmokeBadge smoke={instance.smoke} />
        <EngravingBadge engraving={instance.engraving} />
      </div>
      <div className={styles.actions}>
        {onAgain ? (
          <>
            <Button variant="jackpot" size="lg" block onClick={onAgain} autoFocus>
              Encore un !
            </Button>
            <div className={styles.secondary}>
              <Button variant="ghost" onClick={onClose}>
                Terminé
              </Button>
            </div>
          </>
        ) : (
          <Button variant="jackpot" size="lg" block onClick={onClose} autoFocus>
            Trop bien !
          </Button>
        )}
      </div>
    </div>
  );
}
