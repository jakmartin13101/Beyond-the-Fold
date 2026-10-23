// Base classes for simulated objects.
import type { Surface } from '../core/events';
import { damp } from '../core/math';
import type { Body, Solid } from './physics';
import { DamageInfo, Faction, HitPart, Hurtbox, LANE_Z } from './types';
import type { World } from './world';

export type EntityKind = 'player' | 'enemy' | 'boss' | 'prop' | 'pickup' | 'hazard' | 'grenade';

let NEXT_ID = 1;

export abstract class Entity {
  readonly id = NEXT_ID++;
  abstract readonly kind: EntityKind;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  lane = 0;
  /** Rendered depth; eases toward the lane depth. */
  z = 0;
  pz = 0;
  removed = false;

  savePrev(): void {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
  }

  abstract update(dt: number, world: World): void;
}

export interface DamageResult {
  dealt: number;
  shieldHit: boolean;
  headshot: boolean;
  killed: boolean;
  blocked: boolean;
}

export interface Damageable {
  id: number;
  faction: Faction | 'neutral';
  lane: number;
  x: number;
  y: number;
  readonly alive: boolean;
  surface: Surface;
  getHurtboxes(out: Hurtbox[]): void;
  applyDamage(d: DamageInfo, part: HitPart, world: World, tag?: string): DamageResult;
  /** Optional: centre for explosions/homing. */
  centerY(): number;
}

export const NO_DAMAGE: DamageResult = { dealt: 0, shieldHit: false, headshot: false, killed: false, blocked: true };

/** A walking/flying character with physics, health and an optional energy shield. */
export abstract class Actor extends Entity implements Body, Damageable {
  vx = 0;
  vy = 0;
  w = 0.8;
  h = 1.9;
  onGround = false;
  groundSolid: Solid | null = null;
  dropThrough = 0;
  hitWall = 0;
  hitCeiling = false;
  facing = 1;
  faction: Faction = 'thren';
  surface: Surface = 'flesh';
  health = 100;
  maxHealth = 100;
  shield = 0;
  maxShield = 0;
  shieldDelay = 3;
  shieldRate = 30;
  shieldTimer = 0;
  dead = false;
  deadTime = 0;
  /** Seconds since last damage; used for flinch/shield effects in views. */
  lastHit = 99;
  lastShieldHit = 99;
  /** Lane switch animation. */
  laneFrom = 0;
  laneT = 1;
  knockX = 0;

  get alive(): boolean {
    return !this.dead;
  }

  centerY(): number {
    return this.y + this.h * 0.55;
  }

  abstract getHurtboxes(out: Hurtbox[]): void;
  abstract applyDamage(d: DamageInfo, part: HitPart, world: World, tag?: string): DamageResult;

  /** Shared shield regeneration. */
  updateShield(dt: number): void {
    if (this.maxShield <= 0 || this.dead) return;
    this.lastHit += dt;
    this.lastShieldHit += dt;
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
    } else if (this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRate * dt);
    }
  }

  updateLaneDepth(dt: number): void {
    if (this.laneT < 1) this.laneT = Math.min(1, this.laneT + dt / 0.22);
    const target = LANE_Z[this.lane];
    if (this.laneT >= 1) {
      this.z = damp(this.z, target, 30, dt);
    } else {
      const from = LANE_Z[this.laneFrom];
      const t = this.laneT;
      const e = t * t * (3 - 2 * t);
      this.z = from + (target - from) * e;
    }
  }

  /** Standard body-and-head hurtboxes. */
  standardHurtboxes(out: Hurtbox[], height: number, headH: number): void {
    const hw = this.w / 2;
    if (headH > 0) {
      out.push({ x: this.x - hw * 0.85, y: this.y + height - headH, w: this.w * 0.85, h: headH, part: 'head' });
      out.push({ x: this.x - hw, y: this.y, w: this.w, h: height - headH, part: 'body' });
    } else {
      out.push({ x: this.x - hw, y: this.y, w: this.w, h: height, part: 'body' });
    }
  }
}
