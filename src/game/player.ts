// The Warden-Commando: movement, lanes, shields, weapons, grenades, melee and interaction.
import { clamp, damp, moveToward } from '../core/math';
import { GRENADES, WEAPONS } from '../data/weapons';
import { Actor, DamageResult, Damageable, NO_DAMAGE } from './entity';
import { hostile } from './projectile';
import { DamageInfo, GRAVITY, HitPart, Hurtbox, LANE_Z, makeDamage } from './types';
import { TriggerState, WeaponState } from './weaponState';
import type { World } from './world';
import { Grenade } from './grenade';

export interface PlayerControls {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  crouchPressed: boolean;
  sprintHeld: boolean;
  fire: TriggerState;
  grenadePressed: boolean;
  meleePressed: boolean;
  reloadPressed: boolean;
  interactPressed: boolean;
  switchPressed: boolean;
  cycleGrenadePressed: boolean;
  laneIn: boolean;
  laneOut: boolean;
  aimX: number;
  aimY: number;
}

export const emptyControls = (aimX = 0, aimY = 0): PlayerControls => ({
  moveX: 0,
  jumpPressed: false,
  jumpHeld: false,
  crouchHeld: false,
  crouchPressed: false,
  sprintHeld: false,
  fire: { pressed: false, held: false, released: false },
  grenadePressed: false,
  meleePressed: false,
  reloadPressed: false,
  interactPressed: false,
  switchPressed: false,
  cycleGrenadePressed: false,
  laneIn: false,
  laneOut: false,
  aimX,
  aimY,
});

export interface Interactable {
  id: number;
  x: number;
  y: number;
  lane: number;
  removed: boolean;
  interactRange: number;
  /** Prompt text, or null if the player cannot use it right now. */
  prompt(player: Player): string | null;
  interact(player: Player, world: World): void;
  /** Touching the item (no button press). */
  touch?(player: Player, world: World): void;
}

export type PlayerAnim = 'idle' | 'run' | 'sprint' | 'crouch' | 'jump' | 'fall' | 'roll' | 'dead' | 'victory';

const RUN = 6.2;
const SPRINT = 9.4;
const CROUCH_SPEED = 2.4;
const ACC_GROUND = 60;
const ACC_AIR = 30;
const JUMP_V = 12.9;
const COYOTE = 0.11;
const JUMP_BUFFER = 0.13;
const STAND_H = 1.9;
const CROUCH_H = 1.2;
const ROLL_TIME = 0.46;
const ROLL_IFRAMES = 0.3;
const MELEE_TIME = 0.44;
const THROW_TIME = 0.42;

export class Player extends Actor {
  readonly kind = 'player' as const;
  controls: PlayerControls = emptyControls();
  weapons: (WeaponState | null)[] = [null, null];
  current = 0;
  grenades: Record<string, number> = { frag: 2, plasma: 0 };
  grenadeType = 'frag';
  grenadeMax = 4;
  aimAngle = 0;
  aimWorldX = 0;
  aimWorldY = 0;
  anim: PlayerAnim = 'idle';
  runPhase = 0;
  crouching = false;
  sprinting = false;
  sprintRecover = 0;
  rollT = 0;
  rollDir = 1;
  rollCooldown = 0;
  meleeT = 0;
  private meleeDone = false;
  throwT = 0;
  private thrown = false;
  switchT = 0;
  switchDur = 0;
  private switchTo = -1;
  /** Moment of weapon model swap during a switch animation (0..1) */
  switchSwapped = true;
  landImpact = 0;
  airTime = 0;
  hurtT = 0;
  invuln = 0;
  coyote = 0;
  jumpBuffer = 0;
  laneCooldown = 0;
  laneBlockedT = 0;
  healthRegenTimer = 0;
  interactTarget: Interactable | null = null;
  interactPrompt: string | null = null;
  lastSafe = { x: 0, y: 0, lane: 0 };
  frozen = false;
  victory = false;
  recoilAngle = 0;
  /** Seconds since last shot (views keep the weapon raised). */
  lastFire = 99;
  /** For HUD: per-weapon hit tracking. */
  shieldBrokenFlag = false;
  lowHealthFlag = false;
  godMode = false;
  /** Upgrade multipliers. */
  shieldDelayMult = 1;
  headshotMult = 1;
  reserveMult = 1;
  footTimer = 0;

  constructor(x: number, y: number, lane: number) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.lane = lane;
    this.laneFrom = lane;
    this.z = this.pz = LANE_Z[lane];
    this.w = 0.72;
    this.h = STAND_H;
    this.faction = 'player';
    this.surface = 'armor';
    this.maxHealth = this.health = 100;
    this.maxShield = this.shield = 100;
    this.shieldDelay = 4;
    this.shieldRate = 48;
    this.lastSafe = { x, y, lane };
  }

  get weapon(): WeaponState | null {
    return this.weapons[this.current];
  }

  get otherWeapon(): WeaponState | null {
    return this.weapons[1 - this.current];
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }

  shoulderY(): number {
    return this.y + this.h * (this.crouching ? 0.72 : 0.76);
  }

  muzzleLength(): number {
    const w = this.weapon;
    if (!w) return 0.9;
    switch (w.def.model) {
      case 'ember':
        return 0.75;
      case 'shotgun':
        return 1.15;
      case 'sniper':
        return 1.55;
      case 'rocket':
        return 1.2;
      case 'br':
        return 1.2;
      default:
        return 1.1;
    }
  }

  giveWeapon(id: string, mag?: number, reserve?: number, world?: World): void {
    const ws = new WeaponState(id, mag, reserve, this.reserveMult);
    const empty = this.weapons.findIndex((w) => w === null);
    if (empty >= 0) {
      this.weapons[empty] = ws;
      if (world) this.beginSwitch(empty, world);
      else this.current = empty;
    } else {
      this.weapons[this.current] = ws;
      if (world) {
        this.switchT = this.switchDur = 0.35 + ws.def.readyTime * 0.4;
        this.switchSwapped = true;
        world.events.emit('weaponSwitch', { weaponId: id });
      }
    }
  }

  hasWeapon(id: string): WeaponState | null {
    for (const w of this.weapons) if (w && w.def.id === id) return w;
    return null;
  }

  private beginSwitch(slot: number, world: World): void {
    const target = this.weapons[slot];
    if (!target) return;
    this.weapon?.cancelReload();
    if (this.weapon) {
      this.weapon.charging = false;
      this.weapon.chargeT = 0;
    }
    this.switchTo = slot;
    this.switchDur = 0.3 + target.def.readyTime * 0.5;
    this.switchT = this.switchDur;
    this.switchSwapped = false;
    world.events.emit('weaponSwitch', { weaponId: target.def.id });
  }

  getHurtboxes(out: Hurtbox[]): void {
    if (this.dead) return;
    if (this.rollT > ROLL_TIME - ROLL_IFRAMES || this.invuln > 0) return;
    const h = this.crouching || this.rolling ? CROUCH_H : STAND_H;
    const hw = this.w / 2;
    out.push({ x: this.x - hw * 0.8, y: this.y + h - 0.38, w: this.w * 0.8, h: 0.38, part: 'head' });
    out.push({ x: this.x - hw, y: this.y, w: this.w, h: h - 0.38, part: 'body' });
  }

  applyDamage(d: DamageInfo, part: HitPart, world: World): DamageResult {
    if (this.dead || this.godMode || world.cinematic) return NO_DAMAGE;
    if (this.invuln > 0 && d.type !== 'fall') return NO_DAMAGE;
    let amount = d.amount;
    if (part === 'head' && d.type !== 'explosive') amount *= 1.15;
    let shieldHit = false;
    if (this.shield > 0 && d.type !== 'fall') {
      shieldHit = true;
      const sd = amount * (d.type === 'plasma' || d.type === 'energy' ? 1.1 : 1);
      if (sd >= this.shield) {
        const overflow = (sd - this.shield) / (d.type === 'plasma' || d.type === 'energy' ? 1.1 : 1);
        this.shield = 0;
        this.health -= overflow * 0.6;
        world.events.emit('shieldBroken', { x: this.x, y: this.centerY(), z: this.z, isPlayer: true });
        this.shieldBrokenFlag = true;
      } else {
        this.shield -= sd;
      }
      this.lastShieldHit = 0;
    } else {
      this.health -= amount;
    }
    this.shieldTimer = this.shieldDelay * world.difficulty.playerShieldDelay * this.shieldDelayMult;
    this.healthRegenTimer = 5;
    this.lastHit = 0;
    this.hurtT = 0.25;
    if (d.knockback) {
      this.vx += d.dirX * d.knockback * 4;
      if (this.onGround && d.knockback > 2) this.vy = Math.max(this.vy, d.knockback * 1.5);
    }
    world.events.emit('playerHurt', { amount, dirX: d.dirX, dirY: d.dirY, shield: shieldHit });
    world.stats.damageTaken += amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die(world);
      return { dealt: amount, shieldHit, headshot: false, killed: true, blocked: false };
    }
    return { dealt: amount, shieldHit, headshot: false, killed: false, blocked: false };
  }

  die(world: World): void {
    if (this.dead) return;
    this.dead = true;
    this.deadTime = 0;
    this.anim = 'dead';
    this.vx = -this.facing * 3;
    this.vy = 5;
    world.events.emit('playerDied', {});
  }

  update(dt: number, world: World): void {
    const c = this.controls;
    this.updateLaneDepth(dt);
    if (this.dead) {
      this.deadTime += dt;
      this.vy -= GRAVITY * dt;
      this.vx = damp(this.vx, 0, 3, dt);
      world.solids.move(this, dt);
      return;
    }

    // --- timers & regeneration
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landImpact = Math.max(0, this.landImpact - dt * 4);
    this.laneCooldown = Math.max(0, this.laneCooldown - dt);
    this.laneBlockedT = Math.max(0, this.laneBlockedT - dt);
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.sprintRecover = Math.max(0, this.sprintRecover - dt);
    this.lastFire += dt;
    this.recoilAngle = damp(this.recoilAngle, 0, 10, dt);
    const shieldBefore = this.shield;
    const recharging = this.shieldTimer <= 0 && this.shield < this.maxShield;
    this.updateShield(dt);
    if (recharging && shieldBefore === 0 && this.shield > 0) world.events.emit('shieldRecharge', {});
    if (shieldBefore < this.maxShield && this.shield >= this.maxShield) world.events.emit('shieldFull', {});
    this.healthRegenTimer -= dt;
    if (this.healthRegenTimer <= 0 && this.health < this.maxHealth) {
      const ceil = Math.min(this.maxHealth, Math.ceil(this.health / 25 - 1e-6) * 25);
      if (this.health < ceil) this.health = Math.min(ceil, this.health + 8 * dt);
    }
    const low = this.health < 35;
    if (low !== this.lowHealthFlag) {
      this.lowHealthFlag = low;
      world.events.emit('lowHealth', { on: low });
    }

    if (this.frozen) {
      this.vx = damp(this.vx, 0, 10, dt);
      this.vy -= GRAVITY * dt;
      world.solids.move(this, dt);
      this.updateAnim(dt, world);
      return;
    }

    // --- aim
    this.aimWorldX = c.aimX;
    this.aimWorldY = c.aimY;
    const sy = this.shoulderY();
    this.aimAngle = Math.atan2(c.aimY - sy, c.aimX - this.x);

    // --- lane switching
    if ((c.laneIn || c.laneOut) && this.laneCooldown <= 0 && !this.rolling) {
      const target = c.laneIn ? 1 : 0;
      if (target !== this.lane) {
        const mask = target === 0 ? 1 : 2;
        const blocked = world.solids.rectBlocked(this.x - this.w / 2, this.y + 0.05, this.w, this.h - 0.1, mask);
        if (blocked) {
          this.laneBlockedT = 0.3;
        } else {
          this.laneFrom = this.lane;
          this.lane = target;
          this.laneT = 0;
          this.laneCooldown = 0.3;
          world.events.emit('laneShift', { x: this.x, y: this.y, toLane: target, isPlayer: true });
        }
      }
    }

    // --- crouch / roll
    const wantCrouch = c.crouchHeld && this.onGround;
    if (c.crouchPressed && this.onGround && Math.abs(c.moveX) > 0.4 && this.rollCooldown <= 0 && !this.rolling && this.meleeT <= 0) {
      this.rollT = ROLL_TIME;
      this.rollDir = Math.sign(c.moveX);
      this.facing = this.rollDir;
      this.sprinting = false;
      this.weapon?.cancelReload();
      world.events.emit('roll', { x: this.x, y: this.y });
    }
    if (this.rolling) {
      this.rollT -= dt;
      if (this.rollT <= 0) {
        this.rollT = 0;
        this.rollCooldown = 0.18;
      }
    }
    const canStand = !world.solids.rectBlocked(this.x - this.w / 2, this.y + 0.05, this.w, STAND_H - 0.05, this.lane === 0 ? 1 : 2);
    this.crouching = (wantCrouch || (!canStand && this.onGround)) && !this.rolling;
    this.h = this.crouching || this.rolling ? CROUCH_H : STAND_H;

    // --- sprint
    const firingIntent = c.fire.pressed || c.fire.held || c.grenadePressed || c.meleePressed;
    if (c.sprintHeld && Math.abs(c.moveX) > 0.5 && !this.crouching && !this.rolling && !firingIntent && this.meleeT <= 0 && this.throwT <= 0) {
      if (!this.sprinting && this.onGround) {
        this.sprinting = true;
        this.weapon?.cancelReload();
      }
    } else if (this.sprinting) {
      this.sprinting = false;
      this.sprintRecover = 0.14;
    }
    if (this.sprinting && Math.sign(c.moveX) !== Math.sign(this.vx) && Math.abs(this.vx) > 1) this.sprinting = false;

    // --- facing
    if (this.rolling) this.facing = this.rollDir;
    else if (this.sprinting) this.facing = Math.sign(c.moveX) || this.facing;
    else if (Math.abs(c.aimX - this.x) > 0.15) this.facing = c.aimX > this.x ? 1 : -1;

    // --- horizontal movement
    if (this.rolling) {
      const t = 1 - this.rollT / ROLL_TIME;
      this.vx = this.rollDir * (11.5 - 6 * t);
    } else {
      let maxSpeed = this.sprinting ? SPRINT : this.crouching ? CROUCH_SPEED : RUN;
      const backpedal = Math.sign(c.moveX) !== 0 && Math.sign(c.moveX) !== this.facing;
      if (backpedal && !this.sprinting) maxSpeed *= 0.78;
      if (this.meleeT > 0) maxSpeed *= 0.4;
      const targetV = c.moveX * maxSpeed;
      const acc = this.onGround ? ACC_GROUND : ACC_AIR;
      this.vx = moveToward(this.vx, targetV, acc * dt);
    }
    if (this.knockX !== 0) {
      this.vx += this.knockX;
      this.knockX = 0;
    }

    // --- jumping
    if (this.onGround) {
      this.coyote = COYOTE;
    } else {
      this.coyote -= dt;
    }
    if (c.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.rolling) {
      const g = this.groundSolid;
      if (c.crouchHeld && g && g.oneWay) {
        // Drop through a one-way platform.
        this.dropThrough = 0.25;
        this.y -= 0.05;
      } else {
        this.vy = JUMP_V;
        world.events.emit('jump', { x: this.x, y: this.y, isPlayer: true });
      }
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.crouching = false;
      this.h = STAND_H;
    }
    if (!c.jumpHeld && this.vy > 0 && !this.onGround) this.vy -= GRAVITY * 1.4 * dt;

    // --- gravity & physics
    const falling = this.vy < 0;
    this.vy -= GRAVITY * (falling ? 1.22 : 1) * dt;
    this.vy = Math.max(this.vy, -26);
    const wasGround = this.onGround;
    const fallSpeed = -this.vy;
    world.solids.move(this, dt);
    if (!wasGround && this.onGround) {
      const heavy = clamp((fallSpeed - 6) / 16, 0, 1);
      this.landImpact = Math.max(this.landImpact, 0.35 + heavy * 0.65);
      world.events.emit('land', { x: this.x, y: this.y, z: this.z, heavy, isPlayer: true });
      if (heavy > 0.5) world.events.emit('cameraShake', { amount: heavy * 0.25 });
    }
    if (this.onGround) {
      this.airTime = 0;
      const g = this.groundSolid;
      if (g && !g.owner && !g.oneWay) this.lastSafe = { x: this.x, y: this.y, lane: this.lane };
    } else {
      this.airTime += dt;
    }

    // Keep within level bounds.
    const b = world.level.bounds;
    if (this.x < b.minX) {
      this.x = b.minX;
      this.vx = Math.max(0, this.vx);
    }
    if (this.x > b.maxX) {
      this.x = b.maxX;
      this.vx = Math.min(0, this.vx);
    }
    const lock = world.arenaLock;
    if (lock) {
      if (this.x < lock.left + 0.5) {
        this.x = lock.left + 0.5;
        this.vx = Math.max(0, this.vx);
      }
      if (this.x > lock.right - 0.5) {
        this.x = lock.right - 0.5;
        this.vx = Math.min(0, this.vx);
      }
    }

    // --- footsteps
    if (this.onGround && Math.abs(this.vx) > 0.5 && !this.rolling) {
      const stride = this.sprinting ? 2.5 : this.crouching ? 1.2 : 2.0;
      const prev = Math.floor(this.runPhase / Math.PI);
      this.runPhase += (Math.abs(this.vx) * dt * Math.PI * 2) / stride;
      if (Math.floor(this.runPhase / Math.PI) !== prev) {
        world.events.emit('footstep', {
          x: this.x,
          y: this.y,
          z: this.z,
          heavy: this.sprinting ? 1 : this.crouching ? 0.3 : 0.7,
          isPlayer: true,
          surface: this.groundSolid?.surface ?? 'paper',
        });
      }
    }

    // --- pits
    if (this.y < world.level.killY) {
      this.fellIntoPit(world);
      return;
    }

    this.updateWeapons(dt, world);
    this.updateMelee(dt, world);
    this.updateGrenade(dt, world);
    this.updateInteract(world);
    this.updateAnim(dt, world);
  }

  private fellIntoPit(world: World): void {
    this.applyDamage(makeDamage({ amount: 35, type: 'fall' }), 'body', world);
    if (this.dead) {
      this.y = world.level.killY;
      this.vy = 0;
      return;
    }
    this.x = this.lastSafe.x;
    this.y = this.lastSafe.y + 0.05;
    this.lane = this.lastSafe.lane;
    this.laneT = 1;
    this.z = LANE_Z[this.lane];
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.vx = 0;
    this.vy = 0;
    this.invuln = 1.2;
    world.events.emit('flash', { color: '#000', strength: 0.8 });
  }

  private canUseWeapon(): boolean {
    return !this.rolling && this.meleeT <= 0 && this.switchT <= 0 && !this.sprinting && this.sprintRecover <= 0 && this.throwT < THROW_TIME - 0.28;
  }

  private updateWeapons(dt: number, world: World): void {
    const c = this.controls;
    // Switching
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (!this.switchSwapped && this.switchT <= this.switchDur * 0.5) {
        this.switchSwapped = true;
        if (this.switchTo >= 0) this.current = this.switchTo;
      }
      if (this.switchT <= 0) this.switchT = 0;
    } else if (c.switchPressed && this.weapons[1 - this.current] && this.meleeT <= 0) {
      this.beginSwitch(1 - this.current, world);
    }
    if (c.cycleGrenadePressed) {
      const types = Object.keys(GRENADES).filter((k) => (this.grenades[k] ?? 0) > 0);
      if (types.length > 1) {
        const i = types.indexOf(this.grenadeType);
        this.grenadeType = types[(i + 1) % types.length];
        world.events.emit('weaponSwitch', { weaponId: 'grenade' });
      }
    }

    for (const w of this.weapons) {
      if (w) w.update(dt, world, this.x, this.y, true);
    }
    const w = this.weapon;
    if (!w) return;
    // Background weapon doesn't reload while holstered.
    const other = this.otherWeapon;
    if (other && other.reloading) other.cancelReload();

    if (c.reloadPressed && this.switchT <= 0 && !this.rolling && w.startReload(world, this.x, this.y, true)) {
      this.sprinting = false;
      world.events.emit('vocal', { id: this.id, type: 'player', kind: 'callout', x: this.x, y: this.y });
      world.onPlayerReload();
    }

    if (!this.canUseWeapon()) {
      if (w.charging && !c.fire.held) {
        w.charging = false;
        w.chargeT = 0;
      }
      return;
    }
    const sy = this.shoulderY();
    const len = this.muzzleLength();
    const mx = this.x + Math.cos(this.aimAngle) * len;
    const my = sy + Math.sin(this.aimAngle) * len;
    const moving = Math.abs(this.vx) > 1;
    const spreadMult = (this.crouching ? 0.6 : 1) * (this.onGround ? 1 : 1.35) * (moving ? 1.12 : 1);
    const fired = w.trigger(
      c.fire,
      {
        x: mx,
        y: my,
        originX: this.x,
        originY: sy,
        angle: this.aimAngle + this.recoilAngle * this.facing,
        lane: this.lane,
        faction: 'player',
        byPlayer: true,
        sourceId: this.id,
        spreadMult,
        damageMult: 1,
        headshotMult: this.headshotMult,
        speedMult: 1,
        homingTarget: w.def.charge ? world.findPlayerHomingTarget(this) : null,
      },
      world,
    );
    if (fired > 0) {
      this.lastFire = 0;
      world.stats.shotsFired += fired;
      const rc = w.def.recoil;
      this.recoilAngle = Math.min(0.25, this.recoilAngle + rc.climb * 0.012);
      world.events.emit('cameraKick', { x: -Math.cos(this.aimAngle) * rc.kick, y: -Math.sin(this.aimAngle) * rc.kick });
      if (rc.shake > 0.1) world.events.emit('cameraShake', { amount: rc.shake * 0.5 });
      if (w.def.id === 'rocket' && this.onGround) this.vx -= Math.cos(this.aimAngle) * 1.5;
      if (w.def.fireMode === 'pump') this.vx -= Math.cos(this.aimAngle) * 1.2;
    }
    // Auto-reload when the magazine runs dry.
    if (!w.isBattery && w.mag <= 0 && w.reserve > 0 && !w.reloading && w.burstLeft === 0 && w.cooldown <= 0) {
      w.startReload(world, this.x, this.y, true);
    }
    // An empty battery weapon is dropped automatically if we have a backup.
    if (w.isBattery && w.mag <= 0 && w.cooldown <= 0 && this.otherWeapon && this.switchT <= 0) {
      this.weapons[this.current] = null;
      this.beginSwitch(1 - this.current, world);
    }
  }

  private updateMelee(dt: number, world: World): void {
    const c = this.controls;
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      const elapsed = MELEE_TIME - this.meleeT;
      if (!this.meleeDone && elapsed >= 0.11) {
        this.meleeDone = true;
        this.performMelee(world);
      }
      if (this.meleeT <= 0) this.meleeT = 0;
      return;
    }
    if (c.meleePressed && !this.rolling && this.throwT <= 0) {
      this.meleeT = MELEE_TIME;
      this.meleeDone = false;
      this.sprinting = false;
      this.weapon?.cancelReload();
      // Face the aim side and lunge toward a nearby enemy.
      const target = this.nearestHostile(world, 3.2);
      if (target) {
        this.facing = target.x > this.x ? 1 : -1;
        this.vx = this.facing * 7;
      }
    }
  }

  private nearestHostile(world: World, range: number): Damageable | null {
    let best: Damageable | null = null;
    let bestD = range;
    for (const d of world.damageables) {
      if (!d.alive || d.lane !== this.lane || !hostile('player', d.faction) || d.faction === 'neutral') continue;
      const dx = d.x - this.x;
      const dy = d.centerY() - this.centerY();
      if (Math.abs(dy) > 1.8) continue;
      const dd = Math.abs(dx);
      if (dd < bestD && Math.sign(dx) === this.facing) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  private performMelee(world: World): void {
    const reach = 1.75;
    const x0 = this.facing > 0 ? this.x : this.x - reach;
    const box = { x: x0, y: this.y + 0.2, w: reach, h: this.h };
    let hitAny = false;
    const hbs: Hurtbox[] = [];
    for (const d of world.damageables) {
      if (!d.alive || d.lane !== this.lane || d.faction === 'player') continue;
      hbs.length = 0;
      d.getHurtboxes(hbs);
      let hitPart: Hurtbox | null = null;
      for (const hb of hbs) {
        if (hb.x < box.x + box.w && hb.x + hb.w > box.x && hb.y < box.y + box.h && hb.y + hb.h > box.y) {
          if (!hitPart || hb.part === 'shieldPanel') hitPart = hb;
        }
      }
      if (!hitPart) continue;
      hitAny = true;
      const dmg = makeDamage({
        amount: 72,
        type: 'melee',
        byPlayer: true,
        sourceId: this.id,
        sourceFaction: 'player',
        dirX: this.facing,
        dirY: 0.2,
        x: this.x + this.facing * 1,
        y: this.centerY(),
        knockback: 5,
        armorMult: 0.6,
      });
      world.damageTarget(d, hitPart.part === 'shieldPanel' ? 'shieldPanel' : 'body', dmg, hitPart.tag);
    }
    world.events.emit('melee', { x: this.x + this.facing, y: this.centerY(), z: this.z, hit: hitAny, byPlayer: true, dir: this.facing });
    if (hitAny) world.events.emit('cameraShake', { amount: 0.2 });
  }

  private updateGrenade(dt: number, world: World): void {
    const c = this.controls;
    if (this.throwT > 0) {
      this.throwT -= dt;
      if (!this.thrown && this.throwT <= THROW_TIME - 0.13) {
        this.thrown = true;
        const def = GRENADES[this.grenadeType];
        const a = clamp(this.aimAngle, -Math.PI, Math.PI);
        // Lob slightly above the aim line so grenades arc naturally.
        const dirX = Math.cos(a);
        const dirY = Math.sin(a) + 0.35;
        const len = Math.hypot(dirX, dirY);
        const dist = Math.hypot(this.aimWorldX - this.x, this.aimWorldY - this.shoulderY());
        const power = clamp(0.55 + dist / 18, 0.6, 1.1);
        const speed = def.throwSpeed * power;
        const g = new Grenade(
          def,
          this.x + this.facing * 0.4,
          this.shoulderY() + 0.2,
          (dirX / len) * speed + this.vx * 0.3,
          (dirY / len) * speed,
          this.lane,
          'player',
          true,
          this.id,
        );
        world.addEntity(g);
        world.events.emit('grenadeThrow', { x: this.x, y: this.y, kind: def.id, byPlayer: true });
      }
      if (this.throwT <= 0) this.throwT = 0;
      return;
    }
    if (c.grenadePressed && !this.rolling && this.meleeT <= 0) {
      if ((this.grenades[this.grenadeType] ?? 0) <= 0) {
        const other = Object.keys(GRENADES).find((k) => (this.grenades[k] ?? 0) > 0);
        if (!other) {
          world.events.emit('dryFire', { weaponId: 'grenade' });
          return;
        }
        this.grenadeType = other;
      }
      this.grenades[this.grenadeType]--;
      this.throwT = THROW_TIME;
      this.thrown = false;
      this.sprinting = false;
      this.weapon?.cancelReload();
    }
  }

  private updateInteract(world: World): void {
    const c = this.controls;
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of world.interactables) {
      if (it.removed || it.lane !== this.lane) continue;
      const dx = Math.abs(it.x - this.x);
      const dy = it.y - this.y;
      if (dx > it.interactRange || dy < -1 || dy > 2.4) continue;
      if (it.touch) it.touch(this, world);
      if (it.removed) continue;
      const p = it.prompt(this);
      if (p && dx < bestD) {
        bestD = dx;
        best = it;
      }
    }
    this.interactTarget = best;
    this.interactPrompt = best ? best.prompt(this) : null;
    if (best && c.interactPressed) best.interact(this, world);
  }

  private updateAnim(dt: number, world: World): void {
    void world;
    if (this.victory) this.anim = 'victory';
    else if (this.rolling) this.anim = 'roll';
    else if (!this.onGround) this.anim = this.vy > 0 ? 'jump' : 'fall';
    else if (this.crouching) this.anim = 'crouch';
    else if (this.sprinting) this.anim = 'sprint';
    else if (Math.abs(this.vx) > 0.6) this.anim = 'run';
    else this.anim = 'idle';
    if (!this.onGround || Math.abs(this.vx) < 0.3) {
      this.runPhase += dt * 0.5;
    }
  }

  /** Restore to full combat readiness (respawn / checkpoint). */
  resetVitals(): void {
    this.dead = false;
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.shieldTimer = 0;
    this.invuln = 1.5;
    this.anim = 'idle';
  }

  /** Default loadout for a fresh mission. */
  defaultLoadout(secondary: string | null): void {
    this.weapons = [new WeaponState('ar', undefined, undefined, this.reserveMult), null];
    if (secondary && WEAPONS[secondary]) this.weapons[1] = new WeaponState(secondary, undefined, undefined, this.reserveMult);
    this.current = 0;
  }
}
