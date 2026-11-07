/**
 * Where the save lives. The game only knows this interface, so a server-backed
 * implementation can replace IndexedDB later without touching the screens.
 */
export interface SaveStore {
  /** Raw stored data (validated by the caller), or undefined when nothing is saved. */
  load(): Promise<unknown>;
  save(state: unknown): Promise<void>;
  clear(): Promise<void>;
  /** Human-readable backend name, shown in the settings. */
  readonly kind: 'indexeddb' | 'memory';
}

/** In-memory store: tests, and fallback when IndexedDB is unavailable (private mode...). */
export function createMemoryStore(initial?: unknown): SaveStore {
  let data: unknown = initial === undefined ? undefined : structuredClone(initial);
  return {
    kind: 'memory',
    load: async () => (data === undefined ? undefined : structuredClone(data)),
    save: async (state) => {
      data = structuredClone(state);
    },
    clear: async () => {
      data = undefined;
    },
  };
}
