import type { FinishId, PuffInstance } from '../domain/types.ts';

/** Tint of the sparkles a special finish lets out of the torn pack. */
const FINISH_TINT: Partial<Record<FinishId, string[]>> = {
  shiny: ['#fff6c8', '#ffffff'],
  glitch: ['#ff2bd6', '#2bf6ff'],
  silver: ['#e4e7ec', '#aeb4bf'],
  golden: ['#f5c542', '#ffe8a0'],
  bronze: ['#c98a4b', '#e8b983'],
  chrome: ['#dfe9f5', '#8fb4e0'],
  chromatic: ['#ff7ad9', '#7af0ff', '#fff27a'],
  crystal: ['#d8f3ff', '#ffffff'],
  ruby: ['#e0314b', '#ff8fa3'],
  emerald: ['#2fbf71', '#9bf0c1'],
  amethyst: ['#9b59e0', '#d8b4ff'],
  frost: ['#bfe9ff', '#ffffff'],
  cosmic: ['#6a4cff', '#ff7ad9', '#7af0ff'],
  lava: ['#ff5a1f', '#ffc247'],
};

const RAINBOW = ['#ff4d4d', '#ffb02e', '#ffe94d', '#4dd96b', '#4db8ff', '#b06bff'];

/**
 * What comes out of the pack when it is torn open: the colours of the drawn puff's
 * effects (smoke, shape, finish, engraving), or null for a plain puff.
 */
export function openingColors(instance: PuffInstance): string[] | null {
  const { smoke, finish, engraving } = instance;
  const colors: string[] = [];
  if (smoke.kind === 'rainbow') colors.push(...RAINBOW);
  else if (smoke.kind !== 'white') {
    colors.push(...('colors' in smoke ? smoke.colors : [smoke.color]));
  }
  colors.push(...(FINISH_TINT[finish] ?? []));
  if (engraving.kind !== 'none') colors.push('#e2a93b');
  if (colors.length === 0 && smoke.shape && smoke.shape !== 'cloud') colors.push('#ffffff');
  return colors.length > 0 ? colors : null;
}
