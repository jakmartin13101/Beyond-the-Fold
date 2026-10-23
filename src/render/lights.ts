// Dynamic light pool. A fixed number of point lights (so shaders never recompile) are
// assigned each frame to the most important requests: muzzle flashes, plasma bolts,
// explosions, fires and hazards. Energy weapons therefore cast coloured light on paper.
import * as THREE from 'three';

export interface LightRequest {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

interface TimedLight extends LightRequest {
  life: number;
  age: number;
  i0: number;
}

export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private requests: LightRequest[] = [];
  private timed: TimedLight[] = [];
  focusX = 0;
  focusY = 0;

  constructor(scene: THREE.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** A light that exists for this frame only. */
  push(r: LightRequest): void {
    this.requests.push(r);
  }

  /** A flash that fades out over `life` seconds. */
  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, life: number): void {
    this.timed.push({ x, y, z, color, intensity, distance, life, age: 0, i0: intensity });
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.timed.length; i++) {
      const t = this.timed[i];
      t.age += dt;
      if (t.age >= t.life) continue;
      const k = 1 - t.age / t.life;
      t.intensity = t.i0 * k * k;
      this.requests.push(t);
      this.timed[w++] = t;
    }
    this.timed.length = w;

    const fx = this.focusX;
    const fy = this.focusY;
    // Score by brightness and closeness to the camera focus.
    const reqs = this.requests;
    reqs.sort((a, b) => score(b, fx, fy) - score(a, fx, fy));
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = reqs[i];
      if (r && score(r, fx, fy) > 0.02) {
        l.position.set(r.x, r.y, r.z + 0.6);
        l.color.setHex(r.color);
        l.intensity = r.intensity;
        l.distance = r.distance;
        l.visible = true;
      } else {
        l.intensity = 0;
      }
    }
    this.requests.length = 0;
  }

  clear(): void {
    this.timed.length = 0;
    this.requests.length = 0;
    for (const l of this.lights) l.intensity = 0;
  }
}

function score(r: LightRequest, fx: number, fy: number): number {
  const d = Math.abs(r.x - fx) + Math.abs(r.y - fy) * 0.5;
  if (d > 30) return 0;
  return r.intensity * r.distance * (1 / (1 + d * 0.15));
}
