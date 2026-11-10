import type { CSSProperties, ReactNode } from 'react';
import { rarityTier } from '../../domain/rarity.ts';
import type { PuffDefinition, PuffInstance } from '../../domain/types.ts';
import { assetUrl } from '../../data/manifest.ts';
import { useGame } from '../../store/GameProvider.tsx';
import { RarityIcon } from './RarityIcon.tsx';
import styles from './PuffThumb.module.css';

interface PuffThumbProps {
  puff: PuffDefinition;
  /** The copy shown (best owned one). Undefined = not owned: silhouette. */
  instance?: PuffInstance;
  count?: number;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Extra line under the name (e.g. "dernier exemplaire"). */
  note?: ReactNode;
  showName?: boolean;
}

export function PuffThumb({
  puff,
  instance,
  count = instance ? 1 : 0,
  href,
  onClick,
  selected = false,
  disabled = false,
  note,
  showName = true,
}: PuffThumbProps) {
  const { config } = useGame();
  const tier = instance ? rarityTier(config, instance.rarity) : null;
  const owned = Boolean(instance);
  const label = owned
    ? `${puff.flavor}, ${puff.model}, ${tier?.name ?? ''}${count > 1 ? `, ${count} exemplaires` : ''}`
    : `${puff.flavor}, ${puff.model}, pas encore obtenue`;
  const style = { '--tier': tier?.color ?? 'transparent' } as CSSProperties;
  const image = assetUrl(puff.images.thumb);

  const content = (
    <>
      <span className={styles.frame}>
        <img
          className={styles.img}
          src={image}
          alt=""
          width={256}
          height={256}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        {instance && instance.finish !== 'normal' && (
          <span
            className={styles.foil}
            data-finish={instance.finish}
            style={
              {
                maskImage: `url("${image}")`,
                WebkitMaskImage: `url("${image}")`,
                // Opaque box of the image, for effects laid along the puff's edges.
                '--bx': puff.bbox.x,
                '--by': puff.bbox.y,
                '--bw': puff.bbox.w,
                '--bh': puff.bbox.h,
              } as CSSProperties
            }
          />
        )}
        {tier && (
          <span className={styles.pip} style={{ background: tier.color, color: tier.ink }}>
            <RarityIcon icon={tier.icon} size={12} />
          </span>
        )}
        {count > 1 && <span className={styles.count}>×{count}</span>}
      </span>
      {showName && (
        <span className={styles.name}>
          {owned ? puff.flavor : '???'}
          {note && <span className={styles.note}>{note}</span>}
        </span>
      )}
    </>
  );

  const className = styles.thumb;
  const data = { 'data-owned': owned, 'data-selected': selected };
  if (href) {
    return (
      <a className={className} href={href} style={style} aria-label={label} {...data}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      aria-pressed={onClick ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      {...data}
    >
      {content}
    </button>
  );
}
