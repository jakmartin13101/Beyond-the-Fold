// Thren Bulwark: shield unit with a directional hard-light barrier. It turns slowly,
// so flanking (jumping over, switching lanes) or overcharged plasma beats it.
import { rand } from '../../core/math';
import { DamageResult } from '../entity';
import { Enemy } from '../enemy';
import { DamageInfo, HitPart, Hurtbox, SpawnDef, makeDamage } from '../types';
import type { World } from '../world';

export class Bulwark extends Enemy {
  panelHp = 260;
  panelMax = 260;
  panelDownT = 0;
  panelHitT = 99;
  private turnT = 0;
  private bashCooldown = 0;

  constructor(spawn: SpawnDef, world: World) {
    super('bulwark', spawn, world);
    this.panelMax = this.panelHp = 260 * world.difficulty.enemyHealth;
  }

  get panelUp(): boolean {
    return this.panelDownT <= 0 && !this.dead;
  }

  getHurtboxes(out: Hurtbox[]): void {
    if (this.dead || this.entering) return;
    super.getHurtboxes(out);
    if (this.panelUp) {
      const px = this.facing > 0 ? this.x + this.w / 2 + 0.05 : this.x - this.w / 2 - 0.45;
      out.push({ x: px, y: this.y + 0.05, w: 0.4, h: this.def.height + 0.15, part: 'shieldPanel' });
    }
  }

  applyDamage(d: DamageInfo, part: HitPart, world: World): DamageResult {
    if (part === 'shieldPanel' && this.panelUp) {
      const mult = d.type === 'plasma' ? 2.2 : d.type === 'explosive' ? 1.6 : d.type === 'melee' ? 0.5 : 1;
      this.panelHp -= d.stripShield ? this.panelHp : d.amount * mult;
      this.panelHitT = 0;
      if (!this.aware) {
        this.aware = true;
        this.setState('alert');
      }
      if (this.panelHp <= 0) {
        this.panelHp = 0;
        this.panelDownT = 4.5;
        this.staggerT = 0.6;
        this.cancelAttack(world);
        world.events.emit('shieldBroken', { x: this.x + this.facing * 0.7, y: this.centerY(), z: this.z, isPlayer: false });
        this.vocal(world, 'pain', 0.5, true);
      }
      return { dealt: 0, shieldHit: true, headshot: false, killed: false, blocked: true };
    }
    return super.applyDamage(d, part, world);
  }

  protected think(dt: number, world: World): void {
    this.panelHitT += dt;
    this.bashCooldown -= dt;
    if (this.panelDownT > 0) {
      this.panelDownT -= dt;
      if (this.panelDownT <= 0) this.panelHp = this.panelMax;
    } else if (this.panelHitT > 2 && this.panelHp < this.panelMax) {
      this.panelHp = Math.min(this.panelMax, this.panelHp + 40 * dt);
    }

    const t = this.target;
    switch (this.state) {
      case 'idle':
        this.doPatrol(dt, world);
        if (this.aware) this.setState('alert');
        break;
      case 'alert':
        if (this.stateT < 0.05) {
          this.vocal(world, 'alert', 2, true);
          world.alertAllies(this, 16);
        }
        this.slowFace(dt, 0.25);
        if (this.stateT > this.reaction + 0.2) this.setState('combat');
        break;
      case 'combat': {
        if (!t) break;
        // Slow turning is the Bulwark's weakness.
        this.slowFace(dt, this.panelUp ? 0.75 : 0.35);
        const dist = this.targetDist;
        const facingTarget = Math.sign(t.x - this.x) === this.facing;
        if (dist < 2.1 && facingTarget && this.bashCooldown <= 0 && t.lane === this.lane) {
          this.bashCooldown = 2;
          this.setState('bash');
          world.events.emit('telegraph', { kind: 'melee', x: this.x, y: this.centerY(), z: this.z, duration: 0.35 });
          break;
        }
        const [minR, maxR] = this.def.preferredRange;
        if (facingTarget) {
          if (dist > maxR) this.moveTo(t.x, 0.8, world);
          else if (dist < minR && this.safeToMove(-this.facing, world)) this.desiredVx = -this.facing * this.def.speed * 0.5;
          if (this.panelUp || Math.random() < 0.5) this.tryRangedAttack(world);
        }
        break;
      }
      case 'bash':
        this.desiredVx = 0;
        if (this.stateT > 0.35 && this.stateT - dt <= 0.35 && t && t.lane === this.lane) {
          const dx = t.x - this.x;
          if (Math.abs(dx) < 2.4 && Math.sign(dx) === this.facing && Math.abs(t.y - this.y) < 1.8) {
            world.damageTarget(
              t,
              'body',
              makeDamage({
                amount: 30 * this.damageMult,
                type: 'melee',
                sourceId: this.id,
                sourceFaction: this.faction,
                dirX: this.facing,
                dirY: 0.4,
                x: t.x,
                y: t.centerY(),
                knockback: 6,
              }),
            );
            world.events.emit('melee', { x: t.x, y: t.centerY(), z: this.z, hit: true, byPlayer: false, dir: this.facing });
          }
          this.vx = this.facing * 5;
        }
        if (this.stateT > 0.8) this.setState('combat');
        break;
    }
  }

  private slowFace(dt: number, delay: number): void {
    const t = this.target;
    if (!t) return;
    const want = t.x > this.x ? 1 : -1;
    if (want !== this.facing) {
      this.turnT += dt;
      if (this.turnT > delay + rand(0, 0.15)) {
        this.facing = want;
        this.turnT = 0;
      }
    } else {
      this.turnT = 0;
    }
  }

  protected onStun(seconds: number, world: World): void {
    super.onStun(seconds, world);
  }
}
