/**
 * Synthesised sound effects (WebAudio, no audio files to download).
 * Silent until the first user gesture (autoplay policy + "muted until interaction").
 */
export type SoundId =
  'tap' | 'tick' | 'tear' | 'charge' | 'whoosh' | 'pop' | 'coin' | 'fuse' | 'error';

interface Voice {
  type: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
}

/** Major pentatonic steps used by risers and reveal arpeggios (semitones). */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const BASE_HZ = 392; // G4
const MASTER_GAIN = 0.35;
const semitone = (n: number) => BASE_HZ * 2 ** (n / 12);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Call from a user gesture: creates / resumes the audio context. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    // iOS can leave the context "interrupted" (after a call, backgrounding...), not just "suspended".
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      // WebKit only fully unlocks once a source actually starts inside the gesture.
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      src.connect(this.ctx.destination);
      src.start(0);
    }
  }

  play(id: SoundId): void {
    const ctx = this.ready();
    if (!ctx) return;
    switch (id) {
      case 'tap':
        return this.voices(ctx, [{ type: 'square', from: 880, to: 660, dur: 0.05, gain: 0.12 }]);
      case 'tick':
        return this.voices(ctx, [{ type: 'triangle', from: 1760, dur: 0.03, gain: 0.12 }]);
      case 'tear':
        return this.noise(ctx, { dur: 0.32, from: 600, to: 5000, q: 0.8, gain: 0.6 });
      case 'charge':
        return this.noise(ctx, { dur: 0.25, from: 120, to: 300, q: 3, gain: 0.35 });
      case 'whoosh':
        return this.noise(ctx, { dur: 0.45, from: 300, to: 2400, q: 1.2, gain: 0.45 });
      case 'pop':
        return this.voices(ctx, [{ type: 'sine', from: 900, to: 240, dur: 0.12, gain: 0.4 }]);
      case 'coin':
        return this.voices(ctx, [
          { type: 'square', from: 988, dur: 0.08, gain: 0.12 },
          { type: 'square', from: 1319, at: 0.08, dur: 0.28, gain: 0.12 },
        ]);
      case 'fuse':
        this.noise(ctx, { dur: 1.2, from: 80, to: 1200, q: 4, gain: 0.4 });
        return this.voices(ctx, [{ type: 'sawtooth', from: 60, to: 240, dur: 1.2, gain: 0.08 }]);
      case 'error':
        return this.voices(ctx, [
          { type: 'square', from: 180, dur: 0.09, gain: 0.12 },
          { type: 'square', from: 140, at: 0.11, dur: 0.14, gain: 0.12 },
        ]);
    }
  }

  /** One step of the rising hint before a reveal; higher steps sound higher. */
  riser(step: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const note = semitone(SCALE[Math.min(step * 2, SCALE.length - 1)] ?? 0);
    this.voices(ctx, [
      { type: 'triangle', from: note, to: note * 1.02, dur: 0.22, gain: 0.18 },
      { type: 'sine', from: note * 2, dur: 0.18, gain: 0.06 },
    ]);
  }

  /** Reveal fanfare: richer and higher for rarer tiers. */
  reveal(tierIndex: number, tierCount: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = 2 + tierIndex;
    const step = tierIndex >= tierCount - 2 ? 0.07 : 0.09;
    const voices: Voice[] = [];
    for (let i = 0; i < notes; i++) {
      const f = semitone(SCALE[Math.min(i + tierIndex, SCALE.length - 1)] ?? 0);
      voices.push({ type: 'triangle', from: f, at: i * step, dur: 0.35, gain: 0.16 });
      if (tierIndex >= 3)
        voices.push({ type: 'square', from: f * 2, at: i * step, dur: 0.12, gain: 0.04 });
    }
    const end = notes * step;
    const root = semitone(SCALE[tierIndex] ?? 0);
    voices.push({
      type: 'sawtooth',
      from: root / 2,
      at: end,
      dur: 0.6 + tierIndex * 0.15,
      gain: 0.06,
    });
    voices.push({ type: 'triangle', from: root, at: end, dur: 0.6 + tierIndex * 0.15, gain: 0.14 });
    if (tierIndex >= 4)
      this.noise(ctx, { dur: 1.2, from: 4000, to: 9000, q: 0.5, gain: 0.12, at: end });
    this.voices(ctx, voices);
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private voices(ctx: AudioContext, voices: Voice[]): void {
    const t0 = ctx.currentTime;
    for (const v of voices) {
      const start = t0 + (v.at ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.from, start);
      if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, start + v.dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(v.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + v.dur);
      osc.connect(gain).connect(this.master as GainNode);
      osc.start(start);
      osc.stop(start + v.dur + 0.02);
    }
  }

  private noise(
    ctx: AudioContext,
    o: { dur: number; from: number; to: number; q: number; gain: number; at?: number },
  ): void {
    if (!this.noiseBuffer) {
      const length = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const start = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = o.q;
    filter.frequency.setValueAtTime(o.from, start);
    filter.frequency.exponentialRampToValueAtTime(o.to, start + o.dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(o.gain, start + o.dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
    src
      .connect(filter)
      .connect(gain)
      .connect(this.master as GainNode);
    src.start(start);
    src.stop(start + o.dur + 0.02);
  }
}

export const sound = new SoundEngine();
