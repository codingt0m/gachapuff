/**
 * Domain types, defined once and shared by every layer.
 * The domain is pure: no React, no browser API, no persistence.
 */

// ---------------------------------------------------------------- catalog ---

/** A collectible puff (model x flavour), as described by the generated asset manifest. */
export interface PuffDefinition {
  /** Stable id: "<model-slug>--<flavor-slug>". */
  id: string;
  model: string;
  modelSlug: string;
  flavor: string;
  /** Capacity in puffs parsed from the model name, null when the name has none. */
  puffs: number | null;
  images: { thumb: string; detail: string };
  quality: { integrity: number; resolution: number };
  /** Dominant colour of the puff (#rrggbb). */
  color: string;
  /** Mouthpiece position in the image, normalised to [0, 1]. */
  nozzle: { x: number; y: number };
  /** Opaque bounding box in the image, normalised to [0, 1]. */
  bbox: { x: number; y: number; w: number; h: number };
}

/** The playable catalog: definitions plus derived lookups. */
export interface Catalog {
  puffs: readonly PuffDefinition[];
  byId: ReadonlyMap<string, PuffDefinition>;
  /** Base tier index of each puff id. */
  baseTierOf: ReadonlyMap<string, number>;
  /** Puffs grouped by base tier index. */
  byBaseTier: readonly (readonly PuffDefinition[])[];
  /** Model names in display order. */
  models: readonly string[];
}

// ----------------------------------------------------------------- axes ---

export const FINISH_IDS = ['normal', 'shiny', 'golden', 'chromatic', 'crystal', 'cosmic'] as const;
export type FinishId = (typeof FINISH_IDS)[number];

export const SMOKE_KINDS = ['white', 'solid', 'gradient'] as const;
export type SmokeKind = (typeof SMOKE_KINDS)[number];

export type Smoke =
  { kind: 'white' } | { kind: 'solid'; color: string } | { kind: 'gradient'; colors: string[] };

export const RARITY_IDS = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
  'divine',
] as const;
export type RarityId = (typeof RARITY_IDS)[number];

export type RarityIcon =
  'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'crown';

// --------------------------------------------------------------- config ---

export interface BaseTierDef {
  name: string;
  /** Lowest capacity (in puffs) belonging to this tier. */
  minPuffs: number;
  points: number;
}

export interface FinishDef {
  id: FinishId;
  name: string;
  description: string;
  points: number;
}

export interface SmokeDef {
  kind: SmokeKind;
  name: string;
  points: number;
  /** Number of colours drawn at opening time (white smoke: 0). */
  colorCount: { min: number; max: number };
}

/** How dramatic the reveal of a tier is. Times in ms. */
export interface RevealChoreography {
  /** Build-up between tearing the pack and showing the puff. */
  suspenseMs: number;
  /** How many tier colours the glow climbs through before settling (hint). */
  hintSteps: number;
  flash: boolean;
  rays: boolean;
  /** Screen shake amplitude in px (0 = none). */
  shakePx: number;
  confetti: number;
  /** Time-stretch factor applied to the final zoom (1 = normal). */
  slowMotion: number;
}

export interface RarityTier {
  id: RarityId;
  name: string;
  /** Minimum rarity points to reach this tier. */
  minPoints: number;
  color: string;
  /** Text colour readable on `color` (WCAG AA). */
  ink: string;
  icon: RarityIcon;
  reveal: RevealChoreography;
}

/** A booster type = a drop table. Weights are relative (they need not sum to 1). */
export interface BoosterType {
  id: string;
  name: string;
  /** Weight of each base tier, indexed like `baseTiers.tiers`. */
  baseTierWeights: number[];
  finishWeights: Record<FinishId, number>;
  smokeWeights: Record<SmokeKind, number>;
}

export interface GameConfig {
  catalog: { excludedModels: string[] };
  baseTiers: {
    tiers: BaseTierDef[];
    /** Tier of models whose name carries no capacity ("Cruiser", "Slim Bar"...). */
    unknownCapacityTier: number;
    /** Manual override: model name -> base tier index. */
    modelOverrides: Record<string, number>;
  };
  finishes: FinishDef[];
  smokes: SmokeDef[];
  smokeColor: { saturation: [number, number]; lightness: [number, number] };
  rarities: RarityTier[];
  boosterTypes: BoosterType[];
  defaultBoosterType: string;
  regen: { intervalMs: number; maxStock: number; initialStock: number };
  recycle: { inputCount: number; boosterType: string };
}

// ---------------------------------------------------------------- state ---

/** One owned copy of a puff. Unique uid + stored rarity: ready for future trading. */
export interface PuffInstance {
  uid: string;
  puffId: string;
  finish: FinishId;
  smoke: Smoke;
  rarity: RarityId;
  points: number;
  obtainedAt: number;
  origin: 'booster' | 'recycle';
}

export interface BoosterStock {
  stock: number;
  /** Start of the current regeneration period (epoch ms). */
  lastRegenAt: number;
}

export type MotionPreference = 'system' | 'reduced' | 'full';

export interface Settings {
  sound: boolean;
  haptics: boolean;
  motion: MotionPreference;
}

export interface SaveState {
  version: number;
  createdAt: number;
  boosters: BoosterStock;
  collection: PuffInstance[];
  stats: { opened: number; recycled: number };
  settings: Settings;
}
