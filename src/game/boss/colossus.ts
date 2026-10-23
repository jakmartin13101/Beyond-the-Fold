// CX-90 "Colossus" siege walker: the Mission 01 mini-boss.
// Multiple phases, destructible armor, a precision sensor weak point, an exposed reactor core,
// telegraphed attacks (autocannon sweep, missile barrage, stomp shockwave, sensor beam) and
// environmental interaction with the arena's fuel tanks.
import { clamp, rand, randSign } from '../../core/math';
import { ENEMY_WEAPONS } from '../../data/weapons';
import { Actor, DamageResult, NO_DAMAGE } from '../entity';
import { DamageInfo, HitPart, Hurtbox, makeDamage } from '../types';
import type { World } from '../world';

export type BossAttack = 'cannon' | 'missiles' | 'stomp' | 'beam' | 'none';

interface Shockwave {
  x: number;
  dir: number;
  dist: number;
  hit: boolean;
}

interface PendingMissile {
  x: number;
  y: number;
  lane: number;
  t: number;
  launched: boolean;
}

export class Colossus extends Actor {
  readonly kind = 'boss' as const;
  readonly name = 'CX-90 COLOSSUS';
  phase = 1;
  plateHp: number;
  plateMax: number;
  podHp: number;
  podMax: number;
  attack: BossAttack = 'none';
  attackT = 0;
  attackDur = 0;
  cooldown = 2.5;
  telegraph = 0;
  aimAngle = Math.PI;
  lockedAngle = Math.PI;
  beamY = 0;
  beamX0 = 0;
  beamX1 = 0;
  beamLane = 0;
  beamActive = false;
  beamCharge = 0;
  stompLeg = 0;
  staggerT = 0;
  ventT = 0;
  dyingT = 0;
  dying = false;
  walkPhase = 0;
  walkDir = -1;
  turnT = 0;
  arena: { left: number; right: number };
  shockwaves: Shockwave[] = [];
  missiles: PendingMissile[] = [];
  lastAttack: BossAttack = 'none';
  plateBroken = false;
  podBroken = false;
  hitFlash = 0;
  hitPart = '';
  active = false;
  summoned = false;
  private cannonShots = 0;
  private stepAccum = 0;
  private tankHintTimer = 20;
  private ammoHintGiven = false;
  /** 0..1 visual intensity of the reactor core glow. */
  coreHeat = 0.3;

  constructor(x: number, y: number, arena: { left: number; right: number }, world: World) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = -1.4;
    this.w = 4.2;
    this.h = 7;
    this.faction = 'rogue';
    this.surface = 'metal';
    const hpMult = world.difficulty.enemyHealth;
    this.maxHealth = this.health = 2100 * hpMult;
    this.plateMax = this.plateHp = 520 * hpMult;
    this.podMax = this.podHp = 300 * hpMult;
    this.arena = arena;
    this.facing = -1;
  }

  get alive(): boolean {
    return !this.dead && !this.dying;
  }

  centerY(): number {
    return this.y + 4.6;
  }

  /** Front-of-hull x for a given facing. */
  private front(): number {
    return this.x + this.facing * 2.1;
  }

  cannonMuzzle(): { x: number; y: number } {
    return { x: this.x + this.facing * 2.9, y: this.y + 3.9 };
  }

  eyePos(): { x: number; y: number } {
    return { x: this.x + this.facing * 2.0, y: this.y + 6.0 };
  }

  getHurtboxes(out: Hurtbox[]): void {
    if (!this.alive || !this.active) return;
    const f = this.facing;
    // Legs
    out.push({ x: this.x - 1.9, y: this.y, w: 0.9, h: 3.4, part: 'armor', tag: 'leg' });
    out.push({ x: this.x + 1.0, y: this.y, w: 0.9, h: 3.4, part: 'armor', tag: 'leg' });
    // Hull
    out.push({ x: this.x - 2.2, y: this.y + 3.3, w: 4.4, h: 2.7, part: 'armor', tag: 'hull' });
    // Sensor head (weak point)
    const e = this.eyePos();
    out.push({ x: e.x - 0.55, y: e.y - 0.4, w: 1.1, h: 0.8, part: 'weak', tag: 'eye' });
    // Chest plate or exposed core on the front face.
    const fx = f > 0 ? this.front() - 0.4 : this.front() - 0.6;
    if (!this.plateBroken) out.push({ x: fx, y: this.y + 3.6, w: 1.0, h: 2.1, part: 'armor', tag: 'plate' });
    else out.push({ x: fx, y: this.y + 3.9, w: 1.0, h: 1.5, part: 'core', tag: 'core' });
    // Missile pod on the shoulder.
    if (!this.podBroken) out.push({ x: this.x - f * 0.6 - 0.8, y: this.y + 6.0, w: 1.6, h: 1.1, part: 'armor', tag: 'pod' });
  }

  applyDamage(d: DamageInfo, part: HitPart, world: World, tag?: string): DamageResult {
    if (!this.alive || !this.active) return NO_DAMAGE;
    let amount = d.amount;
    const explosive = d.explosive || d.type === 'explosive';
    let toHealth = 0;
    let hitPart = tag ?? part;
    if (tag === 'plate' && !this.plateBroken) {
      this.plateHp -= amount * d.armorMult * (explosive ? 1 : 0.8);
      toHealth = amount * 0.15 * d.armorMult;
      if (this.plateHp <= 0) this.breakPlate(world);
    } else if (tag === 'pod' && !this.podBroken) {
      this.podHp -= amount * d.armorMult;
      toHealth = amount * 0.15 * d.armorMult;
      if (this.podHp <= 0) {
        this.podBroken = true;
        world.events.emit('bossHit', { part: 'podDestroyed', x: this.x - this.facing * 0.6, y: this.y + 6.5 });
        world.events.emit('explosion', { x: this.x - this.facing * 0.6, y: this.y + 6.5, z: this.z, radius: 2.5, kind: 'small' });
        this.staggerT = Math.max(this.staggerT, 1.0);
      }
    } else if (part === 'weak') {
      toHealth = amount * (d.type === 'kinetic' ? d.headshotMult * 0.45 : 0.8);
      hitPart = 'eye';
    } else if (part === 'core') {
      toHealth = amount * 1.2 * (explosive ? 1.4 : 1);
    } else {
      toHealth = amount * 0.22 * d.armorMult;
    }
    if (this.ventT > 0) toHealth *= 1.8;
    this.health -= toHealth;
    this.hitFlash = 0.1;
    this.hitPart = hitPart;
    world.events.emit('bossHit', { part: hitPart, x: d.x, y: d.y });
    if (this.health <= 0) {
      this.health = 0;
      this.startDying(world);
      return { dealt: toHealth, shieldHit: false, headshot: part === 'weak', killed: true, blocked: false };
    }
    this.checkPhase(world);
    return { dealt: toHealth, shieldHit: false, headshot: part === 'weak', killed: false, blocked: toHealth < amount * 0.3 };
  }

  /** Massive damage from the arena's fuel tanks. */
  tankBlast(world: World): void {
    if (!this.alive) return;
    this.health -= 340 * world.difficulty.enemyHealth;
    this.plateHp -= 260;
    this.ventT = 3.2;
    this.staggerT = 2.4;
    this.cancelAttack();
    world.events.emit('boss', { phase: 'vent' });
    world.stats.tankHits++;
    if (!this.plateBroken && this.plateHp <= 0) this.breakPlate(world);
    if (this.health <= 0) {
      this.health = 0;
      this.startDying(world);
    } else {
      this.checkPhase(world);
    }
  }

  private breakPlate(world: World): void {
    if (this.plateBroken) return;
    this.plateBroken = true;
    this.plateHp = 0;
    this.staggerT = Math.max(this.staggerT, 1.6);
    this.cancelAttack();
    world.events.emit('bossHit', { part: 'plateDestroyed', x: this.front(), y: this.y + 4.6 });
    world.events.emit('explosion', { x: this.front(), y: this.y + 4.6, z: this.z + 1, radius: 3, kind: 'small' });
    world.events.emit('cameraShake', { amount: 0.5 });
    world.radio(['boss_armor']);
  }

  private checkPhase(world: World): void {
    const f = this.health / this.maxHealth;
    if (this.phase === 1 && f <= 0.6) {
      this.phase = 2;
      this.staggerT = 2.2;
      this.cancelAttack();
      if (!this.plateBroken) this.breakPlate(world);
      world.events.emit('boss', { phase: 'phase2' });
      world.events.emit('cameraShake', { amount: 0.6 });
      if (!this.summoned) {
        this.summoned = true;
        world.spawnEnemies([
          { type: 'drone', x: this.arena.right - 4, lane: 0, entry: 'hangar', alerted: true },
          { type: 'drone', x: this.arena.left + 6, lane: 0, entry: 'fly', alerted: true, delay: 1.5 },
        ]);
      }
    } else if (this.phase === 2 && f <= 0.25) {
      this.phase = 3;
      this.staggerT = 1.6;
      this.cancelAttack();
      world.events.emit('boss', { phase: 'phase3' });
      world.radio(['boss_phase3']);
    }
  }

  private startDying(world: World): void {
    if (this.dying) return;
    this.dying = true;
    this.dyingT = 0;
    this.cancelAttack();
    this.shockwaves.length = 0;
    this.missiles.length = 0;
    world.onBossDying(this);
  }

  private cancelAttack(): void {
    this.attack = 'none';
    this.telegraph = 0;
    this.beamActive = false;
    this.beamCharge = 0;
    this.missiles = this.missiles.filter((m) => m.launched);
  }

  update(dt: number, world: World): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.coreHeat = clamp(0.3 + (1 - this.health / this.maxHealth) * 0.7 + (this.ventT > 0 ? 0.5 : 0), 0, 1.5);
    if (this.dying) {
      this.dyingT += dt;
      if (Math.random() < dt * 6 && this.dyingT < 3.2) {
        world.events.emit('explosion', {
          x: this.x + rand(-2, 2),
          y: this.y + rand(1, 6.5),
          z: this.z + rand(-0.5, 1.5),
          radius: rand(1.2, 2.4),
          kind: 'small',
        });
        world.events.emit('cameraShake', { amount: 0.2 });
      }
      if (this.dyingT > 3.6 && !this.dead) {
        this.dead = true;
        world.events.emit('explosion', { x: this.x, y: this.y + 4, z: this.z, radius: 7, kind: 'boss' });
        world.events.emit('cameraShake', { amount: 1.2 });
        world.onBossDefeated(this);
      }
      return;
    }
    if (!this.active) return;
    const p = world.player;
    this.lane = p.lane;
    this.updateShockwaves(dt, world);
    if (this.ventT > 0) this.ventT -= dt;

    // Hint at environmental interaction if the player hasn't used the tanks.
    this.tankHintTimer -= dt;
    if (this.tankHintTimer <= 0 && world.stats.tankHits === 0 && world.liveTanks() > 0) {
      world.radio(['boss_tank']);
      this.tankHintTimer = 45;
    }
    if (!this.ammoHintGiven && p.hasWeapon('rocket') && p.hasWeapon('rocket')!.mag + p.hasWeapon('rocket')!.reserve === 0) {
      this.ammoHintGiven = true;
      world.radio(['boss_ammo']);
    }

    if (this.staggerT > 0) {
      this.staggerT -= dt;
      return;
    }

    // Contact damage: legs shove the player away.
    if (!p.dead && Math.abs(p.x - this.x) < 2.3 && p.y < this.y + 3.2) {
      const dir = p.x >= this.x ? 1 : -1;
      if (p.invuln <= 0 && p.lastHit > 0.6) {
        world.damageTarget(
          p,
          'body',
          makeDamage({ amount: 12 * world.difficulty.enemyDamage, type: 'melee', sourceId: this.id, sourceFaction: 'rogue', dirX: dir, dirY: 0.5, x: p.x, y: p.y + 1, knockback: 5 }),
        );
      }
      p.knockX += dir * 0.8;
    }

    // Facing: turn slowly toward the player.
    const want = p.x > this.x ? 1 : -1;
    if (want !== this.facing && this.attack === 'none') {
      this.turnT += dt;
      if (this.turnT > 0.9) {
        this.facing = want;
        this.turnT = 0;
      }
    } else {
      this.turnT = 0;
    }

    const speedMult = this.phase === 3 ? 1.35 : 1;
    if (this.attack === 'none') {
      // Walk to keep a mid-range distance from the player.
      const dist = p.x - this.x;
      const desired = p.x - Math.sign(dist || 1) * 9;
      const target = clamp(desired, this.arena.left + 4.5, this.arena.right - 4.5);
      const dx = target - this.x;
      if (Math.abs(dx) > 0.6) {
        this.walkDir = Math.sign(dx);
        this.vx = this.walkDir * 2.1 * speedMult;
      } else {
        this.vx = 0;
      }
      this.cooldown -= dt * speedMult;
      if (this.cooldown <= 0) this.chooseAttack(world);
    } else {
      this.vx = 0;
      this.updateAttack(dt, world);
    }
    this.x += this.vx * dt;
    this.x = clamp(this.x, this.arena.left + 3, this.arena.right - 3);
    if (Math.abs(this.vx) > 0.1) {
      this.walkPhase += dt * 2.4 * speedMult;
      this.stepAccum += dt * 2.4 * speedMult;
      if (this.stepAccum > Math.PI) {
        this.stepAccum -= Math.PI;
        world.events.emit('footstep', { x: this.x, y: this.y, z: this.z, heavy: 3, isPlayer: false, surface: 'metal' });
        world.events.emit('cameraShake', { amount: 0.12 });
      }
    }
  }

  private chooseAttack(world: World): void {
    const p = world.player;
    const dist = Math.abs(p.x - this.x);
    const options: Array<[BossAttack, number]> = [];
    if (dist < 6) options.push(['stomp', 3]);
    options.push(['cannon', this.lastAttack === 'cannon' ? 1 : 3]);
    if (!this.podBroken) options.push(['missiles', this.lastAttack === 'missiles' ? 0.5 : 2.5]);
    if (this.phase >= 2) options.push(['beam', this.lastAttack === 'beam' ? 0.5 : 2.5]);
    let total = 0;
    for (const o of options) total += o[1];
    let r = Math.random() * total;
    let pick: BossAttack = 'cannon';
    for (const o of options) {
      r -= o[1];
      if (r <= 0) {
        pick = o[0];
        break;
      }
    }
    this.startAttack(pick, world);
  }

  private startAttack(a: BossAttack, world: World): void {
    const p = world.player;
    this.attack = a;
    this.attackT = 0;
    this.lastAttack = a;
    this.facing = p.x > this.x ? 1 : -1;
    const fast = this.phase === 3 ? 0.75 : 1;
    switch (a) {
      case 'cannon':
        this.telegraph = 1.0 * fast;
        this.attackDur = this.telegraph + 1.6;
        this.cannonShots = 0;
        world.events.emit('telegraph', { kind: 'bossCannon', x: this.x, y: this.y + 4, z: this.z, duration: this.telegraph });
        break;
      case 'missiles': {
        this.telegraph = 0.7 * fast;
        const count = this.phase === 3 ? 10 : this.phase === 2 ? 8 : 6;
        this.attackDur = this.telegraph + 0.8;
        this.missiles = [];
        for (let i = 0; i < count; i++) {
          const mx = clamp(p.x + (i === 0 ? 0 : rand(-6, 6)) + p.vx * 0.6, this.arena.left + 1, this.arena.right - 1);
          const g = world.solids.groundBelow(mx, p.y + 6, p.lane === 0 ? 1 : 2, 20) ?? p.y;
          this.missiles.push({ x: mx, y: g, lane: p.lane, t: this.telegraph + 1.5 + i * 0.16, launched: false });
        }
        world.events.emit('telegraph', { kind: 'bossPod', x: this.x, y: this.y + 6.5, z: this.z, duration: this.telegraph });
        break;
      }
      case 'stomp':
        this.telegraph = 0.75 * fast;
        this.attackDur = this.telegraph + 0.7;
        this.stompLeg = p.x > this.x ? 1 : -1;
        world.events.emit('telegraph', { kind: 'bossStomp', x: this.x + this.stompLeg * 1.4, y: this.y, z: this.z, duration: this.telegraph });
        break;
      case 'beam': {
        this.telegraph = 1.25 * fast;
        this.attackDur = this.telegraph + 1.7;
        this.beamLane = p.lane;
        const g = world.solids.groundBelow(p.x, p.y + 1, p.lane === 0 ? 1 : 2, 10) ?? p.y;
        this.beamY = g + 1.5;
        this.beamCharge = 0;
        world.events.emit('telegraph', { kind: 'bossBeam', x: this.eyePos().x, y: this.beamY, z: this.z, duration: this.telegraph });
        break;
      }
    }
  }

  private updateAttack(dt: number, world: World): void {
    const p = world.player;
    this.attackT += dt;
    const inTele = this.attackT < this.telegraph;
    switch (this.attack) {
      case 'cannon': {
        const m = this.cannonMuzzle();
        const want = Math.atan2(p.y + 1.1 - m.y, p.x - m.x);
        if (inTele) {
          // Track the player, then lock shortly before firing.
          if (this.attackT < this.telegraph - 0.25) this.aimAngle = want;
          this.lockedAngle = this.aimAngle;
        } else {
          // Sweep slowly toward the player's current position.
          let d = want - this.aimAngle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          this.aimAngle += clamp(d, -0.5 * dt, 0.5 * dt);
          const rate = this.phase === 3 ? 0.075 : 0.1;
          const shotsDue = Math.floor((this.attackT - this.telegraph) / rate);
          while (this.cannonShots < shotsDue && this.cannonShots < 16) {
            this.cannonShots++;
            const def = ENEMY_WEAPONS.colossusCannon;
            const a = this.aimAngle + rand(-0.04, 0.04);
            const sp = def.projectile.speed * world.difficulty.projectileSpeed;
            world.spawnProjectile({
              x: m.x,
              y: m.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              lane: p.lane,
              def: def.projectile,
              damage: def.damage * world.difficulty.enemyDamage,
              faction: 'rogue',
              byPlayer: false,
              sourceId: this.id,
              headshotMult: 1,
              shieldMult: 1,
              armorMult: 1,
              weaponId: def.id,
            });
            world.events.emit('shot', { weaponId: def.id, x: m.x, y: m.y, z: this.z + 1.2, angle: a, byPlayer: false });
          }
        }
        break;
      }
      case 'missiles': {
        for (const ms of this.missiles) {
          if (!ms.launched && this.attackT >= ms.t - 0.7) {
            ms.launched = true;
            const def = ENEMY_WEAPONS.colossusMissile;
            world.spawnProjectile({
              x: ms.x + randSign() * 0.4,
              y: ms.y + 17,
              vx: 0,
              vy: -24,
              lane: ms.lane,
              def: { ...def.projectile, gravity: 0, life: 2 },
              damage: def.damage * world.difficulty.enemyDamage,
              faction: 'rogue',
              byPlayer: false,
              sourceId: this.id,
              headshotMult: 1,
              shieldMult: 1,
              armorMult: 1,
              weaponId: def.id,
            });
          }
        }
        if (this.attackT >= this.telegraph && this.attackT - dt < this.telegraph) {
          world.events.emit('shot', { weaponId: 'colossusMissile', x: this.x, y: this.y + 7, z: this.z, angle: Math.PI / 2, byPlayer: false });
          for (const ms of this.missiles) {
            world.events.emit('telegraph', { kind: 'missileTarget', x: ms.x, y: ms.y, z: ms.lane === 0 ? 0 : -3.2, duration: ms.t - this.attackT });
          }
        }
        // The attack ends once the salvo is launched; missiles continue independently.
        if (this.attackT > this.attackDur && this.missiles.every((m) => m.launched)) this.endAttack(1.4);
        return;
      }
      case 'stomp':
        if (!inTele && this.attackT - dt < this.telegraph) {
          const sx = this.x + this.stompLeg * 1.4;
          this.shockwaves.push({ x: sx, dir: 1, dist: 0, hit: false }, { x: sx, dir: -1, dist: 0, hit: false });
          world.events.emit('explosion', { x: sx, y: this.y + 0.2, z: this.z, radius: 2, kind: 'small' });
          world.events.emit('cameraShake', { amount: 0.7 });
        }
        break;
      case 'beam': {
        const e = this.eyePos();
        if (inTele) {
          this.beamCharge = this.attackT / this.telegraph;
        } else {
          this.beamActive = true;
          const t = (this.attackT - this.telegraph) / (this.attackDur - this.telegraph);
          // The beam extends outward from the eye across the lane.
          const reach = 4 + t * 26;
          this.beamX0 = e.x;
          this.beamX1 = e.x + this.facing * reach;
          if (p.lane === this.beamLane && !p.dead) {
            const top = p.y + p.h;
            const inX = this.facing > 0 ? p.x > this.beamX0 && p.x < this.beamX1 : p.x < this.beamX0 && p.x > this.beamX1;
            const hitsBody = p.y < this.beamY + 0.25 && top > this.beamY - 0.25;
            if (inX && hitsBody && p.lastHit > 0.25) {
              world.damageTarget(
                p,
                'body',
                makeDamage({ amount: 22 * world.difficulty.enemyDamage, type: 'energy', sourceId: this.id, sourceFaction: 'rogue', dirX: this.facing, dirY: 0, x: p.x, y: this.beamY, knockback: 1 }),
              );
            }
          }
        }
        break;
      }
    }
    if (this.attackT >= this.attackDur) this.endAttack(this.attack === 'beam' ? 1.8 : 1.3);
  }

  private endAttack(cool: number): void {
    this.attack = 'none';
    this.beamActive = false;
    this.beamCharge = 0;
    this.telegraph = 0;
    this.cooldown = cool * (this.phase === 3 ? 0.65 : this.phase === 2 ? 0.85 : 1) + rand(0, 0.8);
  }

  private updateShockwaves(dt: number, world: World): void {
    const p = world.player;
    for (const s of this.shockwaves) {
      s.dist += 13 * dt;
      const sx = s.x + s.dir * s.dist;
      if (!s.hit && !p.dead && Math.abs(p.x - sx) < 0.6 && p.y < this.y + 0.9 && p.onGround) {
        s.hit = true;
        world.damageTarget(
          p,
          'body',
          makeDamage({ amount: 32 * world.difficulty.enemyDamage, type: 'explosive', sourceId: this.id, sourceFaction: 'rogue', dirX: s.dir, dirY: 1, x: p.x, y: p.y, knockback: 4 }),
        );
      }
    }
    this.shockwaves = this.shockwaves.filter((s) => s.dist < 11);
  }
}
