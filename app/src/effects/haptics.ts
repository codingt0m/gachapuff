/** Vibration patterns (ms). Silently ignored where navigator.vibrate does not exist (iOS). */
const PATTERNS = {
  tap: [8],
  tick: [4],
  tear: [18, 30, 12],
  error: [30, 40, 30],
  success: [12, 40, 24],
} as const;

export type HapticId = keyof typeof PATTERNS;

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function vibrate(pattern: number | readonly number[]): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(pattern as number[]);
  } catch {
    // Some browsers throw when called without user activation: nothing to do.
  }
}

export function haptic(id: HapticId): void {
  vibrate(PATTERNS[id]);
}

/** Reveal rumble, longer for rarer tiers. */
export function hapticReveal(tierIndex: number): void {
  const pattern: number[] = [];
  for (let i = 0; i <= tierIndex; i++) pattern.push(20 + i * 12, 30);
  vibrate(pattern);
}
