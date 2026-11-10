import { applyRegen } from '../domain/boosters.ts';
import { openBooster, recycle, rescoreCollection, type GameContext } from '../domain/game.ts';
import { rarityForPoints, rarityPoints } from '../domain/rarity.ts';
import { createInitialState } from '../domain/save.ts';
import type { Rng } from '../domain/rng.ts';
import type { Catalog, GameConfig, PuffInstance, SaveState, Settings } from '../domain/types.ts';
import type { SaveStore } from '../data/persistence.ts';
import { exportFileName, exportSave, importSave } from '../data/saveFile.ts';

export interface GameStoreOptions {
  config: GameConfig;
  catalog: Catalog;
  saveStore: SaveStore;
  initialState: SaveState;
  rng: Rng;
  newId: () => string;
  clock?: () => number;
  unlimitedBoosters?: boolean;
  dev?: boolean;
}

type Listener = () => void;

/**
 * Longest wait before a change is written. Writing clones the whole save synchronously
 * (≈ 6 ms for 3 000 copies on a fast CPU, 4× that on a phone): done right in the tap on
 * "Ouvrir", it delayed the opening's first frames. Writes now wait for an idle moment
 * (consecutive changes are coalesced) and are forced when the page is hidden.
 */
const SAVE_IDLE_TIMEOUT = 1000;

/**
 * Glue between the pure domain, persistence and the UI.
 * Holds the current SaveState, applies domain transitions and saves after each one.
 */
export class GameStore {
  readonly config: GameConfig;
  readonly catalog: Catalog;
  readonly dev: boolean;
  readonly unlimitedBoosters: boolean;
  readonly storageKind: SaveStore['kind'];
  private state: SaveState;
  private readonly listeners = new Set<Listener>();
  private readonly saveStore: SaveStore;
  private readonly rng: Rng;
  private readonly newId: () => string;
  private readonly clock: () => number;
  private saving: Promise<void> = Promise.resolve();
  private saveFailed = false;
  /** State waiting to be written (latest one only), and its scheduled write. */
  private unsaved: SaveState | null = null;
  private cancelScheduled: (() => void) | null = null;

  constructor(o: GameStoreOptions) {
    this.config = o.config;
    this.catalog = o.catalog;
    this.saveStore = o.saveStore;
    this.storageKind = o.saveStore.kind;
    this.rng = o.rng;
    this.newId = o.newId;
    this.clock = o.clock ?? Date.now;
    this.unlimitedBoosters = o.unlimitedBoosters ?? false;
    this.dev = o.dev ?? false;
    this.state = o.initialState;
    if (typeof document !== 'undefined') {
      // Leaving / backgrounding the page: write now, the idle moment may never come.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.writeNow();
      });
      window.addEventListener('pagehide', () => this.writeNow());
    }
  }

  getState = (): SaveState => this.state;

  /** True when the last write to storage failed (shown as a warning). */
  hasSaveError = (): boolean => this.saveFailed;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  now(): number {
    return this.clock();
  }

  /** Credits regenerated boosters; cheap, called by the countdown every second. */
  refreshBoosters(): void {
    const boosters = applyRegen(this.state.boosters, this.clock(), this.config.regen);
    if (boosters.stock !== this.state.boosters.stock) this.commit({ ...this.state, boosters });
  }

  openBooster(typeId?: string): PuffInstance {
    const pull = openBooster(this.state, this.context(), typeId);
    this.commit(pull.state);
    return pull.instance;
  }

  recycle(uids: readonly string[]): PuffInstance {
    const pull = recycle(this.state, uids, this.context());
    this.commit(pull.state);
    return pull.instance;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.commit({ ...this.state, settings: { ...this.state.settings, ...patch } });
  }

  /** Dev: adds one plain copy of every puff not owned yet, so the album shows the whole catalog. */
  devFillAlbum(): number {
    const owned = new Set(this.state.collection.map((p) => p.puffId));
    const now = this.clock();
    const added: PuffInstance[] = this.catalog.puffs
      .filter((p) => !owned.has(p.id))
      .map((p) => {
        const points = rarityPoints(
          this.config,
          this.catalog.baseTierOf.get(p.id) ?? 0,
          'normal',
          'white',
        );
        return {
          uid: this.newId(),
          puffId: p.id,
          finish: 'normal',
          smoke: { kind: 'white' },
          engraving: { kind: 'none' },
          rarity: rarityForPoints(this.config, points).id,
          points,
          obtainedAt: now,
          origin: 'booster',
        };
      });
    if (added.length > 0) {
      this.commit({ ...this.state, collection: [...this.state.collection, ...added] });
    }
    return added.length;
  }

  /** Wipes the collection, keeping the player's settings. */
  reset(): void {
    const fresh = createInitialState(this.clock(), this.config);
    this.commit({ ...fresh, settings: this.state.settings });
  }

  exportSave(): { fileName: string; text: string } {
    const now = this.clock();
    return { fileName: exportFileName(now), text: exportSave(this.state, now) };
  }

  importSave(text: string): { ok: true } | { ok: false; error: string } {
    const result = importSave(text, this.clock(), this.config);
    if ('error' in result) return { ok: false, error: result.error };
    this.commit(rescoreCollection(result.state, this.catalog, this.config));
    return { ok: true };
  }

  /** Writes any pending change now; resolves once every write reached the storage. */
  flush(): Promise<void> {
    this.writeNow();
    return this.saving;
  }

  private context(): GameContext {
    return {
      config: this.config,
      catalog: this.catalog,
      rng: this.rng,
      now: this.clock(),
      newId: this.newId,
      unlimitedBoosters: this.unlimitedBoosters,
    };
  }

  private commit(next: SaveState): void {
    this.state = next;
    this.listeners.forEach((l) => l());
    this.unsaved = next;
    this.cancelScheduled ??= scheduleIdle(() => this.writeNow());
  }

  private writeNow(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
    const next = this.unsaved;
    if (!next) return;
    this.unsaved = null;
    // Writes are chained so they reach the storage in order.
    this.saving = this.saving
      .then(() => this.saveStore.save(next))
      .then(
        () => this.setSaveFailed(false),
        (error: unknown) => {
          console.error('Save failed', error);
          this.setSaveFailed(true);
        },
      );
  }

  private setSaveFailed(failed: boolean): void {
    if (failed === this.saveFailed) return;
    this.saveFailed = failed;
    this.listeners.forEach((l) => l());
  }
}

/** Runs `fn` when the browser is idle (at most SAVE_IDLE_TIMEOUT ms later); returns a canceller. */
function scheduleIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: SAVE_IDLE_TIMEOUT });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
