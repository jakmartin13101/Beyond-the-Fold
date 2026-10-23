// Thren Skirmisher: ranged infantry. Keeps its preferred range, strafes, retreats to cover
// when its shield breaks, presses the attack when the player reloads and dodges grenades.
import { rand, randSign } from '../../core/math';
import { Enemy } from '../enemy';
import type { SpawnDef } from '../types';
import type { World } from '../world';

export class Skirmisher extends Enemy {
  private peekT = 0;
  private evadeDir = 0;

  constructor(spawn: SpawnDef, world: World, type = 'skirmisher') {
    super(type, spawn, world);
  }

  protected think(dt: number, world: World): void {
    const threat = this.grenadeThreat(world);
    if (threat !== 0 && this.state !== 'evade') {
      this.evadeDir = threat;
      this.crouching = false;
      this.cancelAttack(world);
      this.releaseCover();
      this.vocal(world, 'grenade', 0.5, true);
      world.alertAllies(this, 10);
      this.setState('evade');
      if (this.onGround && Math.random() < 0.6) {
        this.vy = this.def.jump * 0.8;
      }
    }

    switch (this.state) {
      case 'idle':
        this.crouching = false;
        this.doPatrol(dt, world);
        if (this.aware) this.setState('alert');
        break;

      case 'alert':
        this.crouching = false;
        this.faceTarget();
        if (this.stateT < 0.05) {
          this.vocal(world, 'alert', 2, true);
          world.alertAllies(this, 16);
        }
        if (this.stateT > this.reaction) this.setState('combat');
        break;

      case 'combat':
        this.combat(dt, world);
        break;

      case 'toCover': {
        this.crouching = false;
        const spot = this.coverSpotX();
        if (spot === null || !this.cover?.alive) {
          this.releaseCover();
          this.setState('combat');
          break;
        }
        this.facing = this.target && this.target.x > this.x ? 1 : -1;
        if (this.moveTo(spot, 1.15, world) || this.stateT > 3) {
          this.setState('inCover');
          this.peekT = rand(0.8, 1.6);
        }
        this.facing = spot > this.x ? 1 : -1;
        break;
      }

      case 'inCover': {
        const c = this.cover;
        const t = this.target;
        if (!c || !c.alive || !t) {
          this.releaseCover();
          this.setState('combat');
          break;
        }
        this.faceTarget();
        // Flanked: the target moved to our side of the cover.
        if (Math.sign(t.x - c.x) === Math.sign(this.x - c.x) || t.lane !== this.lane) {
          this.releaseCover();
          this.crouching = false;
          this.setState('combat');
          break;
        }
        const spot = this.coverSpotX();
        if (spot !== null) this.moveTo(spot, 0.6, world);
        this.peekT -= dt;
        if (this.attacking) {
          this.crouching = false;
        } else if (this.peekT > 0) {
          this.crouching = true;
        } else {
          this.crouching = false;
          if (!this.tryRangedAttack(world) && this.peekT < -1.2) this.peekT = rand(0.6, 1.4);
          else if (!this.attacking && this.peekT < -0.2) this.peekT = rand(1.0, 2.0);
        }
        // Leave cover when shields are back up (and not pressed by a reload window).
        if ((this.shield >= this.maxShield && this.stateT > 2.5) || this.stateT > 9) {
          this.releaseCover();
          this.crouching = false;
          this.setState('combat');
        }
        break;
      }

      case 'evade': {
        this.crouching = false;
        if (this.safeToMove(this.evadeDir, world)) this.desiredVx = this.evadeDir * this.def.speed * 1.35;
        if (this.stateT > 0.75) this.setState('combat');
        break;
      }

      case 'search': {
        this.crouching = false;
        if (this.sees) {
          this.setState('combat');
          break;
        }
        this.facing = this.lastSeenX > this.x ? 1 : -1;
        if (this.moveTo(this.lastSeenX, 0.6, world) || this.stateT > 6) {
          this.aware = false;
          this.patrol = [this.x - 3, this.x + 3];
          this.setState('idle');
        }
        break;
      }
    }
  }

  private combat(dt: number, world: World): void {
    const t = this.target;
    if (!t) {
      this.setState('search');
      return;
    }
    this.crouching = false;
    if (this.updateMelee(dt, world)) return;
    if (this.lostT > 3.5) {
      this.setState('search');
      return;
    }
    // Broken shields send us to cover.
    if (this.maxShield > 0 && this.shield <= 0 && this.lastShieldHit < 1.5 && !this.attacking) {
      const c = this.findCover(world);
      if (c) {
        this.claimCover(c);
        this.vocal(world, 'flee', 1.5);
        this.setState('toCover');
        return;
      }
    }

    const dist = this.targetDist;
    const [minR, maxR] = this.def.preferredRange;
    const pressing = this.pressT > 0;
    const lo = pressing ? minR * 0.5 : minR;
    const hi = pressing ? maxR * 0.6 : maxR;
    const dirToTarget = Math.sign(t.x - this.x) || 1;
    if (!this.attacking) this.faceTarget();

    if (dist > hi || !this.sees) {
      this.moveTo(t.x, this.sees ? 0.85 : 1, world);
    } else if (dist < lo) {
      if (this.safeToMove(-dirToTarget, world)) this.desiredVx = -dirToTarget * this.def.speed * 0.7;
    } else {
      // Strafe within the band so we're never a static target.
      this.strafeT -= dt;
      if (this.strafeT <= 0 || this.strafeTarget === null) {
        this.strafeTarget = this.x + randSign() * rand(1, 2.8);
        this.strafeT = rand(0.9, 2.0);
        // Occasionally take cover even with shields up.
        if (Math.random() < 0.18 && !this.attacking) {
          const c = this.findCover(world);
          if (c) {
            this.claimCover(c);
            this.setState('toCover');
            return;
          }
        }
      }
      const dir = Math.sign(this.strafeTarget - this.x);
      if (this.safeToMove(dir, world)) this.moveTo(this.strafeTarget, this.attacking ? 0.3 : 0.55, world);
      else this.strafeTarget = this.x - dir * 1.5;
    }
    this.tryRangedAttack(world);
  }
}
