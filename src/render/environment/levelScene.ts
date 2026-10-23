// Static level presentation: backdrop + terrain + decor, plus ambient life (fire, smoke,
// fireflies, drifting paper, swaying plants) and foreground occlusion fading.
import * as THREE from 'three';
import { rand } from '../../core/math';
import type { LevelData } from '../../game/types';
import type { Renderer } from '../renderer';
import { batchStatic } from '../batch';
import { Shape } from '../particles';
import { Backdrop, buildBackdrop } from './backdrop';
import { DecorInstance, buildDecor } from './decor';
import { buildTerrain } from './terrain';

export class LevelScene {
  readonly group = new THREE.Group();
  readonly backdrop: Backdrop;
  private decor: DecorInstance[] = [];
  private emitT = 0;
  private time = 0;
  private particleScale = 1;

  constructor(
    private level: LevelData,
    private r: Renderer,
  ) {
    this.backdrop = buildBackdrop(level, r.scene);
    this.group.add(this.backdrop.group);
    // Static world geometry is merged into a few large batches to keep draw calls low.
    const statics = new THREE.Group();
    statics.add(buildTerrain(level));
    for (const d of level.decor) {
      const inst = buildDecor(d);
      this.decor.push(inst);
      if (d.foreground) {
        this.group.add(inst.obj);
        if (inst.sway) inst.obj.userData.baseRot = inst.obj.rotation.z;
      } else {
        statics.add(inst.obj);
        inst.sway = 0;
      }
    }
    this.group.add(batchStatic(statics));
    this.group.add(batchStatic(this.backdrop.group, 120));
    const th = level.theme;
    r.hemi.color.setHex(th.hemiSky);
    r.hemi.groundColor.setHex(th.hemiGround);
    r.sun.color.setHex(th.sun);
    r.scene.add(this.group);
  }

  setParticleScale(s: number): void {
    this.particleScale = s;
  }

  update(dt: number, camX: number, camY: number, playerX: number, playerY: number, halfW: number): void {
    this.time += dt;
    const t = this.time;
    this.backdrop.update(camX, camY, t);
    this.emitT += dt;
    const emit = this.emitT > 1 / 30;
    if (emit) this.emitT = 0;
    const lp = this.r.lightPool;
    const add = this.r.additive;
    const alpha = this.r.alpha;
    const ps = this.particleScale;

    for (const d of this.decor) {
      const o = d.obj;
      const dx = Math.abs(d.def.x - camX);
      const near = dx < halfW + 25;
      if (d.sway && near) {
        o.rotation.z = (o.userData.baseRot as number) + Math.sin(t * 1.2 + d.def.x * 0.7) * d.sway;
      }
      if (d.light && near) {
        const f = 1 + (Math.sin(t * 13 + d.def.x) * 0.5 + Math.sin(t * 7.3 + d.def.z) * 0.5) * d.light.flicker;
        lp.push({ x: d.def.x, y: d.def.y + d.light.y, z: d.def.z + 0.8, color: d.light.color, intensity: d.light.intensity * f, distance: d.light.distance });
      }
      if (d.emitter && emit && near) {
        const s = d.def.scale ?? 1;
        if (d.emitter === 'fire') {
          for (let i = 0; i < Math.ceil(2 * ps); i++) {
            add.spawn({
              x: d.def.x + rand(-0.5, 0.5) * s,
              y: d.def.y + rand(0, 0.3),
              z: d.def.z + rand(-0.3, 0.3),
              vx: rand(-0.3, 0.3),
              vy: rand(1.5, 3) * s,
              life: rand(0.5, 0.9),
              size0: rand(0.5, 0.9) * s,
              size1: 0.1,
              r: 1.8,
              g: 0.9,
              b: 0.3,
              r1: 1.2,
              g1: 0.2,
              b1: 0.05,
              a0: 0.9,
              a1: 0,
              shape: Shape.Glow,
            });
          }
          if (Math.random() < 0.35 * ps) {
            add.spawn({
              x: d.def.x + rand(-0.4, 0.4),
              y: d.def.y + 0.5,
              z: d.def.z,
              vx: rand(-0.6, 0.6),
              vy: rand(2, 4),
              ax: rand(-0.5, 0.5),
              life: rand(1, 2),
              size0: 0.06,
              size1: 0.02,
              r: 2,
              g: 1,
              b: 0.4,
              a0: 1,
              a1: 0,
              shape: Shape.Glow,
            });
          }
        } else if (Math.random() < 0.5 * ps) {
          alpha.spawn({
            x: d.def.x + rand(-0.6, 0.6),
            y: d.def.y + rand(0, 0.5),
            z: d.def.z,
            vx: rand(0.2, 0.7),
            vy: rand(0.8, 1.6),
            life: rand(4, 6),
            size0: rand(0.8, 1.2) * s,
            size1: rand(3, 4.5) * s,
            r: 0.18,
            g: 0.14,
            b: 0.2,
            a0: 0.5,
            a1: 0,
            rot: rand(0, 6),
            vrot: rand(-0.3, 0.3),
            shape: Shape.Smoke,
          });
        }
      }
      if (d.fade) {
        // Fade foreground pieces that cover the player.
        const cover = Math.abs(d.def.x - playerX) < 3.5 * (d.def.scale ?? 1) && playerY < d.def.y + 4;
        const target = cover ? 0.25 : 1;
        for (const m of d.fade) {
          m.opacity += (target - m.opacity) * Math.min(1, dt * 6);
          m.depthWrite = m.opacity > 0.95;
        }
      }
    }

    // Ambient life: fireflies and alien insects drifting near the lanes.
    if (emit && Math.random() < 0.5 * ps) {
      const chasm = this.level.chasms.some((c) => camX > c.x0 - 10 && camX < c.x1 + 10);
      add.spawn({
        x: camX + rand(-halfW, halfW),
        y: camY + rand(-4, 6),
        z: rand(-9, 1),
        vx: rand(-0.4, 0.4),
        vy: rand(-0.2, 0.4),
        ax: rand(-0.3, 0.3),
        ay: rand(-0.2, 0.2),
        life: rand(3, 6),
        size0: 0.08,
        size1: 0.05,
        r: chasm ? 0.4 : 0.9,
        g: chasm ? 1.6 : 1.5,
        b: chasm ? 1.4 : 0.5,
        a0: 0.9,
        a1: 0,
        shape: Shape.Glow,
      });
    }
    // Drifting paper leaves.
    if (emit && Math.random() < 0.08 * ps) {
      this.r.debris.spawn(camX + rand(-halfW, halfW), camY + 9, rand(-6, 1), rand(0.3, 1), -0.5, 0, Math.random() < 0.5 ? 0x3aa7a0 : 0xc4508c, 0.25, 7, 1);
    }
  }

  dispose(): void {
    // Geometry and materials are shared through the paper caches, so only detach.
    this.r.scene.remove(this.group);
  }
}
