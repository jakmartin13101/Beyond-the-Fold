// Shared enemy base: perception, targeting, damage response, entry animations and
// reusable movement/combat helpers used by every enemy class' behaviour state machine.
import { DEG, clamp, damp, rand, randSign } from '../core/math';
import type { VocalKind } from '../core/events';
import { ENEMIES, EnemyDef } from '../data/enemies';
import { Actor, DamageResult, NO_DAMAGE } from './entity';
import { DamageInfo, EntryStyle, GRAVITY, HitPart, Hurtbox, LANE_Z, SpawnDef } from './types';
import { WeaponState } from './weaponState';
import type { World } from './world';

export interface CoverSpot {
  x: number;
  w: number;
  h: number;
  lane: number;
  alive: boolean;
  claimedBy: number[];
}

export abstract class Enemy extends Actor {
  readonly kind = 'enemy' as const;
  readonly def: EnemyDef;
  readonly type: string;
  weapon: WeaponState | null = null;
  target: Actor | null = null;
  aware = false;
  sees = false;
  lostT = 0;
  lastSeenX = 0;
  lastSeenY = 0;
  aimAngle = 0;
  state = 'idle';
  stateT = 0;
  stunT = 0;
  staggerT = 0;
  dmgWindow = 0;
  crouching = false;
  hasToken = false;
  attackCooldown = 1;
  telegraphT = 0;
  attacking = false;
  attackT = 0;
  meleeWindup = 0;
  meleeCooldown = 0;
  desiredVx = 0;
  entry: EntryStyle = 'none';
  entryT = 0;
  entryDur = 0;
  entryFrom = { x: 0, y: 0, z: 0 };
  entryTo = { x: 0, y: 0 };
  patrol: [number, number] | null = null;
  patrolDir = 1;
  patrolWait = 0;
  laneMismatchT = 0;
  runPhase = 0;
  vocalCooldown = 0;
  deathCause = '';
  deathDirX = 0;
  deathHeadshot = false;
  cover: CoverSpot | null = null;
  pressT = 0;
  strafeTarget: number | null = null;
  strafeT = 0;
  damageMult = 1;
  inaccuracy = 4;
  reaction = 0.5;
  footTimer = 0;
  hitFlash = 0;
  /** True while being placed by an entry animation (invulnerable, inactive). */
  entering = false;

  constructor(type: string, spawn: SpawnDef, world: World) {
    super();
    this.type = type;
    this.def = ENEMIES[type];
    const def = this.def;
    this.faction = def.faction;
    this.w = def.width;
    this.h = def.height;
    const diff = world.difficulty;
    this.maxHealth = this.health = def.health * diff.enemyHealth;
    this.maxShield = this.shield = def.shield * diff.enemyHealth;
    this.shieldDelay = def.shieldDelay;
    this.shieldRate = def.shieldRate;
    this.damageMult = diff.enemyDamage;
    this.inaccuracy = def.inaccuracy * diff.accuracy;
    this.reaction = def.reaction * diff.reaction;
    this.surface = def.faction === 'rogue' ? 'metal' : 'flesh';
    this.lane = spawn.lane ?? 0;
    this.laneFrom = this.lane;
    this.x = this.px = spawn.x;
    const ground = world.solids.groundBelow(spawn.x, (spawn.y ?? 30) + 0.1, this.lane === 0 ? 1 : 2, 80);
    this.y = this.py = spawn.y ?? ground ?? 0;
    this.z = this.pz = LANE_Z[this.lane];
    this.facing = spawn.facing ?? -1;
    this.patrol = spawn.patrol ?? null;
    if (def.weapon) {
      this.weapon = new WeaponState(def.weapon);
    }
    if (spawn.alerted) this.aware = true;
    this.attackCooldown = rand(0.6, 1.6);
    this.setupEntry(spawn.entry ?? 'none', world);
  }

  private setupEntry(entry: EntryStyle, world: World): void {
    this.entry = entry;
    if (entry === 'none') return;
    this.entering = true;
    this.entryT = 0;
    this.entryTo = { x: this.x, y: this.y };
    switch (entry) {
      case 'drop':
      case 'pod':
        this.entryDur = entry === 'pod' ? 1.1 : 0.75;
        this.entryFrom = { x: this.x, y: this.y + (entry === 'pod' ? 22 : 10), z: this.z };
        break;
      case 'leap':
        this.entryDur = 0.85;
        this.entryFrom = { x: this.x + rand(1.5, 3) * randSign(), y: this.y + 1.5, z: -10 };
        break;
      case 'fly':
      case 'hangar':
        this.entryDur = 1.4;
        this.entryFrom = { x: this.x + rand(-2, 2), y: this.y + (entry === 'hangar' ? 0 : 6), z: -14 };
        break;
    }
    this.x = this.px = this.entryFrom.x;
    this.y = this.py = this.entryFrom.y;
    this.z = this.pz = this.entryFrom.z;
    world.events.emit('spawnFx', { kind: entry, x: this.entryTo.x, y: this.entryTo.y, z: LANE_Z[this.lane] });
  }

  private updateEntry(dt: number, world: World): void {
    this.entryT += dt;
    const t = clamp(this.entryT / this.entryDur, 0, 1);
    const f = this.entryFrom;
    const to = this.entryTo;
    const tz = LANE_Z[this.lane];
    switch (this.entry) {
      case 'drop':
      case 'pod': {
        const e = t * t;
        this.x = to.x;
        this.y = f.y + (to.y - f.y) * e;
        this.z = tz;
        break;
      }
      case 'leap': {
        const e = t;
        this.x = f.x + (to.x - f.x) * e;
        this.y = f.y + (to.y - f.y) * e + Math.sin(Math.PI * e) * 3.2;
        this.z = f.z + (tz - f.z) * (1 - Math.pow(1 - e, 2));
        this.facing = to.x > f.x ? 1 : -1;
        break;
      }
      default: {
        const e = 1 - Math.pow(1 - t, 3);
        this.x = f.x + (to.x - f.x) * e;
        this.y = f.y + (to.y - f.y) * e;
        this.z = f.z + (tz - f.z) * e;
      }
    }
    if (t >= 1) {
      this.entering = false;
      this.entry = 'none';
      this.x = to.x;
      this.y = to.y;
      this.z = tz;
      this.aware = true;
      if (!this.def.flying) {
        world.events.emit('land', { x: this.x, y: this.y, z: this.z, heavy: 0.8, isPlayer: false });
        world.events.emit('cameraShake', { amount: 0.12 });
      }
      this.state = 'alert';
      this.stateT = 0;
    }
  }

  getHurtboxes(out: Hurtbox[]): void {
    if (this.dead || this.entering) return;
    const h = this.crouching ? this.def.crouchHeight : this.def.height;
    this.standardHurtboxes(out, h, this.crouching ? this.def.headHeight * 0.9 : this.def.headHeight);
  }

  /** Damage multiplier hook for subclasses (e.g. Ravager stunned bonus). */
  protected damageTakenMult(_d: DamageInfo, _part: HitPart): number {
    return 1;
  }

  applyDamage(d: DamageInfo, part: HitPart, world: World): DamageResult {
    if (this.dead || this.entering) return NO_DAMAGE;
    let amount = d.amount * this.damageTakenMult(d, part);
    let shieldHit = false;
    if (d.stripShield && this.shield > 0) {
      this.shield = 0;
      shieldHit = true;
      world.events.emit('shieldBroken', { x: this.x, y: this.centerY(), z: this.z, isPlayer: false });
      amount *= 0.5;
    }
    if (this.shield > 0) {
      shieldHit = true;
      const sd = amount * d.shieldMult;
      if (sd >= this.shield) {
        const overflow = (sd - this.shield) / d.shieldMult;
        this.shield = 0;
        world.events.emit('shieldBroken', { x: this.x, y: this.centerY(), z: this.z, isPlayer: false });
        amount = overflow;
      } else {
        this.shield -= sd;
        amount = 0;
      }
      this.lastShieldHit = 0;
    }
    let headshot = false;
    if (amount > 0) {
      if (part === 'head' && d.type !== 'explosive' && d.type !== 'melee') {
        amount *= d.headshotMult;
        headshot = d.headshotMult > 1.01;
      }
      if (!d.explosive && d.type !== 'explosive') amount *= this.def.armor;
      // Melee from behind is a takedown.
      if (d.type === 'melee' && Math.sign(d.dirX) === this.facing) amount *= 2.2;
      this.health -= amount;
    }
    this.shieldTimer = this.shieldDelay;
    this.lastHit = 0;
    this.hitFlash = 0.12;
    this.dmgWindow += amount + (shieldHit ? d.amount * 0.3 : 0);
    if (d.knockback) {
      this.knockX += d.dirX * d.knockback * (this.def.flying ? 1.5 : 1);
      if (d.knockback > 2 && !this.def.flying) this.vy = Math.max(this.vy, d.knockback * 1.2);
    }
    if (d.stun) this.onStun(d.stun, world);
    // Becoming aware of the attacker.
    if (!this.aware) {
      this.aware = true;
      this.state = 'alert';
      this.stateT = 0;
    }
    if (d.dirX !== 0 && !this.target) this.facing = d.dirX > 0 ? -1 : 1;
    if (this.dmgWindow > this.def.staggerThreshold && this.staggerT <= 0) {
      this.staggerT = 0.32;
      this.dmgWindow = 0;
      this.cancelAttack(world);
      this.vocal(world, 'pain', 0.2);
    }
    if (this.health <= 0) {
      this.health = 0;
      this.kill(world, d, headshot);
      return { dealt: amount, shieldHit, headshot, killed: true, blocked: false };
    }
    return { dealt: amount, shieldHit, headshot, killed: false, blocked: false };
  }

  protected onStun(seconds: number, world: World): void {
    this.stunT = Math.max(this.stunT, seconds * 0.4);
    this.cancelAttack(world);
  }

  kill(world: World, d: DamageInfo, headshot: boolean): void {
    if (this.dead) return;
    this.dead = true;
    this.deadTime = 0;
    this.deathHeadshot = headshot;
    this.deathDirX = d.dirX || -this.facing;
    this.deathCause = d.explosive || d.type === 'explosive' ? 'explosion' : d.type === 'melee' ? 'melee' : headshot ? 'headshot' : 'weapon';
    this.cancelAttack(world);
    if (this.cover) this.releaseCover();
    this.vocal(world, 'death', 0, true);
    world.onEnemyKilled(this, d, headshot);
  }

  vocal(world: World, kind: VocalKind, cooldown = 1.5, force = false): void {
    if (!force && this.vocalCooldown > 0) return;
    this.vocalCooldown = cooldown + rand(0.5, 1.5);
    world.events.emit('vocal', { id: this.id, type: this.type, kind, x: this.x, y: this.y });
  }

  update(dt: number, world: World): void {
    if (this.entering) {
      this.updateEntry(dt, world);
      return;
    }
    this.updateLaneDepth(dt);
    if (this.dead) {
      this.deadTime += dt;
      if (!this.def.flying) {
        this.vy -= GRAVITY * dt;
        this.vx = damp(this.vx, 0, 4, dt);
        world.solids.move(this, dt);
      }
      if (this.deadTime > 2.2) this.removed = true;
      return;
    }
    this.updateShield(dt);
    this.vocalCooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.dmgWindow = Math.max(0, this.dmgWindow - dt * this.def.staggerThreshold * 0.8);
    this.attackCooldown -= dt;
    this.meleeCooldown -= dt;
    this.pressT = Math.max(0, this.pressT - dt);
    this.stateT += dt;
    this.perceive(dt, world);

    this.desiredVx = 0;
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.crouching = false;
    } else if (this.staggerT > 0) {
      this.staggerT -= dt;
    } else {
      this.think(dt, world);
    }
    this.updateAttack(dt, world);
    this.applyMovement(dt, world);
    if (this.weapon) this.weapon.update(dt, world, this.x, this.y, false);
    if (this.y < world.level.killY) {
      this.health = 0;
      this.dead = true;
      this.removed = true;
      world.onEnemyKilled(this, { amount: 0, type: 'fall', byPlayer: false } as DamageInfo, false);
    }
  }

  /** Behaviour state machine implemented by each enemy class. */
  protected abstract think(dt: number, world: World): void;

  // ---------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------

  protected perceive(dt: number, world: World): void {
    const prevTarget = this.target;
    this.target = world.pickTarget(this);
    if (this.target && this.target !== prevTarget && this.aware && prevTarget && this.target.faction !== prevTarget.faction) {
      this.vocal(world, 'callout');
    }
    const t = this.target;
    this.sees = false;
    if (!t) {
      this.lostT += dt;
      return;
    }
    const dx = t.x - this.x;
    const dist = Math.abs(dx) + Math.abs(t.y - this.y) * 0.5;
    const inFront = Math.sign(dx) === this.facing || Math.abs(dx) < 4;
    const sight = this.aware ? this.def.sight * 1.25 : this.def.sight;
    if (dist < sight && (this.aware || inFront)) {
      if (t.lane === this.lane) {
        const eyeY = this.y + this.h * 0.85;
        const hit = world.solids.raycast(this.x, eyeY, t.x, t.y + t.h * 0.6, this.lane === 0 ? 1 : 2);
        const hit2 = hit ? world.solids.raycast(this.x, eyeY, t.x, t.y + t.h * 0.95, this.lane === 0 ? 1 : 2) : null;
        this.sees = !hit || !hit2;
      } else {
        this.sees = dist < sight * 0.8;
      }
    }
    if (this.sees) {
      this.lastSeenX = t.x;
      this.lastSeenY = t.y;
      this.lostT = 0;
      if (!this.aware) {
        this.aware = true;
        this.state = 'alert';
        this.stateT = 0;
      }
    } else {
      this.lostT += dt;
    }
    // Follow the target between depth lanes after a short delay.
    if (this.aware && t.lane !== this.lane && Math.abs(dx) < this.def.sight) {
      this.laneMismatchT += dt;
      if (this.laneMismatchT > 0.9 + this.reaction * 1.2 && !this.attacking) {
        this.tryLaneSwitch(t.lane, world);
      }
    } else {
      this.laneMismatchT = 0;
    }
  }

  protected tryLaneSwitch(lane: number, world: World): boolean {
    if (lane === this.lane) return true;
    const mask = lane === 0 ? 1 : 2;
    if (world.solids.rectBlocked(this.x - this.w / 2, this.y + 0.1, this.w, this.h - 0.1, mask)) {
      this.laneMismatchT = 0.4;
      return false;
    }
    if (this.cover) this.releaseCover();
    this.laneFrom = this.lane;
    this.lane = lane;
    this.laneT = 0;
    this.laneMismatchT = 0;
    if (!this.def.flying && this.onGround) this.vy = 6;
    world.events.emit('laneShift', { x: this.x, y: this.y, toLane: lane, isPlayer: false });
    return true;
  }

  get targetDist(): number {
    return this.target ? Math.abs(this.target.x - this.x) : Infinity;
  }

  protected faceTarget(): void {
    if (this.target) this.facing = this.target.x > this.x ? 1 : -1;
  }

  // ---------------------------------------------------------------------------
  // Movement helpers
  // ---------------------------------------------------------------------------

  /** Walk toward x. Returns true when arrived. Avoids walking off ledges and hops low obstacles. */
  protected moveTo(x: number, speedMul: number, world: World, allowDrop = false): boolean {
    const dx = x - this.x;
    if (Math.abs(dx) < 0.25) return true;
    const dir = Math.sign(dx);
    if (!this.def.flying && this.onGround && !allowDrop) {
      const probeX = this.x + dir * (this.w / 2 + 0.45);
      const g = world.solids.groundBelow(probeX, this.y + 0.2, this.lane === 0 ? 1 : 2, 2.6);
      if (g === null) return true;
    }
    this.desiredVx = dir * this.def.speed * speedMul;
    return false;
  }

  protected safeToMove(dir: number, world: World): boolean {
    if (this.def.flying) return true;
    const probeX = this.x + dir * (this.w / 2 + 0.6);
    const g = world.solids.groundBelow(probeX, this.y + 0.2, this.lane === 0 ? 1 : 2, 2.6);
    if (g === null) return false;
    return !world.solids.rectBlocked(probeX - 0.2, this.y + 0.5, 0.4, this.h - 0.6, this.lane === 0 ? 1 : 2);
  }

  protected applyMovement(dt: number, world: World): void {
    if (this.def.flying) return;
    const acc = this.onGround ? this.def.accel : this.def.accel * 0.5;
    const target = this.crouching ? this.desiredVx * 0.4 : this.desiredVx;
    if (this.vx < target) this.vx = Math.min(target, this.vx + acc * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - acc * dt);
    if (this.knockX !== 0) {
      this.vx += this.knockX;
      this.knockX = 0;
    }
    this.vy -= GRAVITY * dt;
    this.vy = Math.max(this.vy, -26);
    const wasGround = this.onGround;
    world.solids.move(this, dt);
    // Hop over low obstacles while walking.
    if (this.hitWall !== 0 && this.onGround && Math.abs(this.desiredVx) > 0.5 && this.def.jump > 0) {
      const top = world.solids.rectBlocked(this.x + this.hitWall * (this.w / 2 + 0.2) - 0.1, this.y + 2.4, 0.2, 0.2, this.lane === 0 ? 1 : 2);
      if (!top) this.vy = this.def.jump;
    }
    if (!wasGround && this.onGround) {
      world.events.emit('land', { x: this.x, y: this.y, z: this.z, heavy: 0.4, isPlayer: false });
    }
    // Footsteps.
    if (this.onGround && Math.abs(this.vx) > 0.6) {
      const stride = 1.9;
      const prev = Math.floor(this.runPhase / Math.PI);
      this.runPhase += (Math.abs(this.vx) * dt * Math.PI * 2) / stride;
      if (Math.floor(this.runPhase / Math.PI) !== prev) {
        world.events.emit('footstep', {
          x: this.x,
          y: this.y,
          z: this.z,
          heavy: this.type === 'ravager' ? 1.2 : 0.5,
          isPlayer: false,
          surface: this.groundSolid?.surface ?? 'paper',
        });
      }
    } else {
      this.runPhase += dt * 0.6;
    }
  }

  // ---------------------------------------------------------------------------
  // Combat helpers
  // ---------------------------------------------------------------------------

  /** Grenades about to explode near us. Returns the flee direction or 0. */
  protected grenadeThreat(world: World): number {
    for (const g of world.grenades) {
      if (g.removed || g.lane !== this.lane || g.faction === this.faction) continue;
      if (g.stuckTo === this) continue;
      const dx = this.x - g.x;
      if (Math.abs(dx) < g.def.radius * 0.9 && Math.abs(this.y - g.y) < 3) return dx >= 0 ? 1 : -1;
    }
    return 0;
  }

  /** Begin a ranged attack if the director grants us a token. */
  protected tryRangedAttack(world: World): boolean {
    if (!this.weapon || this.attacking || this.attackCooldown > 0 || !this.target || !this.sees) return false;
    if (this.target.lane !== this.lane) return false;
    if (this.targetDist > this.def.fireRange) return false;
    if (!world.director.requestToken(this)) {
      this.attackCooldown = rand(0.3, 0.7);
      return false;
    }
    this.hasToken = true;
    this.attacking = true;
    this.attackT = 0;
    this.telegraphT = 0.32 * clamp(this.reaction / 0.5, 0.6, 1.4);
    world.events.emit('telegraph', { kind: 'aim', x: this.x, y: this.centerY(), z: this.z, duration: this.telegraphT });
    return true;
  }

  protected cancelAttack(world: World): void {
    if (this.hasToken) world.director.releaseToken(this);
    this.hasToken = false;
    this.attacking = false;
    this.telegraphT = 0;
    this.meleeWindup = 0;
    if (this.weapon) {
      this.weapon.burstLeft = 0;
      this.weapon.charging = false;
    }
  }

  protected aimPoint(): { x: number; y: number } {
    const t = this.target!;
    const w = this.weapon;
    const speed = w ? w.def.projectile.speed : 30;
    const dist = Math.hypot(t.x - this.x, t.y - this.y);
    const lead = clamp(dist / speed, 0, 1) * rand(0.2, 0.75);
    const tx = t.x + t.vx * lead;
    const ty = t.y + t.h * rand(0.45, 0.75) + Math.max(0, t.vy) * lead * 0.3;
    return { x: tx, y: ty };
  }

  protected muzzle(): { x: number; y: number; ox: number; oy: number } {
    const oy = this.y + this.h * 0.68;
    return { x: this.x + Math.cos(this.aimAngle) * 0.9, y: oy + Math.sin(this.aimAngle) * 0.9, ox: this.x, oy };
  }

  /** Drives telegraph -> burst -> recovery for ranged attacks. */
  protected updateAttack(dt: number, world: World): void {
    if (!this.attacking || !this.weapon) return;
    const t = this.target;
    if (!t || t.dead || this.stunT > 0) {
      this.finishAttack(world);
      return;
    }
    const ap = this.aimPoint();
    const m0 = this.muzzle();
    const want = Math.atan2(ap.y - m0.oy, ap.x - this.x);
    this.aimAngle = this.telegraphT > 0 ? want : this.aimAngle + clamp(want - this.aimAngle, -1.5 * dt, 1.5 * dt);
    this.facing = Math.cos(this.aimAngle) >= 0 ? 1 : -1;
    if (this.telegraphT > 0) {
      this.telegraphT -= dt;
      return;
    }
    this.attackT += dt;
    const w = this.weapon;
    const first = this.attackT <= dt + 1e-6;
    const m = this.muzzle();
    const mobility = Math.abs(t.vx) > 2 ? 1.25 : 0.8;
    const fired = w.trigger(
      { pressed: first, held: true, released: false },
      {
        x: m.x,
        y: m.y,
        originX: m.ox,
        originY: m.oy,
        angle: this.aimAngle + rand(-1, 1) * this.inaccuracy * mobility * DEG,
        lane: this.lane,
        faction: this.faction,
        byPlayer: false,
        sourceId: this.id,
        spreadMult: 1,
        damageMult: this.damageMult,
        headshotMult: 1,
        speedMult: world.difficulty.projectileSpeed,
      },
      world,
    );
    void fired;
    const burstDone = w.burstLeft === 0 && (w.def.fireMode !== 'auto' ? this.attackT > 0.05 : this.attackT > 0.9);
    if (burstDone) this.finishAttack(world);
  }

  protected finishAttack(world: World): void {
    if (this.hasToken) world.director.releaseToken(this);
    this.hasToken = false;
    this.attacking = false;
    this.attackCooldown = rand(1.0, 2.2) * (0.6 + this.reaction) * (this.pressT > 0 ? 0.6 : 1);
    if (this.weapon) {
      this.weapon.mag = this.weapon.def.magSize;
      this.weapon.heat = 0;
      this.weapon.overheatT = 0;
    }
  }

  /** Close-range strike with a short telegraph. */
  protected updateMelee(dt: number, world: World): boolean {
    const m = this.def.melee;
    if (!m || !this.target) return false;
    if (this.meleeWindup > 0) {
      this.meleeWindup -= dt;
      this.desiredVx = 0;
      if (this.meleeWindup <= 0) {
        const t = this.target;
        const dx = t.x - this.x;
        if (Math.abs(dx) < m.range + 0.3 && Math.abs(t.y - this.y) < 1.8 && t.lane === this.lane && Math.sign(dx) === this.facing) {
          world.damageTarget(t, 'body', {
            amount: m.damage * this.damageMult,
            type: 'melee',
            shieldMult: 1,
            armorMult: 1,
            headshotMult: 1,
            byPlayer: false,
            sourceId: this.id,
            sourceFaction: this.faction,
            dirX: this.facing,
            dirY: 0.3,
            x: t.x,
            y: t.centerY(),
            knockback: 3.5,
          });
          world.events.emit('melee', { x: this.x + this.facing, y: this.centerY(), z: this.z, hit: true, byPlayer: false, dir: this.facing });
        } else {
          world.events.emit('melee', { x: this.x + this.facing, y: this.centerY(), z: this.z, hit: false, byPlayer: false, dir: this.facing });
        }
        this.meleeCooldown = m.cooldown;
      }
      return true;
    }
    if (this.meleeCooldown <= 0 && this.targetDist < m.range && this.target.lane === this.lane && Math.abs(this.target.y - this.y) < 1.6) {
      this.faceTarget();
      this.meleeWindup = 0.32 * clamp(this.reaction / 0.5, 0.7, 1.3);
      if (this.attacking) this.cancelAttack(world);
      world.events.emit('telegraph', { kind: 'melee', x: this.x, y: this.centerY(), z: this.z, duration: this.meleeWindup });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Cover
  // ---------------------------------------------------------------------------

  protected findCover(world: World): CoverSpot | null {
    const t = this.target;
    if (!t) return null;
    let best: CoverSpot | null = null;
    let bestScore = Infinity;
    for (const c of world.covers) {
      if (!c.alive || c.lane !== this.lane) continue;
      if (c.claimedBy.length > 0 && !c.claimedBy.includes(this.id)) continue;
      const side = Math.sign(t.x - c.x) || 1;
      const spot = c.x - side * (c.w / 2 + 0.55);
      const distToSpot = Math.abs(spot - this.x);
      const distTarget = Math.abs(t.x - c.x);
      if (distToSpot > 9 || distTarget < 4 || distTarget > 18) continue;
      // Don't run past the player to reach cover.
      if (Math.sign(spot - this.x) === Math.sign(t.x - this.x) && Math.abs(spot - this.x) > Math.abs(t.x - this.x) - 3) continue;
      const score = distToSpot + Math.abs(distTarget - 10) * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  protected claimCover(c: CoverSpot): void {
    if (this.cover && this.cover !== c) this.releaseCover();
    this.cover = c;
    if (!c.claimedBy.includes(this.id)) c.claimedBy.push(this.id);
  }

  protected releaseCover(): void {
    if (!this.cover) return;
    const i = this.cover.claimedBy.indexOf(this.id);
    if (i >= 0) this.cover.claimedBy.splice(i, 1);
    this.cover = null;
  }

  protected coverSpotX(): number | null {
    const c = this.cover;
    const t = this.target;
    if (!c || !t) return null;
    const side = Math.sign(t.x - c.x) || 1;
    return c.x - side * (c.w / 2 + 0.55);
  }

  /** Simple patrol between two points with pauses. */
  protected doPatrol(dt: number, world: World): void {
    if (!this.patrol) return;
    if (this.patrolWait > 0) {
      this.patrolWait -= dt;
      return;
    }
    const [a, b] = this.patrol;
    const goal = this.patrolDir > 0 ? b : a;
    this.facing = goal > this.x ? 1 : -1;
    if (this.moveTo(goal, 0.32, world)) {
      this.patrolDir *= -1;
      this.patrolWait = rand(1.2, 2.6);
    }
  }

  setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }
}
