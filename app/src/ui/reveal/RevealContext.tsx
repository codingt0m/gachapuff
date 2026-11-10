import { createContext, useContext } from 'react';
import type { PuffInstance } from '../../domain/types.ts';

/** A reveal to play: after opening a booster, or after a recycling fusion. */
export type RevealRequest =
  | { intro: 'pack'; instance: PuffInstance; boosterType: string }
  | { intro: 'fusion'; instance: PuffInstance; inputs: PuffInstance[] };

export const RevealContext = createContext<(request: RevealRequest) => void>(() => undefined);

export function useStartReveal() {
  return useContext(RevealContext);
}
