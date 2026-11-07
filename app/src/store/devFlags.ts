/**
 * Dev switches, read once at start-up:
 *   ?dev=1      unlimited boosters + dev tools in the settings
 *   ?seed=123   deterministic draws (tests, demos)
 * VITE_DEV_UNLIMITED=1 in .env.local enables unlimited boosters too.
 */
export interface DevFlags {
  dev: boolean;
  seed: number | null;
}

export function readDevFlags(search = globalThis.location?.search ?? ''): DevFlags {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  return {
    dev: params.get('dev') === '1' || import.meta.env.VITE_DEV_UNLIMITED === '1',
    seed: seed !== null && Number.isFinite(Number(seed)) ? Number(seed) : null,
  };
}

/** Random id; works outside secure contexts too (phone testing over LAN http). */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
