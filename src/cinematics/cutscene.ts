// Lightweight in-engine cutscene sequencer: timed events, per-frame tracks and eased
// camera moves. Every cutscene provides a skip handler that jumps to its end state.
import * as THREE from 'three';
import { clamp, easeInOutCubic } from '../core/math';
import type { CinematicShot } from '../render/camera';

export interface Shot {
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

interface TimedEvent {
  at: number;
  fn: () => void;
  fired: boolean;
}

interface Track {
  t0: number;
  t1: number;
  fn: (k: number, dt: number) => void;
}

export class Cutscene {
  t = 0;
  done = false;
  private events: TimedEvent[] = [];
  private tracks: Track[] = [];
  private cams: Array<{ t0: number; t1: number; a: Shot; b: Shot; ease: (k: number) => number }> = [];
  private skipFn: (() => void) | null = null;
  private endFn: (() => void) | null = null;
  readonly shot: CinematicShot = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 36 };
  hasCamera = false;
  length = 0;

  constructor(readonly id: string) {}

  at(t: number, fn: () => void): this {
    this.events.push({ at: t, fn, fired: false });
    this.length = Math.max(this.length, t);
    return this;
  }

  during(t0: number, t1: number, fn: (k: number, dt: number) => void): this {
    this.tracks.push({ t0, t1, fn });
    this.length = Math.max(this.length, t1);
    return this;
  }

  camera(t0: number, t1: number, a: Shot, b: Shot = a, ease: (k: number) => number = easeInOutCubic): this {
    this.cams.push({ t0, t1, a, b, ease });
    this.length = Math.max(this.length, t1);
    return this;
  }

  onSkip(fn: () => void): this {
    this.skipFn = fn;
    return this;
  }

  onEnd(fn: () => void): this {
    this.endFn = fn;
    return this;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    for (const e of this.events) {
      if (!e.fired && this.t >= e.at) {
        e.fired = true;
        e.fn();
      }
    }
    for (const tr of this.tracks) {
      if (this.t >= tr.t0 && this.t <= tr.t1 + dt) tr.fn(clamp((this.t - tr.t0) / Math.max(1e-3, tr.t1 - tr.t0), 0, 1), dt);
    }
    let cam = null;
    for (const c of this.cams) if (this.t >= c.t0) cam = c;
    if (cam) {
      const k = cam.ease(clamp((this.t - cam.t0) / Math.max(1e-3, cam.t1 - cam.t0), 0, 1));
      this.shot.pos.set(...cam.a.pos).lerp(tmp.set(...cam.b.pos), k);
      this.shot.target.set(...cam.a.target).lerp(tmp.set(...cam.b.target), k);
      this.shot.fov = (cam.a.fov ?? 36) + ((cam.b.fov ?? 36) - (cam.a.fov ?? 36)) * k;
      this.hasCamera = true;
    }
    if (this.t >= this.length) this.finish();
  }

  skip(): void {
    if (this.done) return;
    this.skipFn?.();
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.endFn?.();
  }
}

const tmp = new THREE.Vector3();
