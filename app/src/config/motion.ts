/**
 * Motion tokens (ms). Injected as CSS variables (--dur-*) by ui/theme.ts so CSS and
 * JS share the same timings. Reveal choreography per rarity lives in gameConfig.ts.
 */
export const motion = {
  instant: 80,
  fast: 140,
  base: 240,
  slow: 420,
  reward: 820,
  /** Count-up of numbers (progress, counters). */
  counter: 900,
  /** Burst from pack/fusion to the revealed puff, before slow-motion stretch. */
  burst: 700,
  /** Time the revealed puff takes to go from white silhouette to full colour. */
  colorFlood: 900,
  /** Flash duration (single flash, well under the 3 flashes/s limit). */
  flash: 380,
  /** Delay between two fusion reel ticks at full speed. */
  reelTick: 70,
  /** Fusion: inputs orbiting before they merge. */
  fusionSpin: 1600,
  /** Toast lifetime. */
  toast: 3200,
} as const;

/** Physical feel of tilting puffs and packs. */
export const tilt = {
  /** Max rotation, radians. */
  maxAngle: 0.38,
  /** Spring stiffness / damping for the tilt follow. */
  stiffness: 90,
  damping: 13,
  /** Idle wobble amplitude (radians) and period (ms) when nobody touches. */
  idleAmplitude: 0.12,
  idlePeriod: 6200,
  /** Inactivity before idle wobble resumes. */
  idleDelay: 1800,
  /** Gyroscope degrees mapped to maxAngle. */
  gyroRange: 25,
} as const;

/** Rendering budget of the WebGL stage. */
export const render = {
  maxPixelRatio: 2,
  /** Lower ratio used on small screens to protect 60 fps. */
  mobilePixelRatio: 1.5,
  mobileBreakpoint: 640,
  /** Puff square height as a share of the stage height (the rest is room for smoke). */
  puffHeight: 0.66,
  /** Max puff square width as a share of the stage width. */
  puffWidth: 0.92,
  /** Gap under the puff, share of the stage height. */
  bottomMargin: 0.03,
  /** Perspective camera distance, in puff half-sizes. */
  camera: 3.2,
  /** Smoke fade-in when a puff appears (ms). */
  smokeFadeIn: 600,
  /** Effect speed when reduced motion is on. */
  reducedSpeed: 0.35,
} as const;

/**
 * Smoke particles. Sizes are in puff-square units (1 = the puff image size),
 * rates in particles per second, times in seconds.
 */
export const smoke = {
  maxParticles: 90,
  life: [2.8, 4.2],
  /** Constant thin stream. */
  trickleRate: 7,
  /** Extra emission at the peak of each exhale. */
  burstRate: 34,
  /** Seconds between two exhales. */
  burstEvery: 3.4,
  startSize: 0.02,
  endSize: [0.2, 0.36],
  /** Sideways wander. */
  drift: 0.06,
  opacity: 0.6,
  /** Emission multiplier with reduced motion. */
  reducedRate: 0.5,
} as const;
