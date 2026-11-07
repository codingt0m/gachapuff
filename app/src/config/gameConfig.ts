/**
 * ============================================================================
 *  GACHAPUFF — GAME TUNING
 *  Every probability, threshold and timing of the game lives here.
 *  Check the resulting distribution on /#/dev/simulateur or with `npm run simulate`.
 * ============================================================================
 *
 * HOW RARITY WORKS
 * A drawn puff combines three independent axes, each worth rarity points:
 *   a) base puff (model x flavour): its model's base tier, derived from capacity;
 *   b) finish (normal, shiny, golden, chromatic, crystal, cosmic);
 *   c) smoke (white, solid colour, gradient).
 * points = baseTier.points + finish.points + smoke.points
 * The global rarity is the highest tier whose `minPoints` <= points.
 * That global rarity is what recycling (and, later, trading) uses.
 *
 * HOW A BOOSTER IS DRAWN
 * Each axis is drawn independently with the booster type's weights; then a puff
 * is picked uniformly among the puffs of the drawn base tier; then smoke colours
 * are drawn (random vivid HSL colours).
 *
 * HOW RECYCLING IS DRAWN
 * `recycle.inputCount` copies of rarity N -> 1 copy of rarity N+1 (the last tier
 * cannot be recycled). The result is drawn with the rules of booster
 * `recycle.boosterType`, conditioned on rarity N+1: among all (base tier, finish,
 * smoke kind) combinations worth rarity N+1, one is picked proportionally to its
 * booster probability, then the puff and the smoke colours are drawn as above.
 *
 * Default distribution with these values (exact, see the simulator):
 *   Commune 49.1% · Peu commune 20.0% · Rare 13.9% · Épique 11.4%
 *   Légendaire 4.1% · Mythique 1.25% · Divine 0.19% (≈ 1 in 530)
 */
import type { GameConfig, RevealChoreography } from '../domain/types.ts';

const HOUR = 60 * 60 * 1000;

const reveal = (r: Partial<RevealChoreography>): RevealChoreography => ({
  suspenseMs: 700,
  hintSteps: 1,
  flash: false,
  rays: false,
  shakePx: 0,
  confetti: 0,
  slowMotion: 1,
  ...r,
});

export const gameConfig: GameConfig = {
  catalog: {
    // Models left out of the game (the pipeline's unsorted leftovers).
    excludedModels: ['Non classe'],
  },

  baseTiers: {
    // Bigger capacity = rarer. Tier index = position in this list.
    tiers: [
      { name: 'Mini', minPuffs: 0, points: 0 },
      { name: 'Standard', minPuffs: 20_000, points: 1 },
      { name: 'Max', minPuffs: 35_000, points: 2 },
      { name: 'Méga', minPuffs: 50_000, points: 3 },
      { name: 'Titan', minPuffs: 80_000, points: 4 },
    ],
    unknownCapacityTier: 0,
    // e.g. { 'Glide Pen': 2 } to force a model into a tier.
    modelOverrides: {},
  },

  finishes: [
    { id: 'normal', name: 'Normale', points: 0, description: 'La puff telle quelle.' },
    { id: 'shiny', name: 'Brillante', points: 2, description: 'Éclats et reflet balayant.' },
    { id: 'golden', name: 'Dorée', points: 3, description: 'Feuille d’or brossée.' },
    { id: 'chromatic', name: 'Chromatique', points: 5, description: 'Irisation holo.' },
    { id: 'crystal', name: 'Cristal', points: 6, description: 'Facettes et réfraction.' },
    { id: 'cosmic', name: 'Galaxie', points: 7, description: 'Une nébuleuse dedans.' },
  ],

  smokes: [
    { kind: 'white', name: 'Blanche', points: 0, colorCount: { min: 0, max: 0 } },
    { kind: 'solid', name: 'Colorée', points: 1, colorCount: { min: 1, max: 1 } },
    { kind: 'gradient', name: 'Dégradée', points: 2, colorCount: { min: 2, max: 3 } },
  ],

  // Random smoke colours are vivid HSL colours within these ranges.
  smokeColor: { saturation: [0.75, 1], lightness: [0.55, 0.7] },

  // CS:GO-like ladder. Never colour-only: each tier also has a name and an icon.
  rarities: [
    {
      id: 'common',
      name: 'Commune',
      minPoints: 0,
      color: '#b0b8c8',
      ink: '#140b2e',
      icon: 'circle',
      reveal: reveal({ suspenseMs: 450 }),
    },
    {
      id: 'uncommon',
      name: 'Peu commune',
      minPoints: 2,
      color: '#5ea2e8',
      ink: '#140b2e',
      icon: 'square',
      reveal: reveal({ suspenseMs: 650, hintSteps: 2, confetti: 20 }),
    },
    {
      id: 'rare',
      name: 'Rare',
      minPoints: 3,
      color: '#4b69ff',
      ink: '#ffffff',
      icon: 'triangle',
      reveal: reveal({ suspenseMs: 900, hintSteps: 3, rays: true, confetti: 50 }),
    },
    {
      id: 'epic',
      name: 'Épique',
      minPoints: 4,
      color: '#8847ff',
      ink: '#ffffff',
      icon: 'diamond',
      reveal: reveal({ suspenseMs: 1200, hintSteps: 4, flash: true, rays: true, confetti: 90 }),
    },
    {
      id: 'legendary',
      name: 'Légendaire',
      minPoints: 6,
      color: '#e040f0',
      ink: '#140b2e',
      icon: 'star',
      reveal: reveal({
        suspenseMs: 1600,
        hintSteps: 5,
        flash: true,
        rays: true,
        shakePx: 6,
        confetti: 140,
        slowMotion: 1.4,
      }),
    },
    {
      id: 'mythic',
      name: 'Mythique',
      minPoints: 8,
      color: '#ff4d4d',
      ink: '#140b2e',
      icon: 'hexagon',
      reveal: reveal({
        suspenseMs: 2000,
        hintSteps: 6,
        flash: true,
        rays: true,
        shakePx: 10,
        confetti: 200,
        slowMotion: 1.7,
      }),
    },
    {
      id: 'divine',
      name: 'Divine',
      minPoints: 10,
      color: '#ffd23f',
      ink: '#140b2e',
      icon: 'crown',
      reveal: reveal({
        suspenseMs: 2600,
        hintSteps: 7,
        flash: true,
        rays: true,
        shakePx: 14,
        confetti: 320,
        slowMotion: 2,
      }),
    },
  ],

  // One booster type at launch; add entries here to create new boosters.
  boosterTypes: [
    {
      id: 'classic',
      name: 'Booster Classique',
      baseTierWeights: [40, 30, 18, 9, 3],
      finishWeights: { normal: 78, shiny: 12, golden: 5, chromatic: 3, crystal: 1.5, cosmic: 0.5 },
      smokeWeights: { white: 82, solid: 14, gradient: 4 },
    },
  ],
  defaultBoosterType: 'classic',

  // One booster every 4 hours, up to 2 in stock. A new player starts full.
  regen: { intervalMs: 4 * HOUR, maxStock: 2, initialStock: 2 },

  recycle: { inputCount: 3, boosterType: 'classic' },
};
