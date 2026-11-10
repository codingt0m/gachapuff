/**
 * ============================================================================
 *  GACHAPUFF — GAME TUNING
 *  Every probability, threshold and timing of the game lives here.
 *  Check the resulting distribution on /#/dev/simulateur or with `npm run simulate`.
 * ============================================================================
 *
 * HOW RARITY WORKS
 * A drawn puff combines five independent axes, each worth rarity points:
 *   a) base puff (model x flavour): its model's base tier, derived from capacity;
 *   b) finish: 7 rarity tiers, the finishes of a tier share its points;
 *   c) smoke colours (white; solid; the gradients, glitter and rainbow);
 *   d) smoke shape (cloud; rings / spiral; hearts / stars);
 *   e) engraving (none, signature).
 * points = baseTier + finish + smoke + smoke shape + engraving points
 * The global rarity is the highest tier whose `minPoints` <= points.
 * That global rarity is what recycling (and, later, trading) uses.
 *
 * HOW A BOOSTER IS DRAWN
 * Each axis is drawn independently with the booster type's weights (`dropRates`
 * below, in %); then a puff
 * is picked uniformly among the puffs of the drawn base tier; then smoke colours
 * (random vivid HSL colours) are drawn.
 *
 * HOW RECYCLING IS DRAWN
 * `recycle.inputCount` copies of rarity N -> 1 copy of rarity N+1 (the last tier
 * cannot be recycled). The result is drawn with the rules of booster
 * `recycle.boosterType`, conditioned on rarity N+1: among all (base tier, finish,
 * smoke kind, smoke shape, engraving) combinations worth rarity N+1, one is picked
 * proportionally to its booster probability, then the puff and the smoke colours are drawn as above.
 *
 * Default distribution with these values (exact, see the simulator):
 *   Commune 44.3% · Peu commune 20.5% · Rare 15.0% · Épique 13.6%
 *   Légendaire 4.7% · Mythique 1.53% · Divine 0.33% (≈ 1 in 302)
 */
import { splitTiers, type WeightTier } from '../domain/dropRates.ts';
import type { FinishId, GameConfig, RevealChoreography } from '../domain/types.ts';

const HOUR = 60 * 60 * 1000;

/**
 * DROP RATES of the classic booster, in %. Each table sums to 100: checked by `npm test`
 * (src/config/dropRates.test.ts) and `npm run simulate`, which also simulates N openings.
 */
export const dropRates = {
  /**
   * Finishes: 7 rarity tiers, 1 = the commonest. A tier's weight is split evenly between
   * its finishes. Each finish's rarity points (in `finishes` below) follow its tier.
   */
  finishTiers: [
    { weight: 50, ids: ['normal'] }, // 1 · commune
    { weight: 25, ids: ['glitch'] }, // 2 · première rareté, pas si rare
    { weight: 10, ids: ['crystal', 'frost'] }, // 3 · 5 % chacune
    { weight: 7, ids: ['chrome', 'chromatic'] }, // 4 · 3,5 % chacune
    { weight: 5, ids: ['golden'] }, // 5 · vraiment rare
    { weight: 2.5, ids: ['ruby'] }, // 6 · très rare
    { weight: 0.5, ids: ['cosmic'] }, // 7 · le graal
  ] satisfies WeightTier<FinishId>[],
};

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
    // In tier order (see dropRates.finishTiers): rarer tier = more points.
    { id: 'normal', name: 'Normale', points: 0, description: 'La puff telle quelle.' },
    { id: 'glitch', name: 'Glitch', points: 1, description: 'Cassette VHS déréglée.' },
    { id: 'crystal', name: 'Cristal', points: 2, description: 'Taille brillant, feux et éclats.' },
    { id: 'frost', name: 'Givre', points: 2, description: 'Gelée, fond sous le doigt.' },
    { id: 'chrome', name: 'Chrome liquide', points: 3, description: 'Miroir qui ondule.' },
    { id: 'chromatic', name: 'Chromatique', points: 3, description: 'Irisation holo.' },
    { id: 'golden', name: 'Dorée', points: 4, description: 'Feuille d’or brossée.' },
    { id: 'ruby', name: 'Rubis', points: 5, description: 'Rouge profond, éclats rosés.' },
    { id: 'cosmic', name: 'Galaxie', points: 7, description: 'Une nébuleuse dedans.' },
  ],

  smokes: [
    { kind: 'white', name: 'Blanche', points: 0, colorCount: { min: 0, max: 0 } },
    { kind: 'solid', name: 'Colorée', points: 1, colorCount: { min: 1, max: 1 } },
    // Gradients: 2-3 colours mixed in different ways.
    { kind: 'gradient', name: 'Dégradée', points: 2, colorCount: { min: 2, max: 3 } },
    { kind: 'halo', name: 'Auréolée', points: 2, colorCount: { min: 2, max: 3 } },
    { kind: 'swirl', name: 'Marbrée', points: 2, colorCount: { min: 2, max: 3 } },
    { kind: 'alternate', name: 'Alternée', points: 2, colorCount: { min: 2, max: 3 } },
    { kind: 'glitter', name: 'Pailletée', points: 2, colorCount: { min: 1, max: 1 } },
    { kind: 'rainbow', name: 'Arc-en-ciel', points: 2, colorCount: { min: 0, max: 0 } },
  ],

  // Shape of the exhaled smoke, drawn independently of its colours; its points add up.
  smokeShapes: [
    { shape: 'cloud', name: 'Nuage', points: 0 },
    { shape: 'rings', name: 'Anneaux', points: 1 },
    { shape: 'spiral', name: 'Spirale', points: 1 },
    { shape: 'hearts', name: 'Cœurs', points: 2 },
    { shape: 'stars', name: 'Étoiles', points: 2 },
  ],

  // A mark printed on the puff: 4th rarity axis.
  engravings: [
    { kind: 'none', name: 'Aucune', points: 0, description: 'Pas de gravure.' },
    { kind: 'signature', name: 'Signée', points: 1, description: 'Signature à la feuille d’or.' },
  ],
  // 1 signed puff in 5 is signed with the pseudo of the player who pulled it.
  ownSignatureChance: 0.2,

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
      minPoints: 5,
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
      minPoints: 7,
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
      minPoints: 9,
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
      finishWeights: splitTiers(dropRates.finishTiers),
      smokeWeights: {
        white: 82,
        solid: 14,
        // 2 points: 4 in total
        gradient: 1,
        halo: 0.7,
        swirl: 0.6,
        alternate: 0.5,
        glitter: 0.7,
        rainbow: 0.5,
      },
      smokeShapeWeights: { cloud: 90, rings: 4, spiral: 3, hearts: 1.8, stars: 1.2 },
      engravingWeights: { none: 94, signature: 4.5 },
    },
  ],
  defaultBoosterType: 'classic',

  // One booster every 4 hours, up to 2 in stock. A new player starts full.
  regen: { intervalMs: 4 * HOUR, maxStock: 2, initialStock: 2 },

  recycle: { inputCount: 3, boosterType: 'classic' },
};
