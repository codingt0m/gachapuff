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
  /** Turntable idle (presentation): share of maxAngle swept and period (ms). */
  turntableAmplitude: 0.95,
  turntablePeriod: 9000,
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
  /** Volume: the silhouette inflated into a relief, plus a side wall behind it. */
  volume: {
    /** Height-field resolution (texels per side). */
    fieldSize: 256,
    /** Grid cells per side of the displaced mesh. */
    gridCells: 128,
    /** Relief depth factor (1 = a fully round puff is as deep as it is wide). */
    depth: 0.665,
    /** Bbox width / height below which a puff is "slim" (cylinder), above which "wide" (box). */
    slimAspect: 0.3,
    wideAspect: 0.5,
    /** Edge roundness: slim -> wide (1 = fully round, lower = flat face). */
    roundness: [1, 0.4],
    /** Side wall depth, share of the silhouette width: slim -> wide. */
    thickness: [0.175, 0.315],
    /** Spacing of the stacked silhouettes forming the side wall, in units. */
    layerStep: 0.006,
    maxLayers: 40,
    mobileMaxLayers: 24,
  },
} as const;

/**
 * Smoke particles. Sizes are in puff-square units (1 = the puff image size),
 * rates in particles per second, times in seconds.
 */
export const smoke = {
  /** Room for the normal plume (~50 alive) plus a held cloud. */
  maxParticles: 200,
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
  /** Sideways push when the puff tilts (puff units per second per radian). */
  wind: 0.9,
  /** Rings / hearts / stars: share of the exhale cloud kept besides the shaped puff. */
  shapeBurstShare: 0.1,
  /** Start / end size of each shaped puff. */
  ringSize: [0.05, 0.3],
  heartSize: [0.04, 0.24],
  starSize: [0.045, 0.26],
  /** Spiral: turn speed (rad/s), orbit radius growth (units/s), stream / cloud / size factors. */
  spiral: { spin: 2.6, radius: 0.075, trickleBoost: 2.4, burstShare: 0.25, sizeScale: 0.45 },
  opacity: 0.6,
  /** Emission multiplier with reduced motion. */
  reducedRate: 0.5,
  /**
   * Press and hold on the puff: a big cloud billows out of the mouthpiece, hangs above it
   * and swells, then drifts up and fades once released.
   */
  hold: {
    /** Seconds to reach full output once pressed / to stop once released. */
    rampUp: 0.3,
    rampDown: 0.45,
    /** Particles per second at full output. */
    rate: 32,
    life: [3, 4.6],
    startSize: 0.06,
    endSize: [0.32, 0.6],
    /** Half-angle of the emission cone around the vertical (rad). */
    cone: 1.1,
    /** How far the cloud billows out before slowing, share of the headroom. */
    reach: 0.55,
    /** How fast billowing particles slow down (1/s). */
    drag: 1.6,
    /** Slow rise afterwards: share of the headroom climbed over a particle's life. */
    lift: 0.4,
    opacity: 0.42,
  },
} as const;
