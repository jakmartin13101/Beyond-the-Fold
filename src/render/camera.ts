// Side-scrolling 2.5D camera: smooth follow with aim look-ahead, zone-based framing,
// arena locks, boss framing, trauma shake, recoil kicks and scripted cinematic overrides.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math';
import type { World } from '../game/world';

export interface CinematicShot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const BASE_DIST = 23.5;
const BASE_FOV = 36;

export class CameraController {
  x = 0;
  y = 2;
  zoom = 1;
  private lookX = 0;
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private time = 0;
  shakeScale = 1;
  /** When set, the camera is driven by a cutscene. */
  cinematic: CinematicShot | null = null;
  /** Blend factor from gameplay to cinematic framing (0..1). */
  cineBlend = 0;
  private current = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: BASE_FOV };

  constructor(private camera: THREE.PerspectiveCamera) {}

  snap(world: World): void {
    const p = world.player;
    this.x = p.x;
    this.y = p.y + 1.6;
    this.lookX = 0;
    this.zoom = this.zoneZoom(world);
    this.cineBlend = this.cinematic ? 1 : 0;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  kick(x: number, y: number): void {
    this.kickX += x * this.shakeScale;
    this.kickY += y * this.shakeScale;
  }

  private zoneZoom(world: World): number {
    const p = world.player;
    let z = 1;
    for (const zone of world.level.cameraZones) {
      if (p.x >= zone.x0 && p.x < zone.x1) {
        z = zone.zoom ?? 1;
        break;
      }
    }
    if (world.cameraOverride) z = world.cameraOverride.zoom;
    const boss = world.boss;
    if (boss && boss.active && !boss.dead) {
      // Frame both the player and the walker.
      const span = Math.abs(boss.x - p.x) / 2 + 7;
      z = clamp(span / this.baseHalfWidth(), 1.3, 1.7);
    }
    const w = p.weapon;
    if (w && w.def.zoom) z *= w.def.zoom;
    return z;
  }

  private zoneYOffset(world: World): number {
    const p = world.player;
    for (const zone of world.level.cameraZones) {
      if (p.x >= zone.x0 && p.x < zone.x1) return zone.yOffset ?? 0;
    }
    return 0;
  }

  update(dt: number, world: World | null, alpha: number, aimDir: { x: number; y: number }): void {
    this.time += dt;
    const cam = this.camera;
    if (world) {
      const p = world.player;
      const px = p.px + (p.x - p.px) * alpha;
      const py = p.py + (p.y - p.py) * alpha;
      // Look-ahead toward where the player is aiming.
      const ahead = clamp(aimDir.x, -1, 1) * 5.5 + clamp(p.vx * 0.15, -1.4, 1.4);
      this.lookX = damp(this.lookX, ahead, 2.2, dt);
      let tx = px + this.lookX;
      let ty = py + 1.9 + this.zoneYOffset(world) + clamp(aimDir.y, -1, 1) * 1.2;
      this.zoom = damp(this.zoom, this.zoneZoom(world), 1.6, dt);

      const halfW = this.halfWidth();
      // Arena framing: keep the whole fight readable.
      const lock = world.cameraOverride;
      if (lock) {
        const center = (lock.x0 + lock.x1) / 2;
        const span = lock.x1 - lock.x0;
        if (span <= halfW * 2) tx = center;
        else tx = clamp(tx, lock.x0 + halfW, lock.x1 - halfW);
      }
      const boss = world.boss;
      if (boss && boss.active && !boss.dead) {
        const a = world.level.boss!.arena;
        tx = lerp(px, boss.x, 0.5);
        tx = clamp(tx, a.left + halfW - 3, a.right - halfW + 3);
        ty = Math.max(ty, boss.y + 3.6);
      }
      // Never show past the level bounds.
      const b = world.level.bounds;
      tx = clamp(tx, b.minX + halfW - 4, b.maxX - halfW + 4);

      this.x = damp(this.x, tx, 4.2, dt);
      // Vertical: small dead zone, slower follow when airborne for a calmer frame.
      const dy = ty - this.y;
      const ylambda = p.onGround ? 3.5 : 1.6;
      if (Math.abs(dy) > 0.25 || p.onGround) this.y = damp(this.y, ty, ylambda, dt);
      if (py + 1.7 - this.y < -3.5) this.y = py + 1.7 + 3.5;
    }

    // Trauma-based shake.
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    const t = this.time * 28;
    const sx = (Math.sin(t * 1.13) + Math.sin(t * 2.71) * 0.5) * s * 0.35;
    const sy = (Math.sin(t * 1.71 + 2) + Math.sin(t * 3.1) * 0.5) * s * 0.3;
    const sr = Math.sin(t * 0.93 + 5) * s * 0.012;
    this.kickX = damp(this.kickX, 0, 14, dt);
    this.kickY = damp(this.kickY, 0, 14, dt);

    const dist = BASE_DIST * this.zoom;
    const gameplay = {
      pos: tmpA.set(this.x + sx + this.kickX, this.y + 2.9 * this.zoom + sy + this.kickY, dist),
      target: tmpB.set(this.x + sx * 0.5 + this.kickX, this.y + sy * 0.5 + this.kickY, 0),
      fov: BASE_FOV,
    };

    const blendTarget = this.cinematic ? 1 : 0;
    this.cineBlend = damp(this.cineBlend, blendTarget, 3, dt);
    if (Math.abs(this.cineBlend - blendTarget) < 0.002) this.cineBlend = blendTarget;
    if (this.cinematic && this.cineBlend > 0) {
      const c = this.cinematic;
      const k = this.cineBlend;
      this.current.pos.copy(gameplay.pos).lerp(c.pos, k);
      this.current.target.copy(gameplay.target).lerp(c.target, k);
      this.current.fov = lerp(gameplay.fov, c.fov, k);
      this.current.pos.x += sx;
      this.current.pos.y += sy;
    } else {
      this.current.pos.copy(gameplay.pos);
      this.current.target.copy(gameplay.target);
      this.current.fov = gameplay.fov;
    }
    cam.position.copy(this.current.pos);
    cam.lookAt(this.current.target);
    cam.rotateZ(sr);
    if (Math.abs(cam.fov - this.current.fov) > 0.01) {
      cam.fov = this.current.fov;
      cam.updateProjectionMatrix();
    }
  }

  private baseHalfWidth(): number {
    const h = 2 * BASE_DIST * Math.tan((BASE_FOV * Math.PI) / 360);
    return (h * this.camera.aspect) / 2;
  }

  /** Half the visible width of the gameplay plane at the current zoom. */
  halfWidth(): number {
    const dist = BASE_DIST * this.zoom;
    const h = 2 * dist * Math.tan((BASE_FOV * Math.PI) / 360);
    return (h * this.camera.aspect) / 2;
  }

  get focusX(): number {
    return this.x;
  }
  get focusY(): number {
    return this.y;
  }
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
