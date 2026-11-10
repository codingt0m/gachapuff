/// <reference lib="webworker" />
/** Computes puff reliefs off the main thread (see volumeJobs.ts). */
import { computeVolume, type VolumeInput } from './volumeData.ts';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<{ id: number; input: VolumeInput }>) => {
  const { id, input } = event.data;
  try {
    const data = computeVolume(input);
    self.postMessage({ id, data }, [data.heights.buffer, data.texels.buffer]);
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
