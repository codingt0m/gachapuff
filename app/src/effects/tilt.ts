import { tilt as T } from '../config/motion.ts';

export interface Tilt {
  x: number;
  y: number;
}

/**
 * Turns pointer / touch / gyroscope input into a springy tilt.
 * Without input, the object idles with a slow wobble (unless reduced motion).
 */
export class TiltController {
  value: Tilt = { x: 0, y: 0 };
  reducedMotion = false;
  /** Idle presentation mode: wide slow turn instead of the small wobble. */
  turntable = false;
  private target: Tilt = { x: 0, y: 0 };
  private velocity: Tilt = { x: 0, y: 0 };
  private lastInput = -Infinity;
  private clock = 0;
  private gyroBase: { beta: number; gamma: number } | null = null;
  private element: HTMLElement | null = null;

  attach(element: HTMLElement): () => void {
    this.element = element;
    element.addEventListener('pointermove', this.onPointer);
    element.addEventListener('pointerdown', this.onPointer);
    element.addEventListener('pointerleave', this.onLeave);
    element.addEventListener('pointercancel', this.onLeave);
    return () => {
      element.removeEventListener('pointermove', this.onPointer);
      element.removeEventListener('pointerdown', this.onPointer);
      element.removeEventListener('pointerleave', this.onLeave);
      element.removeEventListener('pointercancel', this.onLeave);
      this.disableGyro();
      this.element = null;
    };
  }

  /** Listens to the device orientation (permission must already be granted on iOS). */
  enableGyro(): void {
    this.gyroBase = null;
    window.addEventListener('deviceorientation', this.onOrientation);
  }

  disableGyro(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
  }

  /** Advances the spring by dt seconds. */
  update(dt: number): Tilt {
    this.clock += dt * 1000;
    const idle = this.clock - this.lastInput > T.idleDelay;
    if (idle && this.turntable && !this.reducedMotion) {
      // Presentation: a wide, slow side-to-side turn, as on a rotating display stand.
      const phase = (this.clock / T.turntablePeriod) * Math.PI * 2;
      const amp = T.maxAngle * T.turntableAmplitude;
      this.target = { x: Math.sin(phase) * amp, y: Math.sin(phase * 2) * amp * 0.12 };
    } else if (idle) {
      const amp = this.reducedMotion ? 0 : T.idleAmplitude;
      const phase = (this.clock / T.idlePeriod) * Math.PI * 2;
      this.target = { x: Math.sin(phase) * amp, y: Math.sin(phase * 0.7 + 1) * amp * 0.6 };
    }
    for (const axis of ['x', 'y'] as const) {
      const force = (this.target[axis] - this.value[axis]) * T.stiffness;
      this.velocity[axis] += (force - this.velocity[axis] * T.damping) * dt;
      this.value[axis] += this.velocity[axis] * dt;
    }
    return this.value;
  }

  private setTarget(x: number, y: number): void {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const max = this.reducedMotion ? T.maxAngle * 0.5 : T.maxAngle;
    this.target = { x: clamp(x) * max, y: clamp(y) * max };
    this.lastInput = this.clock;
  }

  private onPointer = (event: PointerEvent) => {
    const rect = this.element?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.setTarget(nx, ny);
  };

  private onLeave = () => {
    this.lastInput = this.clock - T.idleDelay / 2;
    this.target = { x: 0, y: 0 };
  };

  private onOrientation = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    this.gyroBase ??= { beta: event.beta, gamma: event.gamma };
    this.setTarget(
      (event.gamma - this.gyroBase.gamma) / T.gyroRange,
      (event.beta - this.gyroBase.beta) / T.gyroRange,
    );
  };
}

type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export function gyroSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** iOS needs an explicit permission, requested from a user gesture. */
export function gyroNeedsPermission(): boolean {
  return (
    gyroSupported() &&
    typeof (DeviceOrientationEvent as OrientationWithPermission).requestPermission === 'function'
  );
}

export async function requestGyroPermission(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as OrientationWithPermission;
  if (typeof ctor.requestPermission !== 'function') return true;
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
