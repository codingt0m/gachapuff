let unavailable = false;

/**
 * Whether WebGL is worth trying. No throwaway probe context (it cost a context creation):
 * true until a real renderer failed to get one, then the CSS fallback is used directly.
 */
export function webglAvailable(): boolean {
  return !unavailable;
}

/** Called when creating a WebGL context failed: later stages go straight to the fallback. */
export function markWebglUnavailable(): void {
  unavailable = true;
}

/** Stable numeric seed from a string (FNV-1a), in [0, 1000). */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100_000) / 100;
}
