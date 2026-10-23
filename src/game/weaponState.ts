// Runtime state of a carried weapon: ammunition, cooldowns, reloads, heat and charge.
// All tuning comes from WeaponDef so this class is shared by every gun in the game.
import { DEG, rand } from '../core/math';
import { WeaponDef, getWeapon } from '../data/weapons';
import type { Damageable } from './entity';
import type { Faction } from './types';
import type { World } from './world';

export interface FireContext {
  x: number;
  y: number;
  /** Fallback origin used when the muzzle is inside geometry. */
  originX: number;
  originY: number;
  angle: number;
  lane: number;
  faction: Faction;
  byPlayer: boolean;
  sourceId: number;
  spreadMult: number;
  damageMult: number;
  headshotMult: number;
  speedMult: number;
  homingTarget?: Damageable | null;
}

export interface TriggerState {
  pressed: boolean;
  held: boolean;
  released: boolean;
}

export class WeaponState {
  readonly def: WeaponDef;
  mag: number;
  reserve: number;
  reserveCap: number;
  cooldown = 0;
  burstLeft = 0;
  burstTimer = 0;
  reloadT = 0;
  reloading = false;
  private reloadPhase = 0;
  bloom = 0;
  heat = 0;
  overheatT = 0;
  chargeT = 0;
  charging = false;
  private holdT = 0;
  private pressBuffer = 0;
  /** Visual recoil impulse 0..1 consumed by views. */
  recoil = 0;
  lastShot = 99;
  shotsFired = 0;

  constructor(id: string, mag?: number, reserve?: number, reserveMult = 1) {
    this.def = getWeapon(id);
    this.reserveCap = Math.round(this.def.reserveMax * (this.def.battery ? 1 : reserveMult));
    this.mag = mag ?? this.def.magSize;
    this.reserve = reserve ?? this.reserveCap;
  }

  get isBattery(): boolean {
    return !!this.def.battery;
  }

  get empty(): boolean {
    return this.mag <= 0 && this.reserve <= 0;
  }

  /** 0..1 fraction of total ammunition (for HUD / AI). */
  get ammoFraction(): number {
    const total = this.def.magSize + this.reserveCap;
    return total > 0 ? (this.mag + this.reserve) / total : 0;
  }

  get reloadProgress(): number {
    if (!this.reloading) return 0;
    return 1 - this.reloadT / this.reloadDuration();
  }

  private reloadDuration(): number {
    return this.def.perShellReload ? this.def.reloadTime : this.def.reloadTime;
  }

  update(dt: number, world: World, x: number, y: number, byPlayer: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.lastShot += dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.pressBuffer = Math.max(0, this.pressBuffer - dt);
    if (this.lastShot > 0.08) this.bloom = Math.max(0, this.bloom - this.def.spreadRecovery * dt);
    const bat = this.def.battery;
    if (bat) {
      if (this.overheatT > 0) {
        this.overheatT -= dt;
        if (this.overheatT <= 0) this.heat = 0.35;
      } else if (this.lastShot > 0.15 && !this.charging) {
        this.heat = Math.max(0, this.heat - bat.coolRate * dt);
      }
    }
    if (this.reloading) {
      this.reloadT -= dt;
      const dur = this.reloadDuration();
      const p = 1 - this.reloadT / dur;
      if (this.def.perShellReload) {
        if (this.reloadT <= 0) {
          if (this.reserve > 0 && this.mag < this.def.magSize) {
            this.mag++;
            this.reserve--;
            world.events.emit('reload', { weaponId: this.def.id, phase: 'mag-in', byPlayer, x, y });
          }
          if (this.mag >= this.def.magSize || this.reserve <= 0) {
            this.reloading = false;
            world.events.emit('reload', { weaponId: this.def.id, phase: 'done', byPlayer, x, y });
          } else {
            this.reloadT = dur;
          }
        }
      } else {
        if (this.reloadPhase === 0 && p > 0.25) {
          this.reloadPhase = 1;
          world.events.emit('reload', { weaponId: this.def.id, phase: 'mag-out', byPlayer, x, y });
        }
        if (this.reloadPhase === 1 && p > 0.72) {
          this.reloadPhase = 2;
          world.events.emit('reload', { weaponId: this.def.id, phase: 'mag-in', byPlayer, x, y });
        }
        if (this.reloadT <= 0) {
          const need = this.def.magSize - this.mag;
          const take = Math.min(need, this.reserve);
          this.mag += take;
          this.reserve -= take;
          this.reloading = false;
          world.events.emit('reload', { weaponId: this.def.id, phase: 'done', byPlayer, x, y });
        }
      }
    }
  }

  canReload(): boolean {
    return !this.isBattery && !this.reloading && this.mag < this.def.magSize && this.reserve > 0;
  }

  startReload(world: World, x: number, y: number, byPlayer: boolean): boolean {
    if (!this.canReload()) return false;
    this.reloading = true;
    this.reloadPhase = 0;
    this.reloadT = this.reloadDuration();
    this.burstLeft = 0;
    this.charging = false;
    this.chargeT = 0;
    world.events.emit('reload', { weaponId: this.def.id, phase: 'start', byPlayer, x, y });
    return true;
  }

  cancelReload(): void {
    this.reloading = false;
    this.reloadPhase = 0;
  }

  /** Interrupt a shell-by-shell reload when the player wants to shoot. */
  private interruptible(): boolean {
    return this.reloading && !!this.def.perShellReload && this.mag > 0;
  }

  addAmmo(amount: number): number {
    if (this.isBattery) {
      const before = this.mag;
      this.mag = Math.min(this.def.magSize, this.mag + amount);
      return this.mag - before;
    }
    const before = this.reserve;
    this.reserve = Math.min(this.reserveCap, this.reserve + amount);
    return this.reserve - before;
  }

  /**
   * Process trigger input. Returns the number of projectiles launched.
   * Handles automatic, burst, semi, pump and charge firing modes.
   */
  trigger(t: TriggerState, ctx: FireContext, world: World): number {
    const def = this.def;
    if (t.pressed) this.pressBuffer = 0.12;
    if (this.interruptible() && (t.pressed || this.pressBuffer > 0)) this.cancelReload();
    if (this.reloading) return 0;
    if (this.overheatT > 0) {
      this.charging = false;
      this.chargeT = 0;
      return 0;
    }

    let fired = 0;
    // Continue an in-progress burst.
    if (this.burstLeft > 0) {
      this.burstTimer -= world.dt;
      if (this.burstTimer <= 0) {
        if (this.mag > 0) {
          fired += this.shoot(ctx, world, false);
          this.burstLeft--;
          this.burstTimer = def.burst!.interval;
        } else {
          this.burstLeft = 0;
        }
        if (this.burstLeft === 0) this.cooldown = 60 / def.rpm;
      }
      return fired;
    }

    if (this.cooldown > 0) {
      if (def.fireMode === 'charge') this.updateCharge(t, ctx, world);
      return 0;
    }

    const wantsShot =
      def.fireMode === 'auto'
        ? t.held
        : def.fireMode === 'burst'
          ? t.held || this.pressBuffer > 0
          : this.pressBuffer > 0;

    if (def.fireMode === 'charge') {
      // Tap fires immediately; holding builds an overcharge released on trigger-up.
      if (this.pressBuffer > 0 && !this.charging) {
        this.pressBuffer = 0;
        if (this.mag <= 0) return this.dry(world, ctx);
        fired += this.shoot(ctx, world, false);
        this.cooldown = 60 / def.rpm;
        this.holdT = 0;
        return fired;
      }
      return this.updateCharge(t, ctx, world);
    }

    if (!wantsShot) return 0;
    this.pressBuffer = 0;
    if (this.mag <= 0) return this.dry(world, ctx);

    if (def.fireMode === 'burst' && def.burst) {
      fired += this.shoot(ctx, world, false);
      this.burstLeft = def.burst.count - 1;
      this.burstTimer = def.burst.interval;
      if (this.burstLeft === 0) this.cooldown = 60 / def.rpm;
      return fired;
    }

    fired += this.shoot(ctx, world, false);
    this.cooldown = 60 / def.rpm;
    return fired;
  }

  private updateCharge(t: TriggerState, ctx: FireContext, world: World): number {
    const ch = this.def.charge;
    if (!ch) return 0;
    if (t.held) {
      this.holdT += world.dt;
      if (!this.charging && this.holdT > 0.22 && this.mag >= ch.cost) {
        this.charging = true;
        this.chargeT = 0;
        world.events.emit('chargeStart', { weaponId: this.def.id, x: ctx.x, y: ctx.y });
      }
      if (this.charging) {
        this.chargeT = Math.min(ch.time, this.chargeT + world.dt);
        if (this.chargeT >= ch.time) {
          // Holding a full charge slowly heats the weapon.
          this.heat += world.dt * 0.12;
          if (this.heat >= 1) this.overheat(world, ctx);
        }
      }
      return 0;
    }
    this.holdT = 0;
    if (this.charging) {
      const full = this.chargeT >= ch.time;
      this.charging = false;
      this.chargeT = 0;
      if (full && this.cooldown <= 0) {
        const n = this.shoot(ctx, world, true);
        this.cooldown = 0.45;
        return n;
      }
    }
    return 0;
  }

  private dry(world: World, ctx: FireContext): number {
    this.cooldown = 0.25;
    world.events.emit('dryFire', { weaponId: this.def.id });
    if (!this.isBattery && this.reserve > 0) this.startReload(world, ctx.x, ctx.y, ctx.byPlayer);
    return 0;
  }

  private overheat(world: World, ctx: FireContext): void {
    const bat = this.def.battery!;
    this.overheatT = bat.overheatTime;
    this.heat = 1;
    this.charging = false;
    this.chargeT = 0;
    world.events.emit('overheat', { weaponId: this.def.id, x: ctx.x, y: ctx.y });
  }

  private shoot(ctx: FireContext, world: World, charged: boolean): number {
    const def = this.def;
    const bat = def.battery;
    if (bat) {
      const cost = charged && def.charge ? def.charge.cost : bat.perShot;
      this.mag = Math.max(0, this.mag - cost);
      this.heat += charged ? 0.35 : bat.heatPerShot;
    } else {
      this.mag--;
    }
    this.lastShot = 0;
    this.shotsFired++;
    this.recoil = 1;
    const spreadDeg = (def.spread + this.bloom) * ctx.spreadMult;
    this.bloom = Math.min(def.spreadMax - def.spread, this.bloom + def.spreadPerShot);

    // If the muzzle sits inside geometry, fire from the shoulder so shots can't pass through walls.
    let sx = ctx.x;
    let sy = ctx.y;
    const mask = ctx.lane === 0 ? 1 : 2;
    const block = world.solids.raycast(ctx.originX, ctx.originY, ctx.x, ctx.y, mask);
    if (block) {
      sx = ctx.originX + (block.x - ctx.originX) * 0.9;
      sy = ctx.originY + (block.y - ctx.originY) * 0.9;
    }

    const pellets = Math.max(1, def.pellets);
    for (let i = 0; i < pellets; i++) {
      let a = ctx.angle;
      if (pellets > 1) {
        // Even fan with jitter so shotgun patterns are readable but not uniform.
        const f = pellets === 1 ? 0 : i / (pellets - 1) - 0.5;
        a += (f * spreadDeg + rand(-0.35, 0.35) * spreadDeg * 0.4) * DEG;
      } else {
        a += rand(-0.5, 0.5) * spreadDeg * DEG;
      }
      const p = def.projectile;
      const speed = p.speed * ctx.speedMult * (charged && def.charge ? def.charge.speedMult : 1);
      world.spawnProjectile({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        lane: ctx.lane,
        def: p,
        damage: (charged && def.charge ? def.charge.damage : def.damage) * ctx.damageMult,
        faction: ctx.faction,
        byPlayer: ctx.byPlayer,
        sourceId: ctx.sourceId,
        headshotMult: def.headshotMult * ctx.headshotMult,
        shieldMult: def.shieldMult,
        armorMult: def.armorMult,
        weaponId: def.id,
        charged,
        homing: charged && def.charge ? def.charge.homing : (p.homing ?? 0),
        homingTarget: charged ? (ctx.homingTarget ?? null) : null,
        stripShield: charged && def.charge ? def.charge.stripShield : false,
        stun: charged ? 2.5 : 0,
        falloff: def.falloff,
      });
    }
    world.events.emit('shot', {
      weaponId: def.id,
      x: sx,
      y: sy,
      z: world.laneDepth(ctx.lane),
      angle: ctx.angle,
      byPlayer: ctx.byPlayer,
      charged,
    });
    if (bat && this.heat >= 1) this.overheat(world, ctx);
    return pellets;
  }
}
