import { rarityTier } from '../../domain/rarity.ts';
import type { RarityId } from '../../domain/types.ts';
import { useGame } from '../../store/GameProvider.tsx';
import { RarityIcon } from './RarityIcon.tsx';
import styles from './Badges.module.css';

export function RarityBadge({
  rarity,
  size = 'md',
}: {
  rarity: RarityId;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tier = rarityTier(useGame().config, rarity);
  return (
    <span
      className={`${styles.rarity} ${styles[size]}`}
      style={{ background: tier.color, color: tier.ink }}
      data-rarity={rarity}
    >
      <RarityIcon icon={tier.icon} size={size === 'lg' ? 22 : size === 'sm' ? 12 : 16} />
      {tier.name}
    </span>
  );
}
