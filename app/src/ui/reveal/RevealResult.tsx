import type { PuffDefinition, PuffInstance } from '../../domain/types.ts';
import { Button } from '../components/Button.tsx';
import { FinishBadge } from '../components/FinishBadge.tsx';
import { RarityBadge } from '../components/RarityBadge.tsx';
import { SmokeBadge } from '../components/SmokeSwatch.tsx';
import { formatPuffs } from '../format.ts';
import styles from './RevealOverlay.module.css';

/** The card under the revealed puff: what it is, and what to do next. */
export function RevealResult({
  puff,
  instance,
  copies,
  primaryLabel,
  onPrimary,
  onDetails,
  onAgain,
}: {
  puff: PuffDefinition;
  instance: PuffInstance;
  /** Number of copies of this puff now owned (including this one). */
  copies: number;
  primaryLabel: string;
  onPrimary: () => void;
  onDetails: () => void;
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
      </div>
      <div className={styles.actions}>
        <Button variant="jackpot" size="lg" block onClick={onPrimary} autoFocus>
          {primaryLabel}
        </Button>
        <div className={styles.secondary}>
          <Button variant="secondary" onClick={onDetails}>
            Contempler
          </Button>
          {onAgain && (
            <Button variant="primary" onClick={onAgain}>
              Encore un !
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
