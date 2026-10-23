// Axis-aligned collision world. Solids are rectangles on one or both depth lanes.
import type { Surface } from '../core/events';
import { segmentRect } from '../core/math';
import type { SolidStyle } from './types';

export interface Solid {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lanes: number;
  oneWay: boolean;
  style: SolidStyle;
  surface: Surface;
  enabled: boolean;
  /** Arbitrary owner (crumbling platform, destructible crate, barrier...). */
  owner?: unknown;
  tag?: string;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  lane: number;
  onGround: boolean;
  groundSolid: Solid | null;
  dropThrough: number;
  hitWall: number;
  hitCeiling: boolean;
}

export interface RayHit {
  t: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  solid: Solid;
}

const CELL = 8;
const STEP = 0.42;

export function surfaceFor(style: SolidStyle): Surface {
  switch (style) {
    case 'metal':
    case 'catwalk':
    case 'hull':
    case 'wreck':
      return 'metal';
    case 'concrete':
    case 'rock':
    case 'cliff':
    case 'floating':
      return 'rock';
    default:
      return 'paper';
  }
}

export class SolidWorld {
  solids: Solid[] = [];
  private cells = new Map<number, Solid[]>();
  private stamp = new Map<number, number>();
  private queryId = 0;
  private nextId = 1;
  private scratch: Solid[] = [];

  add(def: Omit<Solid, 'id' | 'surface' | 'enabled'> & { surface?: Surface; enabled?: boolean }): Solid {
    const s: Solid = {
      ...def,
      id: this.nextId++,
      surface: def.surface ?? surfaceFor(def.style),
      enabled: def.enabled ?? true,
    };
    this.solids.push(s);
    this.index(s);
    return s;
  }

  remove(s: Solid): void {
    const i = this.solids.indexOf(s);
    if (i >= 0) this.solids.splice(i, 1);
    const c0 = Math.floor(s.x / CELL);
    const c1 = Math.floor((s.x + s.w) / CELL);
    for (let c = c0; c <= c1; c++) {
      const list = this.cells.get(c);
      if (!list) continue;
      const j = list.indexOf(s);
      if (j >= 0) list.splice(j, 1);
    }
  }

  private index(s: Solid): void {
    const c0 = Math.floor(s.x / CELL);
    const c1 = Math.floor((s.x + s.w) / CELL);
    for (let c = c0; c <= c1; c++) {
      let list = this.cells.get(c);
      if (!list) {
        list = [];
        this.cells.set(c, list);
      }
      list.push(s);
    }
  }

  /** Collect enabled solids overlapping the x-range on the given lane mask. */
  query(x0: number, x1: number, mask: number, out: Solid[] = this.scratch): Solid[] {
    out.length = 0;
    const id = ++this.queryId;
    const c0 = Math.floor(Math.min(x0, x1) / CELL);
    const c1 = Math.floor(Math.max(x0, x1) / CELL);
    for (let c = c0; c <= c1; c++) {
      const list = this.cells.get(c);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!s.enabled || (s.lanes & mask) === 0) continue;
        if (this.stamp.get(s.id) === id) continue;
        this.stamp.set(s.id, id);
        out.push(s);
      }
    }
    return out;
  }

  /** Is the point inside any solid (one-way platforms excluded)? */
  pointSolid(x: number, y: number, mask: number): Solid | null {
    const list = this.query(x, x, mask);
    for (const s of list) {
      if (s.oneWay) continue;
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  /** Does a rectangle overlap a blocking solid? */
  rectBlocked(x: number, y: number, w: number, h: number, mask: number, includeOneWay = false): Solid | null {
    const list = this.query(x, x + w, mask);
    for (const s of list) {
      if (s.oneWay && !includeOneWay) continue;
      if (x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y) return s;
    }
    return null;
  }

  /** Highest walkable surface at x at or below y (within maxDrop). */
  groundBelow(x: number, y: number, mask: number, maxDrop = 50): number | null {
    const list = this.query(x, x, mask);
    let best: number | null = null;
    for (const s of list) {
      if (x < s.x || x > s.x + s.w) continue;
      const top = s.y + s.h;
      if (top <= y + 0.05 && top >= y - maxDrop) {
        if (best === null || top > best) best = top;
      }
    }
    return best;
  }

  raycast(x0: number, y0: number, x1: number, y1: number, mask: number, includeOneWay = false): RayHit | null {
    const list = this.query(Math.min(x0, x1) - 0.5, Math.max(x0, x1) + 0.5, mask);
    let best: RayHit | null = null;
    for (const s of list) {
      if (s.oneWay && !includeOneWay) continue;
      const hit = segmentRect(x0, y0, x1, y1, s);
      if (hit && (!best || hit.t < best.t)) {
        best = {
          t: hit.t,
          x: x0 + (x1 - x0) * hit.t,
          y: y0 + (y1 - y0) * hit.t,
          nx: hit.nx,
          ny: hit.ny,
          solid: s,
        };
      }
    }
    return best;
  }

  /** Move a body with collision response. x is the body centre, y its feet. */
  move(b: Body, dt: number): void {
    const mask = b.lane === 0 ? 1 : 2;
    const hw = b.w / 2;
    b.hitWall = 0;
    b.hitCeiling = false;
    if (b.dropThrough > 0) b.dropThrough -= dt;

    // Horizontal sweep.
    const dx = b.vx * dt;
    if (dx !== 0) {
      let target = b.x + dx;
      const bottom = b.y + 0.02;
      const top = b.y + b.h - 0.02;
      const list = this.query(Math.min(b.x, target) - hw - 0.1, Math.max(b.x, target) + hw + 0.1, mask);
      for (const s of list) {
        if (s.oneWay) continue;
        if (s.y >= top || s.y + s.h <= bottom) continue;
        const left = Math.min(b.x, target) - hw;
        const right = Math.max(b.x, target) + hw;
        if (s.x >= right || s.x + s.w <= left) continue;
        // Step up small ledges while grounded.
        const rise = s.y + s.h - b.y;
        if (b.onGround && rise > 0 && rise <= STEP && !this.rectBlocked(target - hw, s.y + s.h + 0.01, b.w, b.h, mask)) {
          b.y = s.y + s.h;
          continue;
        }
        if (dx > 0 && s.x >= b.x + hw - 0.06) {
          target = Math.min(target, s.x - hw - 0.001);
          b.hitWall = 1;
        } else if (dx < 0 && s.x + s.w <= b.x - hw + 0.06) {
          target = Math.max(target, s.x + s.w + hw + 0.001);
          b.hitWall = -1;
        }
      }
      if (b.hitWall !== 0) b.vx = 0;
      b.x = target;
    }

    // Vertical sweep.
    const dy = b.vy * dt;
    b.onGround = false;
    b.groundSolid = null;
    const list = this.query(b.x - hw, b.x + hw, mask);
    if (dy <= 0) {
      const newY = b.y + dy;
      let land: Solid | null = null;
      let landY = -Infinity;
      for (const s of list) {
        if (s.x >= b.x + hw || s.x + s.w <= b.x - hw) continue;
        const sTop = s.y + s.h;
        if (s.oneWay) {
          if (b.dropThrough > 0) continue;
          if (b.y < sTop - 0.06) continue;
        } else if (b.y < sTop - 0.3) {
          continue;
        }
        if (sTop <= b.y + 0.001 && sTop >= newY - 0.001 && sTop > landY) {
          landY = sTop;
          land = s;
        } else if (sTop > b.y && sTop - b.y < 0.3 && !s.oneWay && sTop > landY) {
          // Slightly embedded (e.g. after a step); snap up.
          landY = sTop;
          land = s;
        }
      }
      if (land) {
        b.y = landY;
        b.vy = 0;
        b.onGround = true;
        b.groundSolid = land;
      } else {
        b.y = newY;
      }
    } else {
      const newY = b.y + dy;
      const headOld = b.y + b.h;
      const headNew = newY + b.h;
      let ceil = Infinity;
      for (const s of list) {
        if (s.oneWay) continue;
        if (s.x >= b.x + hw || s.x + s.w <= b.x - hw) continue;
        if (s.y >= headOld - 0.05 && s.y <= headNew) ceil = Math.min(ceil, s.y);
      }
      if (ceil < Infinity) {
        b.y = ceil - b.h - 0.001;
        b.vy = 0;
        b.hitCeiling = true;
      } else {
        b.y = newY;
      }
    }
  }
}
