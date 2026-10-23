// Thren Ravager: berserker. Stalks, telegraphs with a roar, then charges in a straight line.
// Missing the charge into a wall leaves it dazed and vulnerable.
import { clamp, rand } from '../../core/math';
import { Enemy } from '../enemy';
import { DamageInfo, HitPart, SpawnDef, makeDamage } from '../types';
import type { World } from '../world';

export class Ravager extends Enemy {
  chargeDir = 1;
  private chargeDist = 0;
  private hitDuringCharge = false;
  dazedT = 0;

  constructor(spawn: SpawnDef, world: World) {
    super('ravager', spawn, world);
  }

  protected damageTakenMult(_d: DamageInfo, _part: HitPart): number {
    return this.dazedT > 0 ? 1.6 : 1;
  }

  protected think(dt: number, world: World): void {
    const t = this.target;
    if (this.dazedT > 0) {
      this.dazedT -= dt;
      this.desiredVx = 0;
      if (this.dazedT <= 0) this.setState('stalk');
      return;
    }
    switch (this.state) {
      case 'idle':
        this.doPatrol(dt, world);
        if (this.aware) this.setState('alert');
        break;
      case 'alert':
        this.faceTarget();
        if (this.stateT < 0.05) {
          this.vocal(world, 'alert', 2, true);
          world.alertAllies(this, 14);
          world.events.emit('telegraph', { kind: 'roar', x: this.x, y: this.centerY(), z: this.z, duration: 0.8 });
        }
        if (this.stateT > 0.8) this.setState('stalk');
        break;
      case 'stalk': {
        if (!t) {
          this.doPatrol(dt, world);
          break;
        }
        if (this.updateMelee(dt, world)) break;
        this.faceTarget();
        const dist = this.targetDist;
        if (dist > 3) this.moveTo(t.x, dist > 10 ? 1 : 0.7, world);
        const canCharge =
          dist > 3.2 && dist < 13 && t.lane === this.lane && this.sees && this.onGround && Math.abs(t.y - this.y) < 2.2 && this.attackCooldown <= 0;
        if (canCharge && world.director.requestToken(this, 'charge')) {
          this.hasToken = true;
          this.setState('windup');
          this.vocal(world, 'charge', 0.5, true);
          world.events.emit('telegraph', { kind: 'charge', x: this.x, y: this.centerY(), z: this.z, duration: 0.6 });
        }
        break;
      }
      case 'windup':
        this.faceTarget();
        this.desiredVx = 0;
        this.crouching = true;
        if (this.stateT > 0.6 * clamp(this.reaction / 0.4, 0.75, 1.3)) {
          this.crouching = false;
          this.chargeDir = this.facing;
          this.chargeDist = 0;
          this.hitDuringCharge = false;
          this.setState('charge');
        }
        break;
      case 'charge': {
        this.facing = this.chargeDir;
        this.vx = this.chargeDir * 13.5;
        this.desiredVx = this.vx;
        this.chargeDist += Math.abs(this.vx) * dt;
        world.smashCover(this, this.chargeDir);
        // Hit anything hostile in our path.
        for (const a of world.actorsNear(this.x, 2)) {
          if (a === this || a.dead || a.lane !== this.lane || a.faction === this.faction || this.hitDuringCharge) continue;
          if (Math.abs(a.x - this.x) < (a.w + this.w) / 2 + 0.3 && Math.abs(a.y - this.y) < 1.8) {
            this.hitDuringCharge = true;
            world.damageTarget(
              a,
              'body',
              makeDamage({
                amount: 48 * this.damageMult,
                type: 'melee',
                sourceId: this.id,
                sourceFaction: this.faction,
                dirX: this.chargeDir,
                dirY: 0.5,
                x: a.x,
                y: a.centerY(),
                knockback: 7,
              }),
            );
            world.events.emit('melee', { x: a.x, y: a.centerY(), z: this.z, hit: true, byPlayer: false, dir: this.chargeDir });
            world.events.emit('cameraShake', { amount: 0.45 });
          }
        }
        if (this.hitWall !== 0 && this.stateT > 0.08) {
          // Slammed into a wall: dazed.
          this.dazedT = 1.5;
          this.vx = -this.chargeDir * 3;
          this.vy = 4;
          world.events.emit('cameraShake', { amount: 0.35 });
          world.events.emit('impact', { x: this.x + this.chargeDir * 0.8, y: this.y + 1.2, z: this.z, nx: -this.chargeDir, ny: 0, surface: 'rock', color: 0xffffff, size: 2 });
          this.endCharge(world);
          this.vocal(world, 'pain', 0.5, true);
          break;
        }
        if (this.hitDuringCharge || this.chargeDist > 15 || this.stateT > 1.3 || !this.safeToMove(this.chargeDir, world)) {
          this.endCharge(world);
        }
        break;
      }
      case 'recover':
        this.desiredVx = 0;
        if (this.stateT > 0.75) this.setState('stalk');
        break;
    }
  }

  private endCharge(world: World): void {
    if (this.hasToken) world.director.releaseToken(this);
    this.hasToken = false;
    this.attackCooldown = rand(1.6, 2.6) * (0.6 + this.reaction);
    if (this.dazedT <= 0) this.setState('recover');
    else this.setState('dazed');
  }

  protected onStun(seconds: number, world: World): void {
    super.onStun(seconds * 0.5, world);
    if (this.state === 'charge' || this.state === 'windup') this.endCharge(world);
  }
}
