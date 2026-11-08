import { engravingDef } from '../../domain/rarity.ts';
import type { Engraving } from '../../domain/types.ts';
import { serialLabel } from '../../effects/engraving.ts';
import { useGame } from '../../store/GameProvider.tsx';
import styles from './Badges.module.css';

/** Chip for a signed or numbered copy; nothing for a plain one. */
export function EngravingBadge({ engraving }: { engraving: Engraving }) {
  const { config } = useGame();
  if (engraving.kind === 'none') return null;
  const def = engravingDef(config, engraving.kind);
  let text = def.name;
  if (engraving.kind === 'serial') text = serialLabel(engraving.serial, config.serialEdition);
  else if (engraving.kind === 'signature' && engraving.by) text = `Signée par ${engraving.by}`;
  return (
    <span className={styles.chip} data-engraving={engraving.kind}>
      <span className={styles.engraveMark} data-engraving={engraving.kind} aria-hidden="true" />
      {text}
    </span>
  );
}
