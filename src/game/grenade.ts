// Thrown grenades: bouncing frags and sticky plasma charges.
import { segmentRect } from '../core/math';
import type { GrenadeDef } from '../data/weapons';
import { Damageable, Entity } from './entity';
import { hostile } from './projectile';
import type { Faction, Hurtbox } from './types';
import { GRAVITY } from './types';
import type { World } from './world';

const scratch: Hurtbox[] = [];

export class Grenade extends Entity {
  readonly kind = 'grenade' as const;
  vx: number;
  vy: number;
  fuse: number;
  armed: boolean;
  stuckTo: Damageable | null = null;
  stuckSolid = false;
  offX = 0;
  offY = 0;
  spin = 0;
  spinV: number;
  age = 0;
  private bounceCooldown = 0;

  constructor(
    public def: GrenadeDef,
    x: number,
    y: number,
    vx: number,
    vy: number,
    lane: number,
    public faction: Faction,
    public byPlayer: boolean,
    public sourceId: number,
    public damageMult = 1,
  ) {
    super();
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.lane = lane;
    this.z = this.pz = lane === 0 ? 0 : -3.2;
    this.fuse = def.fuse;
    this.armed = !def.sticky;
    this.spinV = vx * 1.5;
  }

  update(dt: number, world: World): void {
    this.age += dt;
    this.bounceCooldown -= dt;
    // Sticky charges burn after sticking (or after a safety timeout).
    if (this.armed || this.age > 2.6) this.fuse -= dt;
    if (this.fuse <= 0) {
      this.detonate(world);
      return;
    }

    if (this.stuckTo) {
      if (!this.stuckTo.alive) {
        this.stuckTo = null;
        this.vx = 0;
        this.vy = 2;
      } else {
        this.x = this.stuckTo.x + this.offX;
        this.y = this.stuckTo.y + this.offY;
        this.lane = this.stuckTo.lane;
        return;
      }
    }
    if (this.stuckSolid) return;

    this.vy -= GRAVITY * 0.85 * dt;
    this.spin += this.spinV * dt;
    const mask = this.lane === 0 ? 1 : 2;
    const x1 = this.x + this.vx * dt;
    const y1 = this.y + this.vy * dt;

    if (this.def.sticky) {
      // Stick to the first hostile hurtbox we touch.
      for (const d of world.damageables) {
        if (!d.alive || d.lane !== this.lane || d.id === this.sourceId || !hostile(this.faction, d.faction)) continue;
        if (Math.abs(d.x - this.x) > 6) continue;
        scratch.length = 0;
        d.getHurtboxes(scratch);
        for (const hb of scratch) {
          if (segmentRect(this.x, this.y, x1, y1, hb, 0.12)) {
            this.stuckTo = d;
            this.offX = this.x - d.x;
            this.offY = Math.min(this.y - d.y, d.centerY() - d.y + 0.3);
            this.armed = true;
            this.fuse = Math.min(this.fuse, this.def.fuse);
            world.events.emit('grenadeStick', { x: this.x, y: this.y });
            return;
          }
        }
      }
    }

    const hit = world.solids.raycast(this.x, this.y, x1, y1, mask, true);
    if (hit && !(hit.solid.oneWay && (hit.ny <= 0 || this.vy > 0))) {
      this.x = hit.x + hit.nx * 0.05;
      this.y = hit.y + hit.ny * 0.05;
      if (this.def.sticky) {
        this.stuckSolid = true;
        this.armed = true;
        this.vx = this.vy = 0;
        world.events.emit('grenadeStick', { x: this.x, y: this.y });
        return;
      }
      const r = this.def.restitution;
      if (hit.nx !== 0) this.vx = -this.vx * r;
      if (hit.ny !== 0) {
        this.vy = -this.vy * r;
        this.vx *= 0.7;
        if (Math.abs(this.vy) < 1.2) this.vy = 0;
      }
      this.spinV = this.vx * 2;
      if (this.bounceCooldown <= 0 && Math.abs(this.vx) + Math.abs(this.vy) > 1.5) {
        world.events.emit('grenadeBounce', { x: this.x, y: this.y, kind: this.def.id });
        this.bounceCooldown = 0.12;
      }
    } else {
      this.x = x1;
      this.y = y1;
    }
    if (this.y < world.level.killY) this.removed = true;
  }

  detonate(world: World): void {
    if (this.removed) return;
    this.removed = true;
    world.explode({
      x: this.x,
      y: this.y + 0.2,
      lane: this.lane,
      radius: this.def.radius,
      damage: this.def.damage * this.damageMult,
      kind: this.def.id === 'plasma' ? 'plasma' : 'frag',
      byPlayer: this.byPlayer,
      faction: this.faction,
      sourceId: this.sourceId,
      shieldMult: this.def.shieldMult,
      incendiary: this.def.id === 'frag' && this.byPlayer && world.playerUpgrades.incendiary,
    });
  }
}
