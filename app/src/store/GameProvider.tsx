import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { SaveState } from '../domain/types.ts';
import type { GameStore } from './gameStore.ts';

const GameContext = createContext<GameStore | null>(null);

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameContext.Provider value={store}>{children}</GameContext.Provider>;
}

export function useGame(): GameStore {
  const store = useContext(GameContext);
  if (!store) throw new Error('useGame must be used inside <GameProvider>');
  return store;
}

/** Subscribes to the save state. Selectors must return stable references (state slices). */
export function useGameState<T>(selector: (state: SaveState) => T): T {
  const store = useGame();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function useSaveError(): boolean {
  const store = useGame();
  return useSyncExternalStore(store.subscribe, store.hasSaveError);
}
