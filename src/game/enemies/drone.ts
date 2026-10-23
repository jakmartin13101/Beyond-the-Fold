// Halden "Watchdog" combat drone: a station security machine whose friend-or-foe has been
// corrupted. Hovers, strafes, fires bolt bursts, jinks when hit and crashes when destroyed.
import { clamp, damp, rand, randSign } from '../../core/math';
import { Enemy } from '../enemy';
import { DamageInfo, GRAVITY, HitPart, Hurtbox, SpawnDef } from '../types';
import type { World } from '../world';
import type { DamageResult } from '../entity';

export class Drone extends Enemy {
  private hoverPhase = Math.random() * 10;
  private jinkT = 0;
  private side = randSign();
  private sideT = 0;
  homeX: number;
  homeY: number;
  rotorSpin = 0;
  crashed = false;
  private fallT = 0;

  constructor(spawn: SpawnDef, world: World) {
    super('drone', spawn, world);
    const g = world.solids.groundBelow(spawn.x, 30, this.lane === 0 ? 1 : 2, 80) ?? 0;
    const hoverY = spawn.y ?? g + 3.6;
    if (this.entering) this.entryTo.y = hoverY;
    else this.y = this.py = hoverY;
    this.homeX = spawn.x;
    this.homeY = hoverY;
    this.onGround = false;
  }

  getHurtboxes(out: Hurtbox[]): void {
    if (this.dead || this.entering) return;
    out.push({ x: this.x - 0.55, y: this.y, w: 1.1, h: 1.0, part: 'body' });
    // The lens is a precision weak spot.
    out.push({ x: this.x + (this.facing > 0 ? 0.15 : -0.45), y: this.y + 0.3, w: 0.3, h: 0.4, part: 'head' });
  }

  centerY(): number {
    return this.y + 0.5;
  }

  applyDamage(d: DamageInfo, part: HitPart, world: World): DamageResult {
    const r = super.applyDamage(d, part, world);
    if (!this.dead && r.dealt > 0 && this.jinkT <= 0) {
      this.jinkT = 0.35;
      this.vx += randSign() * 5;
      this.vy += rand(-2, 4);
    }
    return r;
  }

  protected onStun(seconds: number, world: World): void {
    // EMP from an overcharged plasma bolt disables drones completely.
    this.stunT = Math.max(this.stunT, seconds);
    this.cancelAttack(world);
  }

  update(dt: number, world: World): void {
    this.rotorSpin += dt * (this.stunT > 0 ? 4 : 30);
    if (this.dead && !this.entering) {
      this.updateLaneDepth(dt);
      this.fallT += dt;
      if (!this.crashed) {
        this.vy -= GRAVITY * 0.7 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx = damp(this.vx, 0, 1, dt);
        const g = world.solids.pointSolid(this.x, this.y, this.lane === 0 ? 1 : 2);
        if (g || this.fallT > 1.6 || this.y < world.level.killY) {
          this.crashed = true;
          world.explode({
            x: this.x,
            y: this.y + 0.4,
            lane: this.lane,
            radius: 2.6,
            damage: 30,
            kind: 'drone',
            byPlayer: false,
            faction: 'neutral',
            sourceId: this.id,
            shieldMult: 1,
          });
          this.removed = true;
        }
      }
      return;
    }
    super.update(dt, world);
  }

  protected applyMovement(dt: number, world: World): void {
    // Flying: steering with acceleration and a hover bob.
    if (this.stunT > 0) {
      this.vy = damp(this.vy, -2.5, 3, dt);
      this.vx = damp(this.vx, 0, 2, dt);
      const ground = world.solids.groundBelow(this.x, this.y + 0.5, this.lane === 0 ? 1 : 2, 30);
      if (ground !== null && this.y < ground + 0.6) {
        this.y = ground + 0.6;
        this.vy = 0;
      }
    }
    if (this.knockX !== 0) {
      this.vx += this.knockX;
      this.knockX = 0;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Keep out of solid geometry.
    const mask = this.lane === 0 ? 1 : 2;
    const s = world.solids.rectBlocked(this.x - 0.5, this.y, 1, 1, mask);
    if (s) {
      const top = s.y + s.h;
      if (this.y < top && this.y > top - 1.2) {
        this.y = top;
        this.vy = Math.abs(this.vy) * 0.3;
      } else if (this.x < s.x + s.w / 2) {
        this.x = s.x - 0.51;
        this.vx = -Math.abs(this.vx) * 0.5;
      } else {
        this.x = s.x + s.w + 0.51;
        this.vx = Math.abs(this.vx) * 0.5;
      }
    }
    const lock = world.arenaLock;
    if (lock) this.x = clamp(this.x, lock.left + 0.6, lock.right - 0.6);
  }

  protected think(dt: number, world: World): void {
    this.hoverPhase += dt;
    this.jinkT -= dt;
    const t = this.target;
    let gx = this.homeX + Math.sin(this.hoverPhase * 0.4) * 3;
    let gy = this.homeY + Math.sin(this.hoverPhase * 1.7) * 0.35;
    if (this.state === 'idle' && this.aware) this.setState('alert');
    if (this.state === 'alert') {
      if (this.stateT < 0.05) {
        this.vocal(world, 'alert', 2, true);
        world.alertAllies(this, 18);
      }
      if (this.stateT > this.reaction) this.setState('combat');
    }
    if (this.state === 'combat' && t) {
      this.sideT -= dt;
      if (this.sideT <= 0) {
        this.sideT = rand(2.5, 5);
        // Mostly hold the side we're on, occasionally swap to flank.
        const cur = Math.sign(this.x - t.x) || 1;
        this.side = Math.random() < 0.25 ? -cur : cur;
      }
      const [minR, maxR] = this.def.preferredRange;
      const range = (minR + maxR) / 2 + Math.sin(this.hoverPhase * 0.7) * 2.5;
      gx = t.x + this.side * range;
      const ground = world.solids.groundBelow(t.x, t.y + 0.5, t.lane === 0 ? 1 : 2, 20) ?? t.y;
      gy = Math.max(t.y, ground) + 3.4 + Math.sin(this.hoverPhase * 1.3) * 0.9;
      this.facing = t.x > this.x ? 1 : -1;
      this.tryRangedAttack(world);
      if (this.lostT > 6) {
        this.aware = false;
        this.homeX = this.x;
        this.setState('idle');
      }
    }
    const lock = world.arenaLock;
    if (lock) gx = clamp(gx, lock.left + 1, lock.right - 1);
    const ax = clamp((gx - this.x) * 3 - this.vx * 1.8, -this.def.accel, this.def.accel);
    const ay = clamp((gy - this.y) * 4 - this.vy * 2.2, -this.def.accel, this.def.accel);
    this.vx += ax * dt;
    this.vy += ay * dt;
    const sp = Math.hypot(this.vx, this.vy);
    const max = this.def.speed;
    if (sp > max) {
      this.vx *= max / sp;
      this.vy *= max / sp;
    }
  }

  protected muzzle(): { x: number; y: number; ox: number; oy: number } {
    const oy = this.y + 0.45;
    return { x: this.x + Math.cos(this.aimAngle) * 0.7, y: oy + Math.sin(this.aimAngle) * 0.7, ox: this.x, oy };
  }
}
