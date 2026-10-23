// Projectile simulation: swept collision against level geometry and hurtboxes,
// ricochets, homing, explosives and damage falloff.
import { clamp, segmentRect } from '../core/math';
import type { ProjectileDef } from '../data/weapons';
import type { Damageable } from './entity';
import { DamageInfo, Faction, Hurtbox, makeDamage } from './types';
import type { World } from './world';

export interface ProjectileSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lane: number;
  def: ProjectileDef;
  damage: number;
  faction: Faction | 'neutral';
  byPlayer: boolean;
  sourceId: number;
  headshotMult: number;
  shieldMult: number;
  armorMult: number;
  weaponId: string;
  charged?: boolean;
  homing?: number;
  homingTarget?: Damageable | null;
  stripShield?: boolean;
  stun?: number;
  falloff?: { start: number; end: number; min: number };
}

export class Projectile {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  lane: number;
  def: ProjectileDef;
  damage: number;
  faction: Faction | 'neutral';
  byPlayer: boolean;
  sourceId: number;
  headshotMult: number;
  shieldMult: number;
  armorMult: number;
  weaponId: string;
  charged: boolean;
  homing: number;
  homingTarget: Damageable | null;
  stripShield: boolean;
  stun: number;
  falloff?: { start: number; end: number; min: number };
  startX: number;
  startY: number;
  age = 0;
  bounces: number;
  alive = true;
  /** For views: seconds since last bounce (sparkle). */
  bounced = 99;

  constructor(s: ProjectileSpawn) {
    this.x = this.px = this.startX = s.x;
    this.y = this.py = this.startY = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.lane = s.lane;
    this.def = s.def;
    this.damage = s.damage;
    this.faction = s.faction;
    this.byPlayer = s.byPlayer;
    this.sourceId = s.sourceId;
    this.headshotMult = s.headshotMult;
    this.shieldMult = s.shieldMult;
    this.armorMult = s.armorMult;
    this.weaponId = s.weaponId;
    this.charged = !!s.charged;
    this.homing = s.homing ?? 0;
    this.homingTarget = s.homingTarget ?? null;
    this.stripShield = !!s.stripShield;
    this.stun = s.stun ?? 0;
    this.falloff = s.falloff;
    this.bounces = s.def.bounces ?? 0;
  }
}

const hurtScratch: Hurtbox[] = [];

export function hostile(a: Faction | 'neutral', b: Faction | 'neutral'): boolean {
  return a !== b;
}

export function updateProjectile(p: Projectile, dt: number, world: World): void {
  p.px = p.x;
  p.py = p.y;
  p.age += dt;
  p.bounced += dt;
  const def = p.def;

  if (p.age >= def.life) {
    if (def.explosive) world.explodeProjectile(p, p.x, p.y);
    p.alive = false;
    return;
  }

  // Homing steers toward the target's centre while it stays in our lane.
  if (p.homing > 0) {
    let target = p.homingTarget;
    if (!target || !target.alive || target.lane !== p.lane) {
      target = world.findHomingTarget(p);
      p.homingTarget = target;
    }
    if (target) {
      const tx = target.x - p.x;
      const ty = target.centerY() - p.y;
      const speed = Math.hypot(p.vx, p.vy);
      const cur = Math.atan2(p.vy, p.vx);
      const want = Math.atan2(ty, tx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = clamp(d, -p.homing * dt, p.homing * dt);
      const a = cur + turn;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
    }
  }

  if (def.accel) {
    const speed = Math.hypot(p.vx, p.vy);
    const ns = Math.min(speed + def.accel * dt, 60);
    p.vx *= ns / speed;
    p.vy *= ns / speed;
  }
  if (def.gravity) p.vy -= def.gravity * dt;

  let remaining = 1;
  let guard = 0;
  while (remaining > 0 && p.alive && guard++ < 4) {
    const x0 = p.x;
    const y0 = p.y;
    const x1 = x0 + p.vx * dt * remaining;
    const y1 = y0 + p.vy * dt * remaining;
    const mask = p.lane === 0 ? 1 : 2;
    const solidHit = world.solids.raycast(x0, y0, x1, y1, mask);
    let bestT = solidHit ? solidHit.t : 2;
    let bestTarget: Damageable | null = null;
    let bestBox: Hurtbox | null = null;

    for (const d of world.damageables) {
      if (!d.alive || d.lane !== p.lane || d.id === p.sourceId) continue;
      if (!hostile(p.faction, d.faction)) continue;
      // Broad phase.
      const dx = d.x - x0;
      if (Math.abs(dx) > Math.abs(x1 - x0) + 12) continue;
      hurtScratch.length = 0;
      d.getHurtboxes(hurtScratch);
      for (const hb of hurtScratch) {
        const hit = segmentRect(x0, y0, x1, y1, hb, def.radius);
        if (hit && hit.t < bestT - 1e-6) {
          bestT = hit.t;
          bestTarget = d;
          bestBox = hb;
        } else if (hit && bestTarget === d && bestBox && hit.t <= bestT + 0.02 && priority(hb.part) > priority(bestBox.part)) {
          // When boxes overlap at the entry point, prefer the more specific part (head, shield panel).
          bestBox = hb;
        }
      }
    }

    if (bestTarget && bestBox) {
      const hx = x0 + (x1 - x0) * bestT;
      const hy = y0 + (y1 - y0) * bestT;
      p.x = hx;
      p.y = hy;
      if (def.explosive) {
        // Direct hit damage then the blast.
        world.damageTarget(bestTarget, bestBox.part, projectileDamage(p, hx, hy), bestBox.tag);
        world.explodeProjectile(p, hx, hy);
        p.alive = false;
        return;
      }
      world.damageTarget(bestTarget, bestBox.part, projectileDamage(p, hx, hy), bestBox.tag);
      p.alive = false;
      return;
    }

    if (solidHit) {
      p.x = solidHit.x + solidHit.nx * 0.02;
      p.y = solidHit.y + solidHit.ny * 0.02;
      world.solidHit(solidHit.solid, p, projectileDamage(p, p.x, p.y));
      if (def.explosive) {
        world.explodeProjectile(p, p.x, p.y);
        p.alive = false;
        return;
      }
      if (p.bounces > 0) {
        p.bounces--;
        p.bounced = 0;
        if (solidHit.nx !== 0) p.vx = -p.vx * 0.9;
        if (solidHit.ny !== 0) p.vy = -p.vy * 0.9;
        world.events.emit('impact', {
          x: p.x,
          y: p.y,
          z: world.laneDepth(p.lane),
          nx: solidHit.nx,
          ny: solidHit.ny,
          surface: 'energy',
          color: def.glow,
          size: 0.5,
        });
        remaining *= 1 - solidHit.t;
        continue;
      }
      world.events.emit('impact', {
        x: p.x,
        y: p.y,
        z: world.laneDepth(p.lane),
        nx: solidHit.nx,
        ny: solidHit.ny,
        surface: def.damageType === 'kinetic' ? solidHit.solid.surface : 'energy',
        color: def.glow,
        size: p.charged ? 1.6 : def.kind === 'pellet' ? 0.5 : 1,
      });
      p.alive = false;
      return;
    }

    p.x = x1;
    p.y = y1;
    remaining = 0;
  }
}

function priority(part: string): number {
  switch (part) {
    case 'shieldPanel':
      return 4;
    case 'weak':
    case 'core':
      return 3;
    case 'head':
      return 2;
    case 'armor':
      return 1;
    default:
      return 0;
  }
}

export function projectileDamage(p: Projectile, hx: number, hy: number): DamageInfo {
  let amount = p.damage;
  if (p.falloff) {
    const d = Math.hypot(hx - p.startX, hy - p.startY);
    const f = d <= p.falloff.start ? 1 : d >= p.falloff.end ? p.falloff.min : 1 - ((d - p.falloff.start) / (p.falloff.end - p.falloff.start)) * (1 - p.falloff.min);
    amount *= f;
  }
  const speed = Math.hypot(p.vx, p.vy) || 1;
  return makeDamage({
    amount,
    type: p.def.damageType,
    shieldMult: p.shieldMult,
    armorMult: p.armorMult,
    headshotMult: p.headshotMult,
    byPlayer: p.byPlayer,
    sourceId: p.sourceId,
    sourceFaction: p.faction,
    dirX: p.vx / speed,
    dirY: p.vy / speed,
    x: hx,
    y: hy,
    stripShield: p.stripShield,
    stun: p.stun,
    knockback: p.def.kind === 'pellet' ? 0.6 : p.charged ? 3 : 0.25,
    weaponId: p.weaponId,
  });
}
