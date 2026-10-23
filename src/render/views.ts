// Presentation of simulated entities. Each simulation object gets a view that reads its
// state (never writes it). GameView also draws projectiles, boss attack visuals and routes
// simulation events into effects.
import * as THREE from 'three';
import { clamp, lerp, rand } from '../core/math';
import { ARMOR_SCHEMES, VISORS } from '../data/progression';
import { GRENADES } from '../data/weapons';
import type { Colossus } from '../game/boss/colossus';
import type { Enemy } from '../game/enemy';
import type { Entity } from '../game/entity';
import { Grenade } from '../game/grenade';
import type { Player } from '../game/player';
import { Barrel, Barrier, CheckpointBeacon, Crate, CrumblePlatform, FuelTank, Pickup, PlasmaVent, StaticCover } from '../game/props';
import { LANE_Z } from '../game/types';
import type { World } from '../game/world';
import { Fx } from './fx';
import { ColossusModel } from './models/colossus';
import { DroneModel, EnemyModel, RavagerModel, ThrenModel } from './models/enemies';
import {
  buildBarrel,
  buildBarricade,
  buildBeacon,
  buildCrate,
  buildCrumble,
  buildFuelTank,
  buildGrenade,
  buildPickup,
  buildSandbags,
  buildVent,
} from './models/props';
import { SoldierModel } from './models/soldier';
import { glow } from './paper';
import { Shape } from './particles';
import type { Renderer } from './renderer';

export interface EntityView {
  update(alpha: number, dt: number, time: number): void;
  dispose(): void;
  /** Called when the entity is removed from the simulation. Return true to keep the view alive (e.g. to finish a death). */
  removed?(): boolean;
  readonly root?: THREE.Object3D;
}

const lerpPos = (o: THREE.Object3D, e: Entity, alpha: number): void => {
  o.position.set(lerp(e.px, e.x, alpha), lerp(e.py, e.y, alpha), lerp(e.pz, e.z, alpha));
};

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

class PlayerView implements EntityView {
  readonly root: THREE.Group;
  readonly model: SoldierModel;
  private blob: THREE.Mesh;
  /** Cutscene override for lying prone (intro wake-up). */
  prone = 0;
  hidden = false;

  constructor(
    private p: Player,
    private gv: GameView,
    armor: string,
    visor: string,
  ) {
    const scheme = ARMOR_SCHEMES.find((s) => s.id === armor) ?? ARMOR_SCHEMES[0];
    const v = VISORS.find((s) => s.id === visor) ?? VISORS[0];
    this.model = new SoldierModel({ primary: scheme.primary, secondary: scheme.secondary, accent: scheme.accent, visor: v.color });
    this.root = this.model.root;
    gv.r.scene.add(this.root);
    this.blob = blobShadow();
    gv.r.scene.add(this.blob);
  }

  update(alpha: number, dt: number): void {
    const p = this.p;
    lerpPos(this.root, p, alpha);
    this.root.visible = !this.hidden;
    const w = p.weapon;
    const charge = w && w.def.charge && w.charging ? clamp(w.chargeT / w.def.charge.time, 0, 1) : 0;
    this.model.update(
      {
        anim: p.anim,
        vx: p.vx,
        onGround: p.onGround,
        facing: p.facing,
        aimAngle: p.aimAngle,
        crouching: p.crouching,
        rollT: p.rollT,
        meleeT: p.meleeT,
        throwT: p.throwT,
        switchT: p.switchT,
        switchDur: p.switchDur,
        weaponId: w ? w.def.model : null,
        reloadProgress: w ? w.reloadProgress : 0,
        reloading: !!w && w.reloading,
        recoil: w ? w.recoil : 0,
        landImpact: p.landImpact,
        hurtT: p.hurtT,
        dead: p.dead,
        deadTime: p.deadTime,
        shieldFrac: p.maxShield > 0 ? p.shield / p.maxShield : 0,
        lastShieldHit: p.lastShieldHit,
        shieldRecharging: p.shieldTimer <= 0 && p.shield < p.maxShield && p.shield > 0,
        victory: p.victory,
        runPhase: p.runPhase,
        sprinting: p.sprinting,
        lastFire: w ? w.lastShot : 99,
        charge,
        laneT: p.laneT,
        prone: this.prone,
      },
      dt,
    );
    if (charge > 0) {
      const a = p.aimAngle;
      const len = p.muzzleLength();
      const x = p.x + Math.cos(a) * len;
      const y = p.shoulderY() + Math.sin(a) * len;
      this.gv.r.additive.quad(x, y, p.z + 0.4, 0.3 + charge * 0.6 + Math.sin(performance.now() * 0.05) * 0.05, 0, 0, 0, 0.6, 2, 0.4, 0.8, Shape.Glow);
      this.gv.r.lightPool.push({ x, y, z: p.z, color: 0x9dff4a, intensity: 3 + charge * 8, distance: 5 });
    }
    // Visor light pool for readability in dark areas.
    updateBlob(this.blob, this.root.position, this.gv, p.lane, !this.gv.shadows && !this.hidden);
  }

  dispose(): void {
    this.gv.r.scene.remove(this.root, this.blob);
    this.model.dispose();
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

class EnemyView implements EntityView {
  readonly root = new THREE.Group();
  private model: EnemyModel;
  private shattered = false;
  private blob: THREE.Mesh;
  private pod: THREE.Group | null = null;
  private keepT = 0;

  constructor(
    private e: Enemy,
    private gv: GameView,
  ) {
    switch (e.type) {
      case 'ravager':
        this.model = new RavagerModel();
        break;
      case 'drone':
        this.model = new DroneModel();
        break;
      case 'bulwark':
        this.model = new ThrenModel('bulwark');
        break;
      default:
        this.model = new ThrenModel('skirmisher');
    }
    this.root.add(this.model.root);
    gv.r.scene.add(this.root);
    this.blob = blobShadow();
    gv.r.scene.add(this.blob);
    if (e.entering && (e.entry === 'pod' || e.entry === 'drop')) {
      this.pod = buildDropPod();
      gv.r.scene.add(this.pod);
    }
  }

  update(alpha: number, dt: number, time: number): void {
    const e = this.e;
    lerpPos(this.root, e, alpha);
    if (!this.shattered) this.model.update(e, dt);
    // Hit pop.
    const pop = e.hitFlash > 0 ? 1 + e.hitFlash * 0.5 : 1;
    this.model.root.scale.y = (e.type === 'bulwark' ? 1.08 : 1) * pop;
    if (this.pod) {
      if (e.entering) {
        this.pod.position.set(e.x, e.y + 0.8, e.z);
        this.pod.rotation.y += dt * 4;
        this.gv.r.additive.spawn({ x: e.x + rand(-0.2, 0.2), y: e.y + 2.2, z: e.z, vy: 8, life: 0.25, size0: 0.6, size1: 0.1, r: 0.6, g: 2, b: 0.4, a0: 0.8, a1: 0, shape: Shape.Glow });
        this.gv.r.lightPool.push({ x: e.x, y: e.y + 1, z: e.z, color: 0x9dff4a, intensity: 10, distance: 7 });
      } else {
        // Pod lands, bursts open and folds away.
        this.gv.fx.explosion(e.x, e.y + 0.5, e.z, 1.4, 'plasma');
        this.gv.fx.shatter(collectMeshes(this.pod), 0, 0.8, 8, 1.6);
        this.gv.r.scene.remove(this.pod);
        this.pod = null;
      }
      this.model.root.visible = !e.entering;
    }
    // Death: crumple, then fold apart into paper pieces.
    if (e.dead && !this.shattered && e.deadTime > (e.type === 'drone' ? 0 : 0.4)) {
      if (e.type === 'drone') {
        // Drones fall; shatter when the simulation removes them (crash explosion).
      } else {
        this.shatter();
      }
    }
    if (e.type === 'drone' && e.dead && !this.shattered) {
      if (Math.random() < 0.6) this.gv.r.alpha.spawn({ x: e.x, y: e.y + 0.5, z: e.z, vy: 1, life: 1.2, size0: 0.4, size1: 1.4, r: 0.15, g: 0.12, b: 0.12, a0: 0.6, a1: 0, shape: Shape.Smoke });
      if (Math.random() < 0.5) this.gv.r.additive.spawn({ x: e.x, y: e.y + 0.5, z: e.z, vx: rand(-3, 3), vy: rand(1, 4), ay: -20, life: 0.3, size0: 0.05, len: 0.3, stretch: true, r: 2, g: 1.4, b: 0.6, a0: 1, a1: 0, shape: Shape.Spark });
    }
    // Damaged drones smoke.
    if (e.type === 'drone' && !e.dead && e.health < e.maxHealth * 0.4 && Math.random() < 0.3) {
      this.gv.r.alpha.spawn({ x: e.x - e.facing * 0.3, y: e.y + 0.7, z: e.z, vy: 1.2, vx: -e.vx * 0.2, life: 1, size0: 0.25, size1: 0.9, r: 0.2, g: 0.18, b: 0.18, a0: 0.5, a1: 0, shape: Shape.Smoke });
    }
    // Telegraph glints for ranged attacks.
    if (this.model.telegraph > 0.5 && e.type !== 'ravager' && !e.dead) {
      const m = { x: e.x + Math.cos(e.aimAngle) * 0.9, y: e.y + e.h * 0.68 + Math.sin(e.aimAngle) * 0.9 };
      const col = e.type === 'drone' ? [2.5, 0.4, 0.3] : [1, 2.5, 0.5];
      const s = 0.35 + Math.sin(time * 40) * 0.08;
      this.gv.r.additive.quad(m.x, e.type === 'drone' ? e.y + 0.53 : m.y, e.z + 0.5, s, 0, 0, 0, col[0], col[1], col[2], 0.9, Shape.Star);
      this.gv.r.lightPool.push({ x: m.x, y: m.y, z: e.z, color: e.type === 'drone' ? 0xff3030 : 0x9dff4a, intensity: 4, distance: 4 });
    }
    // Ravager roar/charge dust.
    if (e.type === 'ravager' && e.state === 'charge' && e.onGround && Math.random() < 0.7) this.gv.fx.dust(e.x - e.facing, e.y, e.z, 0.4);
    // Stunned drones crackle with EMP.
    if (e.stunT > 0 && Math.random() < 0.4) {
      this.gv.r.additive.spawn({ x: e.x + rand(-0.5, 0.5), y: e.y + rand(0.2, 1.4), z: e.z + 0.3, vx: rand(-2, 2), vy: rand(-2, 2), life: 0.15, size0: 0.04, len: 0.25, stretch: true, r: 0.6, g: 1.6, b: 2.4, a0: 1, a1: 0, shape: Shape.Spark });
    }
    updateBlob(this.blob, this.root.position, this.gv, e.lane, !this.gv.shadows && !this.shattered && !e.def.flying && !e.entering);
    if (this.shattered) this.keepT += dt;
  }

  private shatter(): void {
    if (this.shattered) return;
    this.shattered = true;
    const e = this.e;
    const power = e.deathCause === 'explosion' ? 1.6 : e.deathCause === 'melee' ? 1.2 : 0.8;
    this.root.updateMatrixWorld(true);
    this.gv.fx.shatter(this.model.parts(), e.deathDirX || -e.facing, power, e.type === 'ravager' ? 20 : 14);
    this.model.root.visible = false;
    const color = e.def.faction === 'thren' ? 0x6a2a8e : 0xd6dade;
    for (let i = 0; i < 18; i++) {
      this.gv.r.debris.spawn(e.x + rand(-0.4, 0.4), e.y + rand(0.3, e.h), e.z, rand(-3, 3) + (e.deathDirX || 0) * 3, rand(2, 6), rand(-1, 1), i % 3 === 0 ? 0x9dff4a : color, rand(0.1, 0.2), rand(1.5, 2.5), 0.4);
    }
    this.gv.r.additive.spawn({ x: e.x, y: e.y + e.h * 0.6, z: e.z + 0.3, life: 0.25, size0: 1.2, size1: 2.4, r: 1, g: 2, b: 0.6, a0: 0.8, a1: 0, shape: Shape.Ring });
    this.gv.r.lightPool.flash(e.x, e.y + 1, e.z, e.def.faction === 'thren' ? 0x9dff4a : 0xff6040, 6, 5, 0.3);
  }

  removed(): boolean {
    if (this.e.type === 'drone' && !this.shattered) {
      this.shattered = true;
      this.root.updateMatrixWorld(true);
      this.gv.fx.shatter(this.model.parts(), this.e.vx >= 0 ? 1 : -1, 1.4, 12);
      this.model.root.visible = false;
    }
    if (!this.shattered) {
      // Removed without a death (fell into a pit).
      return false;
    }
    return this.keepT < 0.05;
  }

  dispose(): void {
    this.gv.r.scene.remove(this.root, this.blob);
    if (this.pod) this.gv.r.scene.remove(this.pod);
    this.model.dispose();
  }
}

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

class BossView implements EntityView {
  readonly root = new THREE.Group();
  readonly model = new ColossusModel();
  private tmp = new THREE.Vector3();
  private markers: Array<{ mesh: THREE.Mesh; t: number; dur: number; x: number; y: number; z: number }> = [];

  constructor(
    private b: Colossus,
    private gv: GameView,
  ) {
    this.root.add(this.model.root);
    gv.r.scene.add(this.root);
  }

  addMarker(x: number, y: number, z: number, dur: number): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 24), glow(0xff3020, 2.5, { transparent: true, side: THREE.DoubleSide }).clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.05, z);
    this.gv.r.scene.add(m);
    this.markers.push({ mesh: m, t: 0, dur, x, y, z });
  }

  update(alpha: number, dt: number, time: number): void {
    const b = this.b;
    lerpPos(this.root, b, alpha);
    this.root.position.z += this.model.entranceZ;
    this.model.update(b, dt);
    const add = this.gv.r.additive;
    const lp = this.gv.r.lightPool;
    this.root.updateMatrixWorld(true);
    // Core light.
    const core = this.model.coreWorld(this.tmp);
    if (!b.dead) lp.push({ x: core.x, y: core.y, z: core.z + 1, color: 0xff7a2a, intensity: 6 + b.coreHeat * 10, distance: 8 });
    // Laser sight during cannon telegraph.
    if (b.attack === 'cannon' && b.attackT < b.telegraph) {
      const m = b.cannonMuzzle();
      const a = b.aimAngle;
      const L = 30;
      const k = b.attackT / b.telegraph;
      add.quad(m.x + Math.cos(a) * L * 0.5, m.y + Math.sin(a) * L * 0.5, this.gv.world.player.z + 0.2, 0.05 + k * 0.05, L, Math.cos(a), Math.sin(a), 2.5, 0.2, 0.15, 0.5 + 0.4 * Math.sin(time * 30), Shape.Glow);
      add.quad(m.x, m.y, b.z + 1.5, 0.6 + k, 0, 0, 0, 2.5, 0.4, 0.2, 0.9, Shape.Star);
    }
    // Sensor beam.
    if (b.attack === 'beam') {
      const e = b.eyePos();
      const z = LANE_Z[b.beamLane] + 0.2;
      if (b.attackT < b.telegraph) {
        const k = b.beamCharge;
        add.quad(e.x, e.y, b.z + 1.5, 0.8 + k * 2, 0, 0, 0, 2.5, 0.3, 0.3, 0.6 + k * 0.4, Shape.Glow);
        // Warning line at beam height.
        add.quad(e.x + b.facing * 15, b.beamY, z, 0.04, 30, 1, 0, 2, 0.2, 0.2, 0.25 + 0.25 * Math.sin(time * 25), Shape.Glow);
        lp.push({ x: e.x, y: e.y, z: b.z + 1, color: 0xff2020, intensity: 6 + k * 18, distance: 10 });
      } else if (b.beamActive) {
        const x0 = b.beamX0;
        const x1 = b.beamX1;
        const len = Math.abs(x1 - x0);
        const mid = (x0 + x1) / 2;
        // Sweep from the eye down to beam height, then along the lane.
        add.quad(e.x + b.facing * 0.5, (e.y + b.beamY) / 2, b.z + 1.5, 0.35, Math.abs(e.y - b.beamY) + 0.5, 0, 1, 2.5, 0.5, 0.4, 0.9, Shape.Glow);
        add.quad(mid, b.beamY, z, 0.55, len, 1, 0, 3, 0.5, 0.4, 0.9, Shape.Glow);
        add.quad(mid, b.beamY, z + 0.05, 0.16, len, 1, 0, 3, 2.6, 2.4, 1, Shape.Glow);
        add.quad(x1, b.beamY, z + 0.1, 1.4, 0, 0, 0, 3, 1, 0.6, 1, Shape.Star);
        lp.push({ x: x1, y: b.beamY, z, color: 0xff3020, intensity: 22, distance: 10 });
        if (Math.random() < 0.8) this.gv.fx.impact(x1, b.beamY, z - 0.15, -b.facing, 0, 'metal', 0xff3020, 0.6);
      }
    }
    // Shockwaves.
    for (const s of b.shockwaves) {
      const sx = s.x + s.dir * s.dist;
      const fade = 1 - s.dist / 11;
      add.quad(sx, b.y + 0.4, 0.2, 0.9, 0.9, 0, 1, 2.5, 1.4, 0.6, fade, Shape.Glow);
      add.quad(sx, b.y + 0.4, -3.0, 0.9, 0.9, 0, 1, 2.5, 1.4, 0.6, fade, Shape.Glow);
      if (Math.random() < 0.6) this.gv.fx.dust(sx, b.y, 0, 0.4);
    }
    // Steam & sparks as damage accumulates.
    const dmg = 1 - b.health / b.maxHealth;
    if (!b.dead && Math.random() < dmg * 0.5) {
      this.gv.r.alpha.spawn({ x: b.x + rand(-1.5, 1.5), y: b.y + rand(5, 6.5), z: b.z + rand(0, 1.5), vy: rand(1, 2.5), vx: rand(-0.5, 0.5), life: rand(1.2, 2), size0: 0.5, size1: 2, r: 0.2, g: 0.18, b: 0.18, a0: 0.5, a1: 0, rot: rand(0, 6), shape: Shape.Smoke });
    }
    if (b.ventT > 0 && Math.random() < 0.8) {
      this.gv.r.alpha.spawn({ x: core.x + rand(-0.5, 0.5), y: core.y + 0.6, z: core.z + 1, vy: rand(3, 5), vx: b.facing * rand(0.5, 2), life: 1, size0: 0.4, size1: 1.8, r: 0.9, g: 0.9, b: 0.9, a0: 0.5, a1: 0, rot: rand(0, 6), shape: Shape.Smoke });
    }
    // Missile target markers.
    let w = 0;
    for (const m of this.markers) {
      m.t += dt;
      if (m.t >= m.dur) {
        this.gv.r.scene.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        m.mesh.geometry.dispose();
        continue;
      }
      const k = m.t / m.dur;
      m.mesh.scale.setScalar(1.6 - k * 0.6);
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(time * (10 + k * 30));
      add.quad(m.x, m.y + 4, m.z, 0.06, 8, 0, 1, 2.5, 0.3, 0.2, 0.25 * k, Shape.Glow);
      this.markers[w++] = m;
    }
    this.markers.length = w;
  }

  shatter(): void {
    this.root.updateMatrixWorld(true);
    this.gv.fx.shatter(this.model.parts(), this.gv.world.player.x < this.b.x ? 1 : -1, 1.4, 40, 4);
    this.model.root.visible = false;
  }

  dispose(): void {
    this.gv.r.scene.remove(this.root);
    for (const m of this.markers) this.gv.r.scene.remove(m.mesh);
    this.model.dispose();
  }
}

// ---------------------------------------------------------------------------
// Props, pickups, hazards
// ---------------------------------------------------------------------------

class SimpleView implements EntityView {
  constructor(
    readonly root: THREE.Object3D,
    private e: Entity,
    private gv: GameView,
    private tick?: (root: THREE.Object3D, dt: number, time: number) => void,
    private onRemove?: () => boolean,
  ) {
    gv.r.scene.add(root);
    lerpPos(root, e, 1);
  }

  update(alpha: number, dt: number, time: number): void {
    lerpPos(this.root, this.e, alpha);
    this.tick?.(this.root, dt, time);
  }

  removed(): boolean {
    return this.onRemove ? this.onRemove() : false;
  }

  dispose(): void {
    this.gv.r.scene.remove(this.root);
  }
}

let curtainTex: THREE.Texture | null = null;
function curtainTexture(): THREE.Texture {
  if (curtainTex) return curtainTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < 256; y += 8) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + (y % 32 === 0 ? 0.4 : 0)})`;
    ctx.fillRect(0, y, 64, 3);
  }
  curtainTex = new THREE.CanvasTexture(c);
  curtainTex.wrapT = THREE.RepeatWrapping;
  curtainTex.repeat.set(1, 3);
  return curtainTex;
}

let postMat: THREE.Material | null = null;
function metalPost(): THREE.Material {
  if (!postMat) postMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.5, flatShading: true });
  return postMat;
}

const colorCache = new Map<number, THREE.Color>();
function colorOf(hex: number): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

function blobShadow(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

function updateBlob(blob: THREE.Mesh, pos: THREE.Vector3, gv: GameView, lane: number, visible: boolean): void {
  blob.visible = visible;
  if (!visible) return;
  const g = gv.world.solids.groundBelow(pos.x, pos.y + 0.2, lane === 0 ? 1 : 2, 20);
  if (g === null) {
    blob.visible = false;
    return;
  }
  const h = pos.y - g;
  blob.position.set(pos.x, g + 0.03, pos.z);
  blob.scale.setScalar(clamp(1 - h * 0.12, 0.3, 1));
}

function buildDropPod(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), [new THREE.MeshStandardMaterial({ color: 0x3a2054, flatShading: true, roughness: 0.6 })]);
  body.scale.set(0.9, 1.6, 0.9);
  body.castShadow = true;
  g.add(body);
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 4, 8), glow(0x9dff4a, 2.5));
  glowRing.rotation.x = Math.PI / 2;
  g.add(glowRing);
  return g;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

// ---------------------------------------------------------------------------
// GameView
// ---------------------------------------------------------------------------

export class GameView {
  readonly fx: Fx;
  private views = new Map<number, EntityView>();
  private dying: EntityView[] = [];
  private unsub: Array<() => void> = [];
  playerView: PlayerView | null = null;
  bossView: BossView | null = null;
  shadows = true;
  private time = 0;

  constructor(
    readonly world: World,
    readonly r: Renderer,
    private cosmetics: { armor: string; visor: string },
    particleScale: number,
  ) {
    this.fx = new Fx(r);
    this.fx.particleScale = particleScale;
    this.fx.soilColor = world.level.theme.soil;
    this.fx.rockColor = world.level.theme.rock;
    const groundAt = (x: number, y: number, z: number) => world.solids.groundBelow(x, y, z > -1.6 ? 1 : 2, 30);
    this.fx.groundAt = groundAt;
    r.debris.groundAt = groundAt;
    for (const e of world.entities) this.add(e);
    this.unsub.push(world.entityAdded.on((e) => this.add(e)));
    this.unsub.push(world.entityRemoved.on((e) => this.remove(e)));
    this.bindEvents();
  }

  private add(e: Entity): void {
    if (this.views.has(e.id)) return;
    const v = this.createView(e);
    if (v) this.views.set(e.id, v);
  }

  private remove(e: Entity): void {
    const v = this.views.get(e.id);
    if (!v) return;
    this.views.delete(e.id);
    if (v.removed && v.removed()) this.dying.push(v);
    else v.dispose();
  }

  private createView(e: Entity): EntityView | null {
    const gv = this;
    if (e.kind === 'player') {
      this.playerView = new PlayerView(e as Player, this, this.cosmetics.armor, this.cosmetics.visor);
      return this.playerView;
    }
    if (e.kind === 'enemy') return new EnemyView(e as Enemy, this);
    if (e.kind === 'boss') {
      this.bossView = new BossView(e as Colossus, this);
      return this.bossView;
    }
    if (e instanceof Barrel) {
      const m = buildBarrel();
      const glowPart = m.getObjectByName('glow');
      return new SimpleView(
        m,
        e,
        this,
        (root, _dt, time) => {
          if (glowPart) glowPart.scale.setScalar(1 + (e.fuse >= 0 ? 0.15 : 0.03) * Math.sin(time * (e.fuse >= 0 ? 60 : 4)));
          root.rotation.z = e.hitT < 0.15 ? Math.sin(time * 80) * 0.05 : 0;
          if (e.fuse < 0) gv.r.lightPool.push({ x: e.x, y: e.y + 0.5, z: e.z + 0.5, color: 0x9dff4a, intensity: 1.5, distance: 3 });
        },
      );
    }
    if (e instanceof Crate) {
      const m = buildCrate(e.propType === 'crateSmall', e.id);
      return new SimpleView(
        m,
        e,
        this,
        (root, _dt, time) => {
          root.rotation.z = e.shake > 0 ? Math.sin(time * 70) * 0.04 : 0;
        },
        () => {
          // Destroyed: break apart.
          m.updateMatrixWorld(true);
          gv.fx.shatter(collectMeshes(m), rand(-1, 1), 1, 10, 2.2);
          gv.fx.dust(e.x, e.y, e.z, 1);
          return false;
        },
      );
    }
    if (e instanceof StaticCover) {
      return new SimpleView(e.propType === 'barricade' ? buildBarricade() : buildSandbags(), e, this);
    }
    if (e instanceof FuelTank) {
      const m = buildFuelTank();
      const lamp = m.getObjectByName('glow');
      return new SimpleView(
        m,
        e,
        this,
        (root, _dt, time) => {
          const boss = gv.world.boss;
          const hint = boss && boss.active && Math.abs(boss.x - e.x) < 7.5 && e.alive;
          if (lamp) lamp.scale.setScalar(hint ? 1.6 + Math.sin(time * 20) * 0.5 : 1 + Math.sin(time * 3) * 0.2);
          if (hint) {
            gv.r.additive.quad(e.x, e.y + 1.6, e.z + 1.2, 2.6 + Math.sin(time * 10) * 0.3, 0, 0, 0, 2.5, 1.2, 0.2, 0.18, Shape.Ring);
            gv.r.lightPool.push({ x: e.x, y: e.y + 3.2, z: e.z + 1, color: 0xffb340, intensity: 8, distance: 6 });
          }
          root.rotation.z = e.hitT < 0.2 ? Math.sin(time * 60) * 0.02 : 0;
        },
        () => {
          m.updateMatrixWorld(true);
          gv.fx.shatter(collectMeshes(m), 0, 1.6, 12, 3);
          return false;
        },
      );
    }
    if (e instanceof PlasmaVent) {
      const m = buildVent();
      const mouth = m.getObjectByName('glow');
      return new SimpleView(m, e, this, (_root, _dt, time) => {
        const near = Math.abs(e.x - gv.world.player.x) < 30;
        if (!near) return;
        const add = gv.r.additive;
        if (mouth) mouth.scale.setScalar(e.phase === 'idle' ? 0.6 : e.phase === 'warn' ? 0.9 + Math.sin(time * 30) * 0.15 : 1.3);
        if (e.phase === 'warn') {
          if (Math.random() < 0.6) add.spawn({ x: e.x + rand(-0.3, 0.3), y: e.y + 0.1, z: e.z, vy: rand(1, 3), life: 0.4, size0: 0.15, size1: 0.05, r: 0.6, g: 2.4, b: 2, a0: 1, a1: 0, shape: Shape.Glow });
          gv.r.lightPool.push({ x: e.x, y: e.y + 0.5, z: e.z + 0.5, color: 0x5ff2d0, intensity: 4 + Math.sin(time * 30) * 2, distance: 5 });
        } else if (e.phase === 'erupt') {
          for (let i = 0; i < 3; i++) {
            add.spawn({ x: e.x + rand(-0.4, 0.4), y: e.y + rand(0, 0.5), z: e.z + rand(-0.3, 0.3), vy: rand(8, 13), drag: 0.5, life: rand(0.35, 0.5), size0: rand(0.5, 0.8), size1: 1.2, r: 0.5, g: 2.4, b: 2, r1: 0.3, g1: 0.8, b1: 1.6, a0: 0.9, a1: 0, shape: Shape.Glow });
          }
          add.quad(e.x, e.y + e.height / 2, e.z + 0.2, 1.2, e.height, 0, 1, 0.8, 2.6, 2.2, 0.5, Shape.Glow);
          gv.r.lightPool.push({ x: e.x, y: e.y + 2.5, z: e.z + 0.6, color: 0x5ff2d0, intensity: 22, distance: 9 });
        } else if (Math.random() < 0.08) {
          gv.r.alpha.spawn({ x: e.x, y: e.y + 0.2, z: e.z, vy: 0.8, life: 1.5, size0: 0.3, size1: 1, r: 0.5, g: 0.8, b: 0.8, a0: 0.25, a1: 0, shape: Shape.Smoke });
        }
      });
    }
    if (e instanceof CrumblePlatform) {
      const m = buildCrumble(e.w, e.h, e.id);
      return new SimpleView(m, e, this, (root, _dt, time) => {
        root.position.set(e.x, e.baseY + e.h, e.z);
        if (e.state === 'shaking') {
          root.position.x += Math.sin(time * 60) * 0.05;
          root.position.y += Math.sin(time * 47) * 0.03;
          if (Math.random() < 0.3) gv.r.debris.spawn(e.x + rand(-e.w / 2, e.w / 2), e.baseY, e.z + 1, 0, -1, 0, 0x6c5a80, 0.1, 1.5, 0);
        } else if (e.state === 'fallen') {
          root.position.y -= e.fallY;
          root.rotation.z = e.fallY * 0.05;
          root.visible = e.fallY < 30;
          if (e.t > 4.2) {
            root.visible = true;
            root.position.y = e.baseY + e.h;
            root.rotation.z = 0;
            root.scale.setScalar(clamp((e.t - 4.2) / 0.3, 0.05, 1));
          }
        } else {
          root.visible = true;
          root.rotation.z = 0;
          root.scale.setScalar(Math.min(1, root.scale.x + 0.1));
        }
      });
    }
    if (e instanceof Barrier) {
      // Hard-light curtain: camera-facing sheets on both lanes with emitter posts.
      const tex = curtainTexture();
      const g = new THREE.Group();
      const mats: THREE.MeshBasicMaterial[] = [];
      for (const z of [0.5, -3.7]) {
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          color: new THREE.Color(0x5ff2ff).multiplyScalar(1.8),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        mats.push(mat);
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.1, e.height), mat);
        sheet.position.set(0, e.height / 2, z - e.z);
        g.add(sheet);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), metalPost());
        post.position.set(0, 0.17, z - e.z);
        g.add(post);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), metalPost());
        cap.position.set(0, e.height, z - e.z);
        g.add(cap);
      }
      return new SimpleView(g, e, this, (_root, dt, time) => {
        const target = e.on ? 0.75 + Math.sin(time * 6) * 0.1 : 0;
        for (const mat of mats) {
          mat.opacity += (target - mat.opacity) * Math.min(1, dt * 5);
          if (mat.map) mat.map.offset.y = -time * 0.4;
        }
        const vis = mats[0].opacity > 0.01;
        g.children.forEach((c, i) => (c.visible = i % 3 === 0 ? vis : true));
        if (e.on) gv.r.lightPool.push({ x: e.x, y: e.y + 2, z: 0, color: 0x5ff2ff, intensity: 6, distance: 7 });
      });
    }
    if (e instanceof CheckpointBeacon) {
      const m = buildBeacon();
      const lamp = m.getObjectByName('lamp') as THREE.Mesh | undefined;
      const flag = m.getObjectByName('flag');
      let wasActive = e.active;
      if (lamp) lamp.material = glow(e.active ? 0x5dff9a : 0xe8772e, 3);
      return new SimpleView(m, e, this, (_root, _dt, time) => {
        if (e.active !== wasActive) {
          wasActive = e.active;
          if (lamp) lamp.material = glow(0x5dff9a, 3);
          gv.fx.sparkle(e.x, e.y + 1, e.z, 0x5dff9a, 24);
        }
        if (lamp) lamp.scale.setScalar(1 + Math.sin(time * (e.active ? 3 : 8)) * 0.25);
        if (flag) flag.rotation.y = Math.sin(time * 3) * 0.3;
        gv.r.lightPool.push({ x: e.x, y: e.y + 1.6, z: e.z + 0.5, color: e.active ? 0x5dff9a : 0xe8772e, intensity: 4, distance: 5 });
      });
    }
    if (e instanceof Pickup) {
      const m = buildPickup(e.ptype, e.weaponId, e.grenadeType);
      const spin = m.getObjectByName('spin');
      const ring = m.getObjectByName('ring');
      const lid = m.getObjectByName('lid');
      const lamp = m.getObjectByName('lamp') as THREE.Mesh | undefined;
      const beamColor = e.ptype === 'weapon' ? 0xffd48a : e.ptype === 'intel' ? 0x7fe8ff : e.ptype === 'health' ? 0xff6a6a : e.ptype === 'grenades' ? 0x9dff4a : 0xffd48a;
      const col = new THREE.Color(beamColor);
      return new SimpleView(m, e, this, (root, _dt, time) => {
        if (spin) {
          spin.rotation.y = e.spin;
          spin.position.y = (e.ptype === 'intel' ? 0.8 : 0.55) + Math.sin(time * 2 + e.id) * 0.08;
        }
        if (ring) ring.rotation.z = time;
        if (lid) lid.rotation.z = e.openT * 1.9;
        if (lamp && e.ptype === 'cache') lamp.material = glow(e.opened ? 0x5dff9a : 0xffb340, 3);
        if (lamp && e.ptype === 'ordnance') lamp.material = glow(e.cooldown > 0 ? 0xff3020 : 0x5dff9a, 3);
        const dist = Math.abs(gv.world.player.x - e.x);
        if (dist > 40) return;
        if (e.ptype === 'weapon' || e.ptype === 'intel' || e.ptype === 'grenades' || e.ptype === 'health' || e.ptype === 'ammo') {
          // Soft column of light marks collectibles.
          gv.r.additive.quad(e.x, e.y + 1.2, e.z - 0.05, 0.5, 2.4, 0, 1, col.r * 1.2, col.g * 1.2, col.b * 1.2, 0.12 + Math.sin(time * 3) * 0.04, Shape.Glow);
          gv.r.additive.quad(e.x, e.y + 0.08, e.z, 0.9, 0, 0, 0, col.r, col.g, col.b, 0.25, Shape.Ring);
        }
        if (e.ptype === 'intel') gv.r.lightPool.push({ x: e.x, y: e.y + 0.8, z: e.z + 0.4, color: 0x7fe8ff, intensity: 3, distance: 4 });
        if (e.dropped && e.life < 5) root.visible = Math.sin(time * 20) > 0;
      });
    }
    if (e instanceof Grenade) {
      const m = buildGrenade(e.def.id);
      const lamp = m.getObjectByName('lamp');
      return new SimpleView(m, e, this, (root, _dt, time) => {
        root.rotation.z = e.spin;
        const fuseK = clamp(e.fuse / e.def.fuse, 0, 1);
        const blink = Math.sin(time * (8 + (1 - fuseK) * 50)) > 0;
        if (lamp) lamp.visible = blink;
        const col = GRENADES[e.def.id]?.glow ?? 0xffa040;
        if (e.def.id === 'plasma') {
          gv.r.additive.quad(e.x, e.y, e.z + 0.3, 0.6 + (1 - fuseK) * 0.4, 0, 0, 0, 0.6, 2.4, 0.4, 0.8, Shape.Glow);
          gv.r.lightPool.push({ x: e.x, y: e.y, z: e.z, color: col, intensity: 5, distance: 4 });
        } else if (blink) {
          gv.r.additive.quad(e.x, e.y + 0.06, e.z + 0.2, 0.3, 0, 0, 0, 2.5, 0.5, 0.2, 0.9, Shape.Glow);
        }
        if (!e.stuckSolid && !e.stuckTo && Math.random() < 0.5) {
          gv.r.additive.spawn({ x: e.x, y: e.y, z: e.z + 0.1, life: 0.25, size0: 0.12, size1: 0.02, r: 1.5, g: 1, b: 0.6, a0: 0.5, a1: 0, shape: Shape.Glow });
        }
      });
    }
    return null;
  }

  private bindEvents(): void {
    const ev = this.world.events;
    const fx = this.fx;
    this.unsub.push(
      ev.on('shot', (s) => fx.muzzle(s.weaponId, s.x, s.y, s.z, s.angle, !!s.charged, s.byPlayer)),
      ev.on('impact', (i) => fx.impact(i.x, i.y, i.z, i.nx, i.ny, i.surface, i.color, i.size)),
      ev.on('explosion', (x) => fx.explosion(x.x, x.y, x.z, x.radius, x.kind)),
      ev.on('shieldBroken', (s) => fx.shieldShatter(s.x, s.y, s.z, s.isPlayer)),
      ev.on('land', (l) => {
        if (l.heavy > 0.2) fx.dust(l.x, l.y, l.z, l.heavy);
      }),
      ev.on('footstep', (f) => {
        if (f.heavy >= 3) fx.dust(f.x, f.y, f.z + 1, 1.2);
        else if (f.isPlayer && f.heavy >= 1 && Math.random() < 0.6) fx.dust(f.x, f.y, f.z, 0.15);
      }),
      ev.on('roll', (r) => fx.dust(r.x, r.y, this.world.player.z, 0.5)),
      ev.on('laneShift', (l) => fx.dust(l.x, l.y, LANE_Z[l.toLane], 0.3)),
      ev.on('melee', (m) => fx.meleeArc(m.x, m.y, m.z, m.dir, m.hit, m.byPlayer)),
      ev.on('grenadeStick', (g) => this.r.additive.spawn({ x: g.x, y: g.y, z: 0.3, life: 0.2, size0: 0.4, size1: 1.2, r: 0.6, g: 2.4, b: 0.4, a0: 1, a1: 0, shape: Shape.Ring })),
      ev.on('burn', (b) =>
        this.r.additive.spawn({ x: b.x, y: b.y + 0.1, z: b.z + 0.2, vy: rand(1, 3), life: rand(0.4, 0.8), size0: rand(0.4, 0.8), size1: 0.1, r: 1.8, g: 0.9, b: 0.3, r1: 1, g1: 0.2, b1: 0.05, a0: 0.9, a1: 0, shape: Shape.Glow }),
      ),
      ev.on('platform', (p) => {
        if (p.kind === 'fall') {
          for (let i = 0; i < 14; i++) this.r.debris.spawn(p.x + rand(-p.w / 2, p.w / 2), p.y, rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1), i % 2 ? 0x6c5a80 : 0x2f8f86, rand(0.12, 0.25), 2, 0.1);
          fx.dust(p.x, p.y - 0.3, 0, 0.8);
        }
      }),
      ev.on('checkpoint', (c) => fx.sparkle(c.x, c.y, 0, 0x5dff9a, 20)),
      ev.on('pickup', (p) => fx.sparkle(p.x, p.y, LANE_Z[this.world.player.lane], p.kind === 'health' ? 0xff8a8a : p.kind === 'weapon' ? 0xffd48a : 0x9fe8ff, 10)),
      ev.on('intel', () => fx.sparkle(this.world.player.x, this.world.player.y + 0.5, this.world.player.z, 0x7fe8ff, 24)),
      ev.on('cache', () => fx.sparkle(this.world.player.x, this.world.player.y + 0.5, this.world.player.z, 0x5dff9a, 24)),
      ev.on('telegraph', (t) => {
        if (t.kind === 'missileTarget') this.bossView?.addMarker(t.x, t.y, t.z, t.duration);
        else if (t.kind === 'roar') fx.dust(t.x, t.y - 1, t.z, 0.6);
        else if (t.kind === 'bossStomp') fx.dust(t.x, t.y, t.z + 1, 0.6);
      }),
      ev.on('spawnFx', (s) => {
        if (s.kind === 'drop') {
          this.r.additive.spawn({ x: s.x, y: s.y + 6, z: s.z, life: 0.75, size0: 0.8, size1: 0.8, len: 14, r: 0.6, g: 2, b: 0.5, a0: 0.5, a1: 0, shape: Shape.Glow, vy: -0.01, stretch: true });
        } else if (s.kind === 'leap') {
          fx.dust(s.x, s.y, s.z, 0.3);
        }
      }),
      ev.on('boss', (b) => {
        if (b.phase === 'defeated') this.bossView?.shatter();
      }),
      ev.on('propDestroyed', (p) => {
        for (let i = 0; i < 20; i++) this.r.debris.spawn(p.x + rand(-p.w / 2, p.w / 2), p.y, p.z + rand(-0.5, 0.5), rand(-4, 4), rand(2, 7), rand(-2, 2), i % 3 ? p.color : 0xe8dcc0, rand(0.12, 0.28), rand(1.8, 3), 0.5);
      }),
    );
  }

  update(alpha: number, dt: number): void {
    this.time += dt;
    const time = this.time;
    for (const v of this.views.values()) v.update(alpha, dt, time);
    if (this.dying.length) {
      for (const v of this.dying) v.update(1, dt, time);
      const done = this.dying.filter((v) => !(v.removed && v.removed()));
      for (const v of done) v.dispose();
      this.dying = this.dying.filter((v) => !done.includes(v));
    }
    this.drawProjectiles(alpha, time);
    this.fx.update(dt);
  }

  private drawProjectiles(alpha: number, time: number): void {
    const add = this.r.additive;
    const lp = this.r.lightPool;
    for (const p of this.world.projectiles) {
      if (!p.alive) continue;
      const def = p.def;
      const x = lerp(p.px, p.x, alpha);
      const y = lerp(p.py, p.y, alpha);
      const z = LANE_Z[p.lane] + 0.15;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const dx = p.vx / sp;
      const dy = p.vy / sp;
      const glowC = colorOf(def.glow);
      const coreC = colorOf(def.color);
      const travelled = Math.hypot(x - p.startX, y - p.startY);
      const charged = p.charged ? 1.8 : 1;
      switch (def.kind) {
        case 'bullet':
        case 'slug':
        case 'pellet': {
          const len = Math.min(def.length, travelled);
          if (len < 0.05) break;
          add.quad(x - dx * len * 0.5, y - dy * len * 0.5, z, def.width * 3, len, dx, dy, glowC.r * 1.4, glowC.g * 1.4, glowC.b * 1.4, 0.35, Shape.Glow);
          add.quad(x - dx * len * 0.5, y - dy * len * 0.5, z + 0.01, def.width, len, dx, dy, coreC.r * 2.5, coreC.g * 2.5, coreC.b * 2.5, 1, Shape.Glow);
          break;
        }
        case 'rocket':
        case 'missile': {
          add.quad(x, y, z, 0.7, 0, 0, 0, glowC.r * 2, glowC.g * 2, glowC.b * 2, 0.9, Shape.Glow);
          add.quad(x - dx * 0.5, y - dy * 0.5, z + 0.01, 0.25, 1.2, dx, dy, 3, 2.4, 1.5, 1, Shape.Glow);
          if (Math.random() < 0.9) {
            this.r.alpha.spawn({ x: x - dx * 0.6, y: y - dy * 0.6, z: z - 0.05, vx: rand(-0.3, 0.3), vy: rand(0, 0.5), life: rand(0.8, 1.3), size0: 0.25, size1: 1.1, r: 0.65, g: 0.62, b: 0.62, a0: 0.45, a1: 0, rot: rand(0, 6), shape: Shape.Smoke });
            add.spawn({ x: x - dx * 0.4, y: y - dy * 0.4, z, vx: -dx * 3 + rand(-1, 1), vy: -dy * 3 + rand(-1, 1), life: 0.15, size0: 0.35, size1: 0.05, r: 2.4, g: 1.2, b: 0.4, a0: 1, a1: 0, shape: Shape.Glow });
          }
          lp.push({ x, y, z, color: def.glow, intensity: def.light, distance: 6 });
          break;
        }
        default: {
          // Energy bolts: glowing orb with a short comet tail.
          const w = def.width * charged * (1 + Math.sin(time * 40 + p.age * 10) * 0.08);
          add.quad(x - dx * def.length * 0.4, y - dy * def.length * 0.4, z, w * 0.9, def.length * charged, dx, dy, glowC.r * 1.6, glowC.g * 1.6, glowC.b * 1.6, 0.55, Shape.Glow);
          add.quad(x, y, z + 0.01, w * 1.7, 0, 0, 0, glowC.r * 1.8, glowC.g * 1.8, glowC.b * 1.8, 0.7, Shape.Glow);
          add.quad(x, y, z + 0.02, w * 0.6, 0, 0, 0, coreC.r * 2.6, coreC.g * 2.6, coreC.b * 2.6, 1, Shape.Glow);
          if (p.charged && Math.random() < 0.8) {
            add.spawn({ x, y, z, vx: rand(-1, 1), vy: rand(-1, 1), life: 0.3, size0: 0.15, size1: 0.02, r: glowC.r * 2, g: glowC.g * 2, b: glowC.b * 2, a0: 1, a1: 0, shape: Shape.Glow });
          }
          if (def.kind === 'shard') add.quad(x, y, z + 0.03, w * 1.2, 0, 0, 0, glowC.r * 2, glowC.g * 2, glowC.b * 2, 0.8, Shape.Star);
          if (def.light > 0) lp.push({ x, y, z, color: def.glow, intensity: def.light * charged, distance: 4.5 * charged });
        }
      }
    }
  }

  setHidden(hidden: boolean): void {
    if (this.playerView) this.playerView.hidden = hidden;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const v of this.views.values()) v.dispose();
    for (const v of this.dying) v.dispose();
    this.views.clear();
    this.dying = [];
    this.fx.clear();
    this.r.additive.clear();
    this.r.alpha.clear();
    this.r.debris.clear();
    this.r.shards.clear();
    this.r.lightPool.clear();
  }
}
