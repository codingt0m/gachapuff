import { smokeDef } from '../../domain/rarity.ts';
import type { Smoke } from '../../domain/types.ts';
import { useGame } from '../../store/GameProvider.tsx';
import styles from './Badges.module.css';

export function smokeBackground(smoke: Smoke): string {
  if (smoke.kind === 'white') return '#f4f2ff';
  if (smoke.kind === 'solid') return smoke.color;
  return `linear-gradient(135deg, ${smoke.colors.join(', ')})`;
}

export function SmokeSwatch({ smoke, size = 14 }: { smoke: Smoke; size?: number }) {
  return (
    <span
      className={styles.swatch}
      style={{ width: size, height: size, background: smokeBackground(smoke) }}
      aria-hidden="true"
    />
  );
}

export function SmokeBadge({ smoke }: { smoke: Smoke }) {
  const def = smokeDef(useGame().config, smoke.kind);
  return (
    <span className={styles.chip}>
      <SmokeSwatch smoke={smoke} />
      Fumée {def.name.toLowerCase()}
    </span>
  );
}
