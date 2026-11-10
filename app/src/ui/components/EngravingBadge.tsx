import { engravingDef } from '../../domain/rarity.ts';
import type { Engraving } from '../../domain/types.ts';
import { useGame } from '../../store/GameProvider.tsx';
import styles from './Badges.module.css';

/** Chip for a signed copy; nothing for a plain one. */
export function EngravingBadge({ engraving }: { engraving: Engraving }) {
  const { config } = useGame();
  if (engraving.kind === 'none') return null;
  const def = engravingDef(config, engraving.kind);
  const text = engraving.by ? `Signée par ${engraving.by}` : def.name;
  return (
    <span className={styles.chip} data-engraving={engraving.kind}>
      <span className={styles.engraveMark} data-engraving={engraving.kind} aria-hidden="true" />
      {text}
    </span>
  );
}
