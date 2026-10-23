// Interactive level objects: explosive barrels, destructible cover, fuel tanks, hazards,
// crumbling platforms, energy barriers, checkpoints and every kind of pickup.
import type { Surface } from '../core/events';
import { clamp, rand } from '../core/math';
import { INTEL } from '../data/story';
import { GRENADES, WEAPONS } from '../data/weapons';
import { DamageResult, Damageable, Entity, NO_DAMAGE } from './entity';
import type { CoverSpot } from './enemy';
import type { Solid } from './physics';
import type { Interactable, Player } from './player';
import { DamageInfo, HitPart, Hurtbox, LANE_Z, LANE_BOTH, makeDamage } from './types';
import type { World } from './world';

const laneBits = (lane: number): number => (lane === 0 ? 1 : lane === 1 ? 2 : LANE_BOTH);

// ---------------------------------------------------------------------------
// Explosive barrel
// ---------------------------------------------------------------------------

export class Barrel extends Entity implements Damageable {
  readonly kind = 'prop' as const;
  readonly propType = 'barrel';
  faction = 'neutral' as const;
  surface: Surface = 'metal';
  hp = 30;
  fuse = -1;
  solid: Solid;
  w = 0.85;
  h = 1.15;
  hitT = 99;

  constructor(x: number, y: number, lane: number, world: World) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.z = this.pz = LANE_Z[lane];
    this.solid = world.solids.add({ x: x - this.w / 2, y, w: this.w, h: this.h, lanes: laneBits(lane), oneWay: false, style: 'metal', owner: this });
  }

  get alive(): boolean {
    return !this.removed && this.fuse < 0;
  }

  centerY(): number {
    return this.y + this.h / 2;
  }

  getHurtboxes(out: Hurtbox[]): void {
    out.push({ x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h, part: 'body' });
  }

  applyDamage(d: DamageInfo, _part: HitPart, world: World): DamageResult {
    if (!this.alive) return NO_DAMAGE;
    this.hp -= d.amount * (d.type === 'plasma' || d.type === 'energy' ? 1.5 : 1);
    this.hitT = 0;
    if (this.hp <= 0) {
      this.fuse = d.explosive ? 0.18 : 0.08;
      this.lastHitByPlayer = d.byPlayer;
    }
    void world;
    return { dealt: d.amount, shieldHit: false, headshot: false, killed: this.hp <= 0, blocked: false };
  }

  lastHitByPlayer = false;

  update(dt: number, world: World): void {
    this.hitT += dt;
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.removed = true;
        world.solids.remove(this.solid);
        world.explode({
          x: this.x,
          y: this.y + 0.6,
          lane: this.lane,
          radius: 4.4,
          damage: 125,
          kind: 'barrel',
          byPlayer: this.lastHitByPlayer,
          faction: 'neutral',
          sourceId: this.id,
          shieldMult: 1,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Destructible crate (cover)
// ---------------------------------------------------------------------------

export class Crate extends Entity implements Damageable {
  readonly kind = 'prop' as const;
  readonly propType: 'crate' | 'crateSmall';
  faction = 'neutral' as const;
  surface: Surface = 'paper';
  hp: number;
  maxHp: number;
  solid: Solid;
  cover: CoverSpot;
  w: number;
  h: number;
  hitT = 99;
  shake = 0;

  constructor(x: number, y: number, lane: number, small: boolean, world: World) {
    super();
    this.propType = small ? 'crateSmall' : 'crate';
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.z = this.pz = LANE_Z[lane];
    this.w = small ? 1.0 : 1.5;
    this.h = small ? 0.9 : 1.15;
    this.maxHp = this.hp = small ? 60 : 110;
    this.solid = world.solids.add({ x: x - this.w / 2, y, w: this.w, h: this.h, lanes: laneBits(lane), oneWay: false, style: 'wreck', owner: this, surface: 'paper' });
    this.cover = { x, w: this.w, h: this.h, lane, alive: true, claimedBy: [] };
    world.covers.push(this.cover);
  }

  get alive(): boolean {
    return !this.removed;
  }

  centerY(): number {
    return this.y + this.h / 2;
  }

  getHurtboxes(out: Hurtbox[]): void {
    out.push({ x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h, part: 'body' });
  }

  applyDamage(d: DamageInfo, _part: HitPart, world: World): DamageResult {
    if (this.removed) return NO_DAMAGE;
    const mult = d.explosive || d.type === 'explosive' ? 3 : d.type === 'melee' ? 2 : 1;
    this.hp -= d.amount * mult;
    this.hitT = 0;
    this.shake = 0.2;
    if (this.hp <= 0) this.destroy(world);
    return { dealt: d.amount, shieldHit: false, headshot: false, killed: this.hp <= 0, blocked: false };
  }

  destroy(world: World): void {
    if (this.removed) return;
    this.removed = true;
    this.cover.alive = false;
    world.solids.remove(this.solid);
    world.events.emit('propDestroyed', { x: this.x, y: this.y + this.h / 2, z: this.z, kind: 'crate', color: 0x8b7a55, w: this.w, h: this.h });
    if (Math.random() < 0.3) world.spawnPickup({ type: 'ammo', x: this.x, y: this.y + 0.3, lane: this.lane }, true);
  }

  update(dt: number): void {
    this.hitT += dt;
    this.shake = Math.max(0, this.shake - dt);
  }
}

/** Indestructible cover (barricades, sandbags): a solid plus an AI cover spot. */
export class StaticCover extends Entity {
  readonly kind = 'prop' as const;
  readonly propType: 'barricade' | 'sandbags';
  solid: Solid;
  cover: CoverSpot;
  w: number;
  h: number;

  constructor(x: number, y: number, lane: number, type: 'barricade' | 'sandbags', world: World) {
    super();
    this.propType = type;
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.z = this.pz = LANE_Z[lane];
    this.w = type === 'barricade' ? 1.7 : 2.0;
    this.h = type === 'barricade' ? 1.1 : 0.95;
    this.solid = world.solids.add({ x: x - this.w / 2, y, w: this.w, h: this.h, lanes: laneBits(lane), oneWay: false, style: 'concrete', owner: this });
    this.cover = { x, w: this.w, h: this.h, lane, alive: true, claimedBy: [] };
    world.covers.push(this.cover);
  }

  update(): void {}
}

// ---------------------------------------------------------------------------
// Fuel tank (boss arena environmental weapon)
// ---------------------------------------------------------------------------

export class FuelTank extends Entity implements Damageable {
  readonly kind = 'prop' as const;
  readonly propType = 'fuelTank';
  faction = 'neutral' as const;
  surface: Surface = 'metal';
  hp = 90;
  maxHp = 90;
  fuse = -1;
  hitT = 99;
  w = 2.0;
  h = 3.2;
  byPlayer = false;

  constructor(x: number, y: number, lane: number) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.z = this.pz = LANE_Z[lane];
  }

  get alive(): boolean {
    return !this.removed && this.fuse < 0;
  }

  centerY(): number {
    return this.y + this.h / 2;
  }

  getHurtboxes(out: Hurtbox[]): void {
    out.push({ x: this.x - this.w / 2, y: this.y, w: this.w, h: this.h, part: 'body' });
  }

  applyDamage(d: DamageInfo, _part: HitPart, world: World): DamageResult {
    if (!this.alive) return NO_DAMAGE;
    // Only the player (or explosions) can rupture the tanks; stray boss fire doesn't.
    if (!d.byPlayer && !d.explosive) return NO_DAMAGE;
    this.hp -= d.amount * (d.explosive ? 2 : 1);
    this.hitT = 0;
    if (this.hp <= 0) {
      this.fuse = 0.35;
      this.byPlayer = d.byPlayer;
    }
    void world;
    return { dealt: d.amount, shieldHit: false, headshot: false, killed: this.hp <= 0, blocked: false };
  }

  update(dt: number, world: World): void {
    this.hitT += dt;
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.removed = true;
        world.explode({
          x: this.x,
          y: this.y + 1.6,
          lane: this.lane,
          radius: 6.5,
          damage: 140,
          kind: 'tank',
          byPlayer: this.byPlayer,
          faction: 'neutral',
          sourceId: this.id,
          shieldMult: 1,
        });
        const boss = world.boss;
        if (boss && Math.abs(boss.x - this.x) < 7.5) boss.tankBlast(world);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------

export class PlasmaVent extends Entity {
  readonly kind = 'hazard' as const;
  readonly hazardType = 'vent';
  period: number;
  offset: number;
  /** 'idle' | 'warn' | 'erupt' */
  phase = 'idle';
  phaseT = 0;
  width = 1.3;
  height = 5.5;
  lanes: number;

  constructor(x: number, y: number, lane: number, period: number, offset: number) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.lanes = laneBits(lane);
    this.z = this.pz = lane === 2 ? -1.6 : LANE_Z[lane];
    this.period = period;
    this.offset = offset;
  }

  update(dt: number, world: World): void {
    const cycle = (world.time + this.offset) % this.period;
    const eruptLen = 1.3;
    const warnLen = 0.9;
    const prev = this.phase;
    if (cycle < this.period - eruptLen - warnLen) this.phase = 'idle';
    else if (cycle < this.period - eruptLen) this.phase = 'warn';
    else this.phase = 'erupt';
    if (prev !== this.phase) {
      this.phaseT = 0;
      if (Math.abs(world.player.x - this.x) < 30) world.events.emit('hazard', { kind: 'vent', x: this.x, y: this.y, phase: this.phase });
    }
    this.phaseT += dt;
    if (this.phase === 'erupt') {
      for (const a of world.actorsNear(this.x, 3)) {
        if (a.dead || ((1 << a.lane) & this.lanes) === 0) continue;
        if (Math.abs(a.x - this.x) < this.width / 2 + a.w / 2 - 0.1 && a.y < this.y + this.height && a.y + a.h > this.y) {
          if (a.lastHit > 0.3) {
            world.damageTarget(
              a,
              'body',
              makeDamage({ amount: 18, type: 'hazard', dirX: Math.sign(a.x - this.x) || 1, dirY: 1, x: a.x, y: a.y + 1, knockback: 2.5, sourceFaction: 'neutral' }),
            );
          }
          a.vy = Math.max(a.vy, 9);
        }
      }
    }
  }
}

export class CrumblePlatform extends Entity {
  readonly kind = 'hazard' as const;
  readonly hazardType = 'crumble';
  solid: Solid;
  state: 'solid' | 'shaking' | 'fallen' = 'solid';
  t = 0;
  fallY = 0;
  fallV = 0;
  w: number;
  h: number;
  baseY: number;

  constructor(x: number, y: number, w: number, h: number, lanes: number, world: World) {
    super();
    this.x = this.px = x + w / 2;
    this.y = this.py = y;
    this.baseY = y;
    this.w = w;
    this.h = h;
    this.lane = lanes === 2 ? 1 : 0;
    this.z = this.pz = lanes === 3 ? -1.6 : LANE_Z[this.lane];
    this.solid = world.solids.add({ x, y, w, h, lanes, oneWay: false, style: 'floating', owner: this });
  }

  update(dt: number, world: World): void {
    this.t += dt;
    switch (this.state) {
      case 'solid': {
        const standing = world.actorsNear(this.x, this.w).some((a) => a.groundSolid === this.solid && !a.dead);
        if (standing) {
          this.state = 'shaking';
          this.t = 0;
          world.events.emit('platform', { kind: 'crumble', x: this.x, y: this.y + this.h, w: this.w });
        }
        break;
      }
      case 'shaking':
        if (this.t > 0.7) {
          this.state = 'fallen';
          this.t = 0;
          this.solid.enabled = false;
          this.fallV = 0;
          world.events.emit('platform', { kind: 'fall', x: this.x, y: this.y + this.h, w: this.w });
        }
        break;
      case 'fallen':
        this.fallV += 30 * dt;
        this.fallY += this.fallV * dt;
        if (this.t > 4.5) {
          // Restore once nothing occupies the space.
          const blocked = world.actorsNear(this.x, this.w).some(
            (a) => Math.abs(a.x - this.x) < this.w / 2 + a.w / 2 && a.y < this.baseY + this.h + 0.1 && a.y + a.h > this.baseY,
          );
          if (!blocked) {
            this.state = 'solid';
            this.t = 0;
            this.fallY = 0;
            this.solid.enabled = true;
            world.events.emit('platform', { kind: 'restore', x: this.x, y: this.y + this.h, w: this.w });
          }
        }
        break;
    }
  }
}

export class Barrier extends Entity {
  readonly kind = 'hazard' as const;
  readonly hazardType = 'barrier';
  solid: Solid;
  on = false;
  t = 0;
  height = 9;

  constructor(x: number, y: number, world: World) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = -1.6;
    this.solid = world.solids.add({ x: x - 0.3, y, w: 0.6, h: this.height, lanes: LANE_BOTH, oneWay: false, style: 'metal', owner: this, enabled: false, surface: 'energy' });
  }

  set(on: boolean, world: World): void {
    if (this.on === on) return;
    this.on = on;
    this.t = 0;
    this.solid.enabled = on;
    world.events.emit('barrier', { on, x: this.x });
  }

  update(dt: number): void {
    this.t += dt;
  }
}

export class CheckpointBeacon extends Entity {
  readonly kind = 'prop' as const;
  readonly propType = 'checkpoint';
  active = false;
  t = 0;

  constructor(
    public checkpointId: string,
    x: number,
    y: number,
    lane: number,
  ) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.z = this.pz = LANE_Z[lane] - 0.9;
  }

  update(dt: number, world: World): void {
    this.t += dt;
    if (!this.active && Math.abs(world.player.x - this.x) < 1.8 && !world.player.dead && Math.abs(world.player.y - this.y) < 3) {
      this.active = true;
      this.t = 0;
      world.reachCheckpoint(this.checkpointId, this.x, this.y);
    }
  }
}

// ---------------------------------------------------------------------------
// Pickups & collectibles
// ---------------------------------------------------------------------------

export type PickupType = 'weapon' | 'ammo' | 'grenades' | 'health' | 'intel' | 'cache' | 'ordnance';

export interface PickupInit {
  type: PickupType;
  x: number;
  y: number;
  lane: number;
  id?: string;
  weapon?: string;
  mag?: number;
  reserve?: number;
  grenade?: string;
  count?: number;
  rp?: number;
}

export class Pickup extends Entity implements Interactable {
  readonly kind = 'pickup' as const;
  ptype: PickupType;
  levelId: string | null;
  weaponId: string | null;
  mag: number | undefined;
  reserve: number | undefined;
  grenadeType: string;
  count: number;
  rp: number;
  dropped: boolean;
  life = 40;
  vy = 0;
  grounded = false;
  interactRange = 1.3;
  opened = false;
  openT = 0;
  cooldown = 0;
  age = 0;
  spin = Math.random() * 6;

  constructor(init: PickupInit, dropped: boolean) {
    super();
    this.ptype = init.type;
    this.x = this.px = init.x;
    this.y = this.py = init.y;
    this.lane = init.lane;
    this.z = this.pz = LANE_Z[init.lane];
    this.levelId = init.id ?? null;
    this.weaponId = init.weapon ?? null;
    this.mag = init.mag;
    this.reserve = init.reserve;
    this.grenadeType = init.grenade ?? 'frag';
    this.count = init.count ?? 2;
    this.rp = init.rp ?? 0;
    this.dropped = dropped;
    if (dropped) this.vy = 4;
    if (this.ptype === 'cache' || this.ptype === 'ordnance') this.interactRange = 1.6;
    if (this.ptype === 'ordnance') this.z = this.pz = LANE_Z[init.lane] - 0.7;
  }

  get label(): string {
    switch (this.ptype) {
      case 'weapon':
        return WEAPONS[this.weaponId!]?.name ?? 'Weapon';
      case 'ammo':
        return 'Ammunition';
      case 'grenades':
        return GRENADES[this.grenadeType]?.name ?? 'Grenades';
      case 'health':
        return 'Field Medkit';
      case 'intel':
        return INTEL[this.levelId ?? '']?.title ?? 'Intel';
      case 'cache':
        return 'Supply Cache';
      case 'ordnance':
        return 'Ordnance Locker';
    }
  }

  prompt(player: Player): string | null {
    switch (this.ptype) {
      case 'weapon': {
        if (!this.weaponId) return null;
        if (player.hasWeapon(this.weaponId)) return null;
        if (player.weapons.some((w) => w === null)) return null;
        return `Swap for ${this.label}`;
      }
      case 'intel':
        return 'Recover Intel';
      case 'cache':
        return this.opened ? null : 'Open Supply Cache';
      case 'ordnance':
        return this.cooldown > 0 ? null : player.hasWeapon('rocket') ? 'Restock Rockets' : 'Take RL-6 Hammerfall';
      default:
        return null;
    }
  }

  touch(player: Player, world: World): void {
    if (this.age < 0.35 && this.dropped) return;
    switch (this.ptype) {
      case 'weapon': {
        const id = this.weaponId!;
        const have = player.hasWeapon(id);
        if (have) {
          const amount = have.isBattery ? (this.mag ?? have.def.magSize) : (this.mag ?? 0) + (this.reserve ?? have.def.magSize);
          const got = have.addAmmo(amount);
          if (got > 0) {
            world.events.emit('pickup', { kind: 'ammo', label: `${have.def.short} ammo`, x: this.x, y: this.y });
            this.consume(world);
          }
        } else if (player.weapons.some((w) => w === null)) {
          player.giveWeapon(id, this.mag, this.reserve, world);
          world.onWeaponAcquired(id);
          world.events.emit('pickup', { kind: 'weapon', label: this.label, x: this.x, y: this.y });
          this.consume(world);
        }
        break;
      }
      case 'ammo': {
        let got = 0;
        for (const w of player.weapons) {
          if (w && !w.isBattery) got += w.addAmmo(Math.ceil(w.reserveCap * 0.4));
        }
        if (got > 0) {
          world.events.emit('pickup', { kind: 'ammo', label: 'Ammunition', x: this.x, y: this.y });
          this.consume(world);
        }
        break;
      }
      case 'grenades': {
        const have = player.grenades[this.grenadeType] ?? 0;
        if (have < player.grenadeMax) {
          player.grenades[this.grenadeType] = Math.min(player.grenadeMax, have + this.count);
          if ((player.grenades[player.grenadeType] ?? 0) <= 0) player.grenadeType = this.grenadeType;
          world.events.emit('pickup', { kind: 'grenade', label: this.label, x: this.x, y: this.y });
          this.consume(world);
        }
        break;
      }
      case 'health':
        if (player.health < player.maxHealth) {
          player.health = Math.min(player.maxHealth, player.health + 60);
          world.events.emit('pickup', { kind: 'health', label: 'Field Medkit', x: this.x, y: this.y });
          this.consume(world);
        }
        break;
      default:
        break;
    }
  }

  interact(player: Player, world: World): void {
    switch (this.ptype) {
      case 'weapon': {
        const cur = player.weapon;
        if (!cur || !this.weaponId) return;
        // Drop the current weapon in exchange.
        world.spawnPickup(
          { type: 'weapon', x: player.x, y: player.y + 0.5, lane: player.lane, weapon: cur.def.id, mag: cur.mag, reserve: cur.reserve },
          true,
        );
        player.giveWeapon(this.weaponId, this.mag, this.reserve, world);
        world.onWeaponAcquired(this.weaponId);
        world.events.emit('pickup', { kind: 'weapon', label: this.label, x: this.x, y: this.y });
        this.consume(world);
        break;
      }
      case 'intel':
        world.collectIntel(this.levelId ?? '', this);
        this.consume(world);
        break;
      case 'cache':
        if (this.opened) return;
        this.opened = true;
        world.openCache(this);
        break;
      case 'ordnance': {
        if (this.cooldown > 0) return;
        const rl = player.hasWeapon('rocket');
        if (rl) {
          rl.mag = rl.def.magSize;
          rl.reserve = rl.reserveCap;
          world.events.emit('pickup', { kind: 'ammo', label: 'Rockets restocked', x: this.x, y: this.y });
        } else {
          if (player.weapons.some((w) => w === null)) {
            player.giveWeapon('rocket', undefined, undefined, world);
          } else {
            const cur = player.weapon!;
            world.spawnPickup({ type: 'weapon', x: player.x, y: player.y + 0.5, lane: player.lane, weapon: cur.def.id, mag: cur.mag, reserve: cur.reserve }, true);
            player.giveWeapon('rocket', undefined, undefined, world);
          }
          world.onWeaponAcquired('rocket');
          world.events.emit('pickup', { kind: 'weapon', label: WEAPONS.rocket.name, x: this.x, y: this.y });
        }
        this.cooldown = 20;
        break;
      }
      default:
        break;
    }
  }

  private consume(world: World): void {
    this.removed = true;
    if (this.levelId) world.collected.add(this.levelId);
  }

  update(dt: number, world: World): void {
    this.age += dt;
    this.spin += dt * 1.6;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.opened) this.openT = clamp(this.openT + dt * 1.5, 0, 1);
    if (this.dropped) {
      this.life -= dt;
      if (this.life <= 0) {
        this.removed = true;
        return;
      }
      if (!this.grounded) {
        this.vy -= 30 * dt;
        const ny = this.y + this.vy * dt;
        const g = world.solids.groundBelow(this.x, this.y + 0.05, this.lane === 0 ? 1 : 2, 3);
        if (g !== null && ny <= g) {
          this.y = g;
          this.grounded = true;
          this.vy = 0;
        } else {
          this.y = ny;
        }
        if (this.y < world.level.killY) this.removed = true;
      }
    }
  }
}

/** Randomised drop table helper used by the world when enemies die. */
export function rollDrops(drops: { kind: string; id?: string; chance: number }[]): { kind: string; id?: string }[] {
  const out: { kind: string; id?: string }[] = [];
  for (const d of drops) if (Math.random() < d.chance) out.push(d);
  return out;
}

export const randomOffset = (): number => rand(-0.6, 0.6);
