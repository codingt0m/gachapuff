import { finishDef } from '../../domain/rarity.ts';
import type { FinishId } from '../../domain/types.ts';
import { useGame } from '../../store/GameProvider.tsx';
import styles from './Badges.module.css';

/** Small glyph per finish (shape + fill), used in chips and on album thumbnails. */
export function FinishGlyph({ finish, size = 14 }: { finish: FinishId; size?: number }) {
  return (
    <span
      className={styles.glyph}
      data-finish={finish}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function FinishBadge({ finish }: { finish: FinishId }) {
  const def = finishDef(useGame().config, finish);
  return (
    <span className={styles.chip} data-finish={finish}>
      <FinishGlyph finish={finish} />
      {def.name}
    </span>
  );
}
