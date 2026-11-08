import { smokeDef, smokeShapeDef } from '../../domain/rarity.ts';
import type { Smoke } from '../../domain/types.ts';
import { useGame } from '../../store/GameProvider.tsx';
import styles from './Badges.module.css';

export function smokeBackground(smoke: Smoke): string {
  switch (smoke.kind) {
    case 'white':
      return '#f4f2ff';
    case 'rainbow':
      return 'conic-gradient(#ff5a5a, #ffd23f, #3ddc84, #2de2e6, #6c5bff, #e040f0, #ff5a5a)';
    case 'gradient':
      return `linear-gradient(135deg, ${smoke.colors.join(', ')})`;
    case 'halo':
      return `radial-gradient(circle, ${smoke.colors.join(', ')})`;
    case 'swirl':
      return `conic-gradient(from 30deg, ${[...smoke.colors, ...smoke.colors, smoke.colors[0]].join(', ')})`;
    case 'alternate': {
      const step = 100 / smoke.colors.length;
      const stops = smoke.colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
      return `linear-gradient(90deg, ${stops.join(', ')})`;
    }
    case 'glitter':
      return `radial-gradient(circle at 30% 30%, #fff 0 10%, transparent 14%), radial-gradient(circle at 70% 65%, #fff 0 8%, transparent 12%), ${smoke.color}`;
    default:
      return smoke.color;
  }
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

/** "Fumée marbrée", "Fumée marbrée · cœurs". */
export function smokeLabel(config: Parameters<typeof smokeDef>[0], smoke: Smoke): string {
  const name = `Fumée ${smokeDef(config, smoke.kind).name.toLowerCase()}`;
  if (!smoke.shape || smoke.shape === 'cloud') return name;
  return `${name} · ${smokeShapeDef(config, smoke.shape).name.toLowerCase()}`;
}

export function SmokeBadge({ smoke }: { smoke: Smoke }) {
  const { config } = useGame();
  return (
    <span className={styles.chip}>
      <SmokeSwatch smoke={smoke} />
      {smokeLabel(config, smoke)}
    </span>
  );
}
