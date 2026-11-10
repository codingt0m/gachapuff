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
 *   c) smoke colours (white; solid, rainbow; duo, glitter; gachapuff);
 *   d) smoke shape (cloud; rings / hearts; spiral);
 *   e) engraving (none, signature: the pseudo of the player who pulled it).
 * points = baseTier + finish + smoke + smoke shape + engraving points
 * The global rarity is the highest tier whose `minPoints` <= points.
 * That global rarity is what recycling (and, later, trading) uses.
 *
 * HOW A BOOSTER IS DRAWN
 * Each axis is drawn independently with the booster type's weights (`dropRates`
 * below, in %); then a puff
 * is picked uniformly among the puffs of the drawn base tier; then smoke colours
 * (random colours of `smokeColors.palette`) are drawn.
 *
 * HOW RECYCLING IS DRAWN
 * `recycle.inputCount` copies of rarity N -> 1 copy of rarity N+1 (the last tier
 * cannot be recycled). The result is drawn with the rules of booster
 * `recycle.boosterType`, conditioned on rarity N+1: among all (base tier, finish,
 * smoke kind, smoke shape, engraving) combinations worth rarity N+1, one is picked
 * proportionally to its booster probability, then the puff and the smoke colours are drawn as above.
 *
 * Distribution of each booster with these values (exact, see the simulator):
 *   Classique   Commune 63.7% · Peu commune 16.8% · Rare 10.3% · Épique 5.3%
 *               Légendaire 3.3% · Mythique 0.48% · Divine 0.012% (≈ 1 in 8 400)
 *   Nicotine    Commune 44.6% · Peu commune 18.5% · Rare 14.3% · Épique 9.7%
 *               Légendaire 9.3% · Mythique 3.2% · Divine 0.38% (≈ 1 in 260)
 *   Dopamine    Commune 28.8% · Peu commune 15.9% · Rare 15.0% · Épique 12.6%
 *               Légendaire 16.0% · Mythique 9.5% · Divine 2.2% (≈ 1 in 45)
 */
import { boosterWeights, type DropTable } from '../domain/dropRates.ts';
import type { GameConfig, RevealChoreography } from '../domain/types.ts';

const HOUR = 60 * 60 * 1000;

/**
 * DROP RATES of each booster type, in %. Each table sums to 100: checked by `npm test`
 * (src/config/dropRates.test.ts) and `npm run simulate`, which also simulates N openings.
 * The "Probabilités" sheet of the booster screen reads these same values.
 *
 * Rules kept in every booster (checked by the tests):
 *  - baseTiers: one weight per base tier (Mini -> Titan), bigger capacity = rarer;
 *  - finishTiers: 7 rarity tiers, 1 = the commonest, each rarer than the one below. A tier's
 *    weight is split evenly between its finishes, whose points (in `finishes`) follow the tier;
 *  - engravings: signed puffs, between rubis and galaxie. Always signed with the pseudo of
 *    the player who pulls it; a player without a pseudo pulls no signed puff;
 *  - smokes: drawn independently of the finish, from white (50 % or more) to gachapuff;
 *  - shapes: rings and hearts exactly as rare, spiral the rarest.
 */
export const dropRates = {
  /** Booster Classique: stingy. Dorée is the best you can really hope for. */
  classic: {
    baseTiers: [46, 30, 15, 7, 2],
    finishTiers: [
      { weight: 62, ids: ['normal'] }, // 1 · commune
      { weight: 24, ids: ['glitch'] }, // 2 · première rareté, pas si rare
      { weight: 7, ids: ['crystal', 'frost'] }, // 3 · 3,5 % chacune
      { weight: 4.5, ids: ['chrome', 'chromatic'] }, // 4 · 2,25 % chacune
      { weight: 2.3, ids: ['golden'] }, // 5 · le vrai objectif de ce booster
      { weight: 0.18, ids: ['ruby'] }, // 6 · ≈ 1 sur 550 : coup de chance
      { weight: 0.02, ids: ['cosmic'] }, // 7 · 1 sur 5 000 : miracle
    ],
    engravings: { none: 99.95, signature: 0.05 },
    smokes: { white: 68, solid: 16, rainbow: 9, duo: 4, glitter: 2.5, gachapuff: 0.5 },
    shapes: { cloud: 80, rings: 8, hearts: 8, spiral: 4 },
  },
  /** Boost de nicotine: the balanced, standard booster. */
  nicotine: {
    baseTiers: [40, 30, 18, 9, 3],
    finishTiers: [
      { weight: 50, ids: ['normal'] }, // 1 · commune
      { weight: 25, ids: ['glitch'] }, // 2 · première rareté, pas si rare
      { weight: 10, ids: ['crystal', 'frost'] }, // 3 · 5 % chacune
      { weight: 7, ids: ['chrome', 'chromatic'] }, // 4 · 3,5 % chacune
      { weight: 5, ids: ['golden'] }, // 5 · vraiment rare
      { weight: 2.5, ids: ['ruby'] }, // 6 · très rare
      { weight: 0.5, ids: ['cosmic'] }, // 7 · le graal
    ],
    engravings: { none: 99, signature: 1 },
    smokes: { white: 55, solid: 20, rainbow: 12, duo: 7, glitter: 4.5, gachapuff: 1.5 },
    shapes: { cloud: 70, rings: 12, hearts: 12, spiral: 6 },
  },
  /**
   * Dopamine maxing: far fewer plain and glitch puffs, more of everything else. So generous
   * that Légendaire outnumbers Épique here (the other tiers keep their order).
   */
  dopamine: {
    baseTiers: [38, 30, 18, 10, 4],
    finishTiers: [
      { weight: 32, ids: ['normal'] }, // 1 · commune
      { weight: 22, ids: ['glitch'] }, // 2 · première rareté
      { weight: 15, ids: ['crystal', 'frost'] }, // 3 · 7,5 % chacune
      { weight: 12, ids: ['chrome', 'chromatic'] }, // 4 · 6 % chacune
      { weight: 9, ids: ['golden'] }, // 5 · ≈ 1 sur 11
      { weight: 6, ids: ['ruby'] }, // 6 · ≈ 1 sur 17
      { weight: 4, ids: ['cosmic'] }, // 7 · 1 sur 25
    ],
    engravings: { none: 96, signature: 4 },
    smokes: { white: 52, solid: 20, rainbow: 13, duo: 7.5, glitter: 5, gachapuff: 2.5 },
    shapes: { cloud: 66, rings: 13, hearts: 13, spiral: 8 },
  },
} satisfies Record<string, DropTable>;

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
    { kind: 'white', name: 'Blanche', points: 0, colorCount: 0 },
    { kind: 'solid', name: 'Colorée', points: 1, colorCount: 1 },
    { kind: 'rainbow', name: 'Arc-en-ciel', points: 1, colorCount: 0 },
    // Two random colours, one per puff.
    { kind: 'duo', name: 'Duo', points: 2, colorCount: 2 },
    { kind: 'glitter', name: 'Pailletée', points: 2, colorCount: 1 },
    // Always the brand colours (smokeColors.gachapuff), core to edge.
    { kind: 'gachapuff', name: 'Gachapuff', points: 4, colorCount: 0 },
  ],

  // Shape of the exhaled smoke, drawn independently of its colours; its points add up.
  smokeShapes: [
    { shape: 'cloud', name: 'Nuage', points: 0 },
    { shape: 'rings', name: 'Anneaux', points: 1 },
    { shape: 'hearts', name: 'Cœurs', points: 1 },
    { shape: 'spiral', name: 'Spirale', points: 2 },
  ],

  // A mark printed on the puff: 4th rarity axis.
  engravings: [
    { kind: 'none', name: 'Aucune', points: 0, description: 'Pas de gravure.' },
    {
      kind: 'signature',
      name: 'Signée',
      points: 6,
      description: 'Ta signature à la feuille d’or.',
    },
  ],

  smokeColors: {
    // Sunset Drive neons. Names are shown in the puff's specs ("Couleurs : rose néon, orange").
    palette: [
      { name: 'rose néon', hex: '#ff2d87' },
      { name: 'rose bonbon', hex: '#ff7ac6' },
      { name: 'rouge', hex: '#ff3b5c' },
      { name: 'pêche', hex: '#ff7a59' },
      { name: 'orange', hex: '#ffa82e' },
      { name: 'jaune soleil', hex: '#ffd23f' },
      { name: 'vert lime', hex: '#b6f23a' },
      { name: 'menthe', hex: '#5cf2c0' },
      { name: 'turquoise', hex: '#22e0e6' },
      { name: 'bleu ciel', hex: '#4fb8ff' },
      { name: 'bleu océan', hex: '#2b6cff' },
      { name: 'violet néon', hex: '#8b4dff' },
      { name: 'lilas', hex: '#c58cff' },
      { name: 'magenta', hex: '#e040f0' },
    ],
    // The brand sunset, from the core of the smoke to its edge: orange, rose néon, violet néon.
    gachapuff: ['#ffa82e', '#ff2d87', '#8b4dff'],
  },

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
      minPoints: 3,
      color: '#5ea2e8',
      ink: '#140b2e',
      icon: 'square',
      reveal: reveal({ suspenseMs: 650, hintSteps: 2, confetti: 20 }),
    },
    {
      id: 'rare',
      name: 'Rare',
      minPoints: 4,
      color: '#4b69ff',
      ink: '#ffffff',
      icon: 'triangle',
      reveal: reveal({ suspenseMs: 900, hintSteps: 3, rays: true, confetti: 50 }),
    },
    {
      id: 'epic',
      name: 'Épique',
      minPoints: 5,
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
      minPoints: 11,
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

  // Three boosters, each with its own drop table (`dropRates`). Opening one uses `cost`
  // boosters of the stock: the luckier the booster, the longer it takes to save up for it.
  boosterTypes: [
    {
      id: 'classic',
      name: 'Booster Classique',
      tagline: 'Pas de chance, mais tout de suite.',
      cost: 1,
      ...boosterWeights(dropRates.classic),
    },
    {
      id: 'nicotine',
      name: 'Boost de nicotine',
      tagline: 'L’équilibré : bien plus de chance.',
      cost: 2,
      ...boosterWeights(dropRates.nicotine),
    },
    {
      id: 'dopamine',
      name: 'Dopamine maxing',
      tagline: 'Presque plus de normales ni de glitch.',
      cost: 3,
      ...boosterWeights(dropRates.dopamine),
    },
  ],
  defaultBoosterType: 'classic',

  // One booster every 4 hours, up to 3 in stock (enough for a Dopamine maxing).
  // A new player starts full.
  regen: { intervalMs: 4 * HOUR, maxStock: 3, initialStock: 3 },

  // Fusions draw with the balanced booster's rules (as before the three boosters).
  recycle: { inputCount: 3, boosterType: 'nicotine' },
};
