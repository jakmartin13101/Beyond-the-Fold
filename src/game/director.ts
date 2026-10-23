// Combat director: hands out attack tokens so enemies take turns attacking (readable,
// coordinated pressure instead of every enemy firing at once), and tracks combat intensity
// for the adaptive soundtrack.
import type { Enemy } from './enemy';
import type { World } from './world';

interface Token {
  kind: string;
  t: number;
  owner: Enemy;
}

export class Director {
  private tokens = new Map<number, Token>();
  maxTokens: number;
  intensity = 1;
  musicOverride: number | null = null;
  private calmT = 0;

  constructor(private world: World) {
    this.maxTokens = world.difficulty.attackTokens;
  }

  requestToken(e: Enemy, kind = 'fire'): boolean {
    if (this.tokens.has(e.id)) return true;
    let count = 0;
    for (const t of this.tokens.values()) if (t.kind === kind) count++;
    const limit = kind === 'charge' ? 1 : this.maxTokens;
    if (count >= limit) return false;
    this.tokens.set(e.id, { kind, t: 0, owner: e });
    return true;
  }

  releaseToken(e: Enemy): void {
    this.tokens.delete(e.id);
  }

  update(dt: number): void {
    for (const [id, tok] of this.tokens) {
      tok.t += dt;
      if (tok.t > 3.5 || tok.owner.dead || tok.owner.removed) this.tokens.delete(id);
    }
    // Music intensity: 1 explore, 2 combat, 3 boss.
    let combat = false;
    const p = this.world.player;
    for (const e of this.world.enemies) {
      if (e.dead || e.removed || !e.aware) continue;
      if (Math.abs(e.x - p.x) < 30) {
        combat = true;
        break;
      }
    }
    let target = 1;
    if (this.world.boss && this.world.boss.active && this.world.boss.alive) target = 3;
    else if (combat) target = 2;
    if (this.musicOverride !== null) target = Math.max(target, this.musicOverride);
    if (target < this.intensity) {
      // Hold combat music a little after the last enemy falls.
      this.calmT += dt;
      if (this.calmT < 3) target = this.intensity;
    } else {
      this.calmT = 0;
    }
    if (target !== this.intensity) {
      this.intensity = target;
      this.world.events.emit('music', { intensity: target });
    }
  }
}
