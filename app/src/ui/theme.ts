import { motion } from '../config/motion.ts';
import type { GameConfig, MotionPreference, RarityId } from '../domain/types.ts';

/** Injects the tokens whose source of truth is TypeScript (rarity colours, durations). */
export function applyDesignTokens(config: GameConfig, root = document.documentElement): void {
  for (const tier of config.rarities) {
    root.style.setProperty(`--rarity-${tier.id}`, tier.color);
    root.style.setProperty(`--rarity-${tier.id}-ink`, tier.ink);
  }
  for (const [name, ms] of Object.entries(motion)) {
    root.style.setProperty(`--dur-${name}`, `${ms}ms`);
  }
}

export const rarityVar = (id: RarityId) => `var(--rarity-${id})`;
export const rarityInkVar = (id: RarityId) => `var(--rarity-${id}-ink)`;

const reducedQuery = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function systemPrefersReducedMotion(): boolean {
  return reducedQuery()?.matches ?? false;
}

export function isReducedMotion(pref: MotionPreference): boolean {
  return pref === 'reduced' || (pref === 'system' && systemPrefersReducedMotion());
}

/** Reflects the motion preference on <html data-motion>, following system changes. */
export function bindMotionPreference(getPref: () => MotionPreference): () => void {
  const apply = () => {
    document.documentElement.dataset.motion = isReducedMotion(getPref()) ? 'reduced' : 'full';
  };
  apply();
  const query = reducedQuery();
  query?.addEventListener('change', apply);
  return () => query?.removeEventListener('change', apply);
}
