import { haptic } from '../effects/haptics.ts';
import { sound } from '../effects/sound.ts';

/** Sound + vibration pairs used across the UI, so the same action always feels the same. */
const FEEDBACK = {
  tap: () => {
    sound.play('tap');
    haptic('tap');
  },
  toggle: () => {
    sound.play('pop');
    haptic('tap');
  },
  tick: () => {
    sound.play('tick');
    haptic('tick');
  },
  success: () => {
    sound.play('coin');
    haptic('success');
  },
  error: () => {
    sound.play('error');
    haptic('error');
  },
} as const;

export type FeedbackId = keyof typeof FEEDBACK;

export function feedback(id: FeedbackId): void {
  FEEDBACK[id]();
}
