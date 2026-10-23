// Visual effects driven by simulation events: muzzle flashes, impacts per surface,
// layered explosions with folded shard bursts, shield shatters, dust, sparks, melee arcs,
// and rigid paper debris for shattered enemies and props.
import * as THREE from 'three';
import type { ExplosionKind, Surface } from '../core/events';
import { rand } from '../core/math';
import { getWeapon } from '../data/weapons';
import type { Renderer } from './renderer';
import { Shape } from './particles';

const c3 = (hex: number, k = 1): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

interface RigidPiece {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  life: number;
  age: number;
  ground: number;
  rest: boolean;
  s0: THREE.Vector3;
}

export class Fx {
  private rigid: RigidPiece[] = [];
  private rigidGroup = new THREE.Group();
  particleScale = 1;
  groundAt: (x: number, y: number, z: number) => number | null = () => null;
  soilColor = 0x5a3b4c;
  rockColor = 0x6c5a80;

  constructor(private r: Renderer) {
    r.scene.add(this.rigidGroup);
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.particleScale));
  }

  // ---------------------------------------------------------------------------
  muzzle(weaponId: string, x: number, y: number, z: number, angle: number, charged: boolean, byPlayer: boolean): void {
    const def = getWeapon(weaponId);
    const [r, g, b] = c3(def.muzzle.color, 2.2);
    const s = def.muzzle.size * (charged ? 1.8 : 1);
    const add = this.r.additive;
    add.spawn({ x, y, z: z + 0.25, life: 0.06, size0: s * 0.9, size1: s * 0.4, r, g, b, a0: 1, a1: 0, rot: rand(0, 6), shape: Shape.Star });
    add.spawn({ x, y, z: z + 0.2, life: 0.1, size0: s * 1.6, size1: s * 0.6, r: r * 0.6, g: g * 0.6, b: b * 0.6, a0: 0.8, a1: 0, shape: Shape.Glow });
    // Forward cone streak.
    add.spawn({
      x: x + Math.cos(angle) * s * 0.35,
      y: y + Math.sin(angle) * s * 0.35,
      z: z + 0.2,
      vx: Math.cos(angle) * 0.01,
      vy: Math.sin(angle) * 0.01,
      life: 0.05,
      size0: s * 0.35,
      len: s * 1.6,
      stretch: true,
      r: r * 1.2,
      g: g * 1.2,
      b: b * 1.2,
      a0: 1,
      a1: 0.2,
      shape: Shape.Spark,
    });
    this.r.lightPool.flash(x, y, z, def.muzzle.color, def.muzzle.light * (charged ? 3 : 1) * (byPlayer ? 1 : 0.7), 7, 0.07);
    if (def.family === 'kinetic' && byPlayer) {
      // Brass paper casings.
      const ex = -Math.cos(angle) * 0.4 + rand(-0.4, 0.4);
      this.r.debris.spawn(x - Math.cos(angle) * 0.6, y + 0.05, z + 0.2, ex * 2, rand(2.5, 4.5), rand(0.5, 1.5), 0xd4a84a, 0.07, 1.4, 0.1);
      this.r.alpha.spawn({ x, y, z: z + 0.2, vx: Math.cos(angle) * 0.6, vy: 0.5, life: 0.6, size0: 0.15, size1: 0.6, r: 0.75, g: 0.72, b: 0.7, a0: 0.25, a1: 0, shape: Shape.Smoke });
    }
    if (def.projectile.kind === 'rocket') {
      for (let i = 0; i < this.n(8); i++) {
        this.r.alpha.spawn({
          x: x - Math.cos(angle) * 1.6,
          y: y - Math.sin(angle) * 1.6,
          z,
          vx: -Math.cos(angle) * rand(2, 5) + rand(-1, 1),
          vy: -Math.sin(angle) * rand(2, 5) + rand(-0.5, 1),
          drag: 3,
          life: rand(0.8, 1.4),
          size0: 0.4,
          size1: 1.6,
          r: 0.7,
          g: 0.68,
          b: 0.66,
          a0: 0.45,
          a1: 0,
          rot: rand(0, 6),
          shape: Shape.Smoke,
        });
      }
    }
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, surface: Surface, color: number, size: number): void {
    const add = this.r.additive;
    const zz = z + 0.15;
    switch (surface) {
      case 'metal':
      case 'armor':
        for (let i = 0; i < this.n(7 * size); i++) {
          const a = Math.atan2(ny, nx) + rand(-1.1, 1.1);
          const sp = rand(5, 12);
          add.spawn({ x, y, z: zz, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: -20, life: rand(0.15, 0.35), size0: 0.05, len: 0.35, stretch: true, r: 2, g: 1.5, b: 0.8, a0: 1, a1: 0, shape: Shape.Spark });
        }
        add.spawn({ x, y, z: zz, life: 0.08, size0: 0.5 * size, size1: 0.2, r: 2, g: 1.6, b: 1, a0: 1, a1: 0, shape: Shape.Star, rot: rand(0, 6) });
        break;
      case 'shield': {
        const [r, g, b] = c3(color, 1.8);
        add.spawn({ x, y, z: zz, life: 0.25, size0: 0.4 * size, size1: 1.1 * size, r, g, b, a0: 0.9, a1: 0, shape: Shape.Hex, rot: rand(0, 6) });
        add.spawn({ x, y, z: zz, life: 0.12, size0: 0.6, size1: 0.2, r, g, b, a0: 1, a1: 0, shape: Shape.Glow });
        break;
      }
      case 'flesh':
        for (let i = 0; i < this.n(4 * size); i++) {
          this.r.debris.spawn(x, y, zz, nx * rand(1, 3) + rand(-2, 2), rand(1, 4), rand(-1, 1), Math.random() < 0.5 ? 0x6a2a8e : 0x9dff4a, rand(0.08, 0.16), rand(0.8, 1.6), 0.3);
        }
        add.spawn({ x, y, z: zz, life: 0.1, size0: 0.5, size1: 0.2, r: 1.2, g: 2, b: 0.6, a0: 0.8, a1: 0, shape: Shape.Glow });
        break;
      case 'energy': {
        const [r, g, b] = c3(color, 1.8);
        add.spawn({ x, y, z: zz, life: 0.18, size0: 0.5 * size, size1: 1.2 * size, r, g, b, a0: 0.9, a1: 0, shape: Shape.Glow });
        for (let i = 0; i < this.n(5 * size); i++) {
          const a = Math.atan2(ny, nx) + rand(-1.3, 1.3);
          const sp = rand(3, 8);
          add.spawn({ x, y, z: zz, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4, life: rand(0.2, 0.4), size0: 0.08, size1: 0.02, r, g, b, a0: 1, a1: 0, shape: Shape.Glow });
        }
        this.r.lightPool.flash(x, y, z, color, 3 * size, 4, 0.12);
        break;
      }
      default: {
        const col = surface === 'rock' ? this.rockColor : surface === 'foliage' ? 0x2f8f86 : 0xe8dcc0;
        for (let i = 0; i < this.n(3 * size); i++) {
          this.r.debris.spawn(x, y, zz, nx * rand(1, 4) + rand(-1.5, 1.5), ny * 2 + rand(1, 4), rand(-1, 1), i % 2 ? col : this.soilColor, rand(0.07, 0.15), rand(0.8, 1.5), 0.4);
        }
        this.r.alpha.spawn({ x, y, z: zz, vx: nx * 1.2, vy: ny * 1.2 + 0.6, drag: 3, life: rand(0.5, 0.9), size0: 0.25 * size, size1: 0.9 * size, r: 0.62, g: 0.52, b: 0.56, a0: 0.5, a1: 0, rot: rand(0, 6), shape: Shape.Smoke });
        add.spawn({ x, y, z: zz, life: 0.06, size0: 0.3, size1: 0.1, r: 1.6, g: 1.3, b: 0.9, a0: 0.8, a1: 0, shape: Shape.Star, rot: rand(0, 6) });
      }
    }
  }

  explosion(x: number, y: number, z: number, radius: number, kind: ExplosionKind): void {
    const add = this.r.additive;
    const alpha = this.r.alpha;
    const palette: Record<string, [number, number, number]> = {
      plasma: [0x9dff4a, 0xe9ffd0, 0x4aff9a],
      drone: [0xff4a3a, 0xffb070, 0xff2020],
      tank: [0xff7a2a, 0xffd080, 0xff3a1a],
      boss: [0xff7a2a, 0xfff0c0, 0xff3a1a],
      default: [0xff8a3a, 0xffe0a0, 0xff4a1a],
    };
    const [main, hot, deep] = palette[kind] ?? palette.default;
    const R = radius;
    const zz = z + 0.4;
    const [hr, hg, hb] = c3(hot, 3);
    const [mr, mg, mb] = c3(main, 2.4);
    const [dr, dg, db] = c3(deep, 1.6);
    // Flash.
    add.spawn({ x, y, z: zz, life: 0.12, size0: R * 1.3, size1: R * 2.0, r: hr, g: hg, b: hb, a0: 0.8, a1: 0, shape: Shape.Glow });
    add.spawn({ x, y, z: zz + 0.1, life: 0.08, size0: R * 1.0, size1: R * 0.5, r: hr, g: hg, b: hb, a0: 1, a1: 0, rot: rand(0, 6), shape: Shape.Star });
    // Fireball: layered glowing puffs.
    for (let i = 0; i < this.n(8 + R * 2); i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.5, 1.6) * R;
      add.spawn({
        x: x + Math.cos(a) * R * 0.15,
        y: y + Math.sin(a) * R * 0.15,
        z: zz + rand(-0.4, 0.4),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.7 + R * 0.4,
        drag: 4.5,
        life: rand(0.35, 0.7),
        size0: R * rand(0.35, 0.6),
        size1: R * rand(0.6, 0.9),
        r: mr,
        g: mg,
        b: mb,
        r1: dr,
        g1: dg,
        b1: db,
        a0: 0.9,
        a1: 0,
        shape: Shape.Glow,
      });
    }
    // Shockwave ring.
    add.spawn({ x, y, z: zz, life: 0.32, size0: R * 0.3, size1: R * 2.2, r: hr * 0.7, g: hg * 0.7, b: hb * 0.7, a0: 0.7, a1: 0, shape: Shape.Ring });
    // Folded shards.
    this.r.shards.burst(x, y, zz, Math.min(R, 3) * 0.6, [main, hot, deep], this.n(kind === 'boss' ? 18 : 8));
    // Sparks.
    for (let i = 0; i < this.n(12 + R * 2); i++) {
      const a = rand(0.1, Math.PI - 0.1);
      const sp = rand(8, 18);
      add.spawn({ x, y, z: zz, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp, ay: -25, life: rand(0.3, 0.8), size0: 0.06, len: 0.5, stretch: true, r: 2, g: 1.4, b: 0.6, a0: 1, a1: 0, shape: Shape.Spark });
    }
    // Smoke.
    for (let i = 0; i < this.n(6 + R * 2); i++) {
      alpha.spawn({
        x: x + rand(-R, R) * 0.4,
        y: y + rand(0, R * 0.5),
        z: zz - 0.3 + rand(-0.4, 0.4),
        vx: rand(-1.5, 1.5),
        vy: rand(1, 3),
        drag: 1.2,
        life: rand(1.5, 2.8),
        size0: R * 0.5,
        size1: R * rand(1.1, 1.6),
        r: 0.16,
        g: 0.12,
        b: 0.16,
        a0: 0.65,
        a1: 0,
        rot: rand(0, 6),
        vrot: rand(-0.4, 0.4),
        shape: Shape.Smoke,
      });
    }
    // Paper debris.
    for (let i = 0; i < this.n(14 + R * 4); i++) {
      const a = rand(0, Math.PI);
      const sp = rand(4, 11);
      const col = [this.soilColor, 0xe8dcc0, 0x2f8f86, 0x2a2228][i % 4];
      this.r.debris.spawn(x, y + 0.2, zz, Math.cos(a) * sp, Math.sin(a) * sp, rand(-2, 2), col, rand(0.1, 0.24), rand(1.6, 3), 0.5);
    }
    this.r.lightPool.flash(x, y + 0.5, z, main, 40 * Math.min(R, 6), R * 4 + 4, kind === 'boss' ? 1.0 : 0.45);
  }

  shieldShatter(x: number, y: number, z: number, player: boolean): void {
    const [r, g, b] = c3(player ? 0x7fe8ff : 0xffd060, 2);
    for (let i = 0; i < this.n(14); i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(3, 7);
      this.r.additive.spawn({ x, y, z: z + 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, ay: -6, life: rand(0.4, 0.7), size0: rand(0.15, 0.3), size1: 0.05, r, g, b, a0: 1, a1: 0, rot: rand(0, 6), vrot: rand(-8, 8), shape: Shape.Hex });
    }
    this.r.additive.spawn({ x, y, z: z + 0.3, life: 0.3, size0: 0.6, size1: 2.4, r, g, b, a0: 0.8, a1: 0, shape: Shape.Ring });
    this.r.lightPool.flash(x, y, z, player ? 0x7fe8ff : 0xffd060, 12, 6, 0.25);
  }

  dust(x: number, y: number, z: number, amount: number, color = 0.6): void {
    for (let i = 0; i < this.n(3 + amount * 6); i++) {
      const dir = i % 2 ? 1 : -1;
      this.r.alpha.spawn({
        x: x + rand(-0.3, 0.3),
        y: y + 0.1,
        z: z + rand(-0.3, 0.3),
        vx: dir * rand(1, 3) * (0.5 + amount),
        vy: rand(0.2, 1),
        drag: 3,
        life: rand(0.5, 1.0),
        size0: 0.25 + amount * 0.2,
        size1: 0.8 + amount * 0.8,
        r: color,
        g: color * 0.85,
        b: color * 0.9,
        a0: 0.4,
        a1: 0,
        rot: rand(0, 6),
        shape: Shape.Smoke,
      });
    }
  }

  meleeArc(x: number, y: number, z: number, dir: number, hit: boolean, player: boolean): void {
    const [r, g, b] = player ? [2, 1.8, 1.4] : [2, 0.6, 0.4];
    for (let i = 0; i < 7; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + (dir > 0 ? 1 : -1) * (0.9 - i * 0.28);
      this.r.additive.spawn({
        x: x + Math.cos(a) * 0.9 - dir * 0.6,
        y: y + Math.sin(a) * 0.9,
        z: z + 0.3,
        vx: -Math.sin(a) * dir * 3,
        vy: Math.cos(a) * dir * 3,
        life: 0.12 + i * 0.01,
        size0: 0.12,
        len: 0.6,
        stretch: true,
        r,
        g,
        b,
        a0: 0.8,
        a1: 0,
        shape: Shape.Spark,
      });
    }
    if (hit) {
      this.r.additive.spawn({ x: x + dir * 0.3, y, z: z + 0.3, life: 0.12, size0: 1.2, size1: 0.4, r: 2, g: 1.8, b: 1.4, a0: 1, a1: 0, rot: rand(0, 6), shape: Shape.Star });
      this.r.lightPool.flash(x, y, z, 0xffd8a0, 8, 5, 0.1);
    }
  }

  sparkle(x: number, y: number, z: number, color: number, count = 12): void {
    const [r, g, b] = c3(color, 2);
    for (let i = 0; i < this.n(count); i++) {
      this.r.additive.spawn({ x: x + rand(-0.4, 0.4), y: y + rand(0, 1.2), z: z + 0.3, vy: rand(0.5, 2), life: rand(0.5, 1), size0: 0.12, size1: 0.02, r, g, b, a0: 1, a1: 0, rot: rand(0, 6), shape: Shape.Star });
    }
    this.r.additive.spawn({ x, y: y + 0.6, z: z + 0.3, life: 0.4, size0: 0.4, size1: 2.4, r, g, b, a0: 0.7, a1: 0, shape: Shape.Ring });
  }

  /** Detach meshes from a model and send them tumbling as rigid paper debris. */
  shatter(meshes: THREE.Mesh[], dirX: number, power: number, maxPieces = 16, life = 2.4): void {
    const list = meshes.filter((m) => m.visible && m.parent);
    // Prefer larger pieces.
    list.sort((a, b) => radius(b) - radius(a));
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < Math.min(maxPieces, list.length); i++) {
      const m = list[i];
      m.updateWorldMatrix(true, false);
      m.matrixWorld.decompose(pos, quat, scl);
      const clone = new THREE.Mesh(m.geometry, m.material);
      clone.position.copy(pos);
      clone.quaternion.copy(quat);
      clone.scale.copy(scl);
      clone.castShadow = true;
      this.rigidGroup.add(clone);
      this.rigid.push({
        mesh: clone,
        vx: dirX * rand(1, 4) * power + rand(-2, 2),
        vy: rand(3, 8) * power,
        vz: rand(-2, 2.5),
        wx: rand(-10, 10),
        wy: rand(-10, 10),
        wz: rand(-10, 10),
        life: life + rand(-0.4, 0.6),
        age: 0,
        ground: this.groundAt(pos.x, pos.y + 0.5, pos.z) ?? -100,
        rest: false,
        s0: scl.clone(),
      });
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.rigid.length; i++) {
      const p = this.rigid[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.rigidGroup.remove(p.mesh);
        continue;
      }
      const m = p.mesh;
      if (!p.rest) {
        p.vy -= 26 * dt;
        p.vx *= Math.exp(-0.8 * dt);
        m.position.x += p.vx * dt;
        m.position.y += p.vy * dt;
        m.position.z += p.vz * dt;
        m.rotation.x += p.wx * dt;
        m.rotation.y += p.wy * dt;
        m.rotation.z += p.wz * dt;
        if (m.position.y < p.ground + 0.08) {
          m.position.y = p.ground + 0.08;
          if (Math.abs(p.vy) < 2.5) {
            p.rest = true;
          } else {
            p.vy = -p.vy * 0.3;
            p.vx *= 0.5;
            p.vz *= 0.5;
            p.wx *= 0.5;
            p.wy *= 0.5;
            p.wz *= 0.5;
          }
        }
      }
      const fade = Math.min(1, (p.life - p.age) / 0.5);
      m.scale.copy(p.s0).multiplyScalar(fade);
      this.rigid[w++] = p;
    }
    this.rigid.length = w;
  }

  clear(): void {
    for (const p of this.rigid) this.rigidGroup.remove(p.mesh);
    this.rigid.length = 0;
  }
}

function radius(m: THREE.Mesh): number {
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  return m.geometry.boundingSphere?.radius ?? 0;
}
