// The simulation world: owns entities, level geometry, triggers, encounters and the rules
// that connect them (damage, explosions, drops, checkpoints, objectives). It never touches
// rendering or audio; presentation listens to `events` and reads state.
import { EventBus } from '../core/events';
import { clamp, rand } from '../core/math';
import type { CheckpointSave } from '../core/save';
import { DIFFICULTIES, DifficultyDef, ENEMIES } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import { Colossus } from './boss/colossus';
import { Director } from './director';
import { Bulwark } from './enemies/bulwark';
import { Drone } from './enemies/drone';
import { Ravager } from './enemies/ravager';
import { Skirmisher } from './enemies/skirmisher';
import type { CoverSpot, Enemy } from './enemy';
import { Actor, Damageable, Entity } from './entity';
import { Grenade } from './grenade';
import { Solid, SolidWorld } from './physics';
import { Interactable, Player } from './player';
import { Projectile, ProjectileSpawn, hostile, updateProjectile } from './projectile';
import {
  Barrel,
  Barrier,
  CheckpointBeacon,
  Crate,
  CrumblePlatform,
  FuelTank,
  Pickup,
  PickupInit,
  PlasmaVent,
  StaticCover,
  rollDrops,
} from './props';
import {
  DamageInfo,
  EncounterDef,
  Faction,
  HitPart,
  Hurtbox,
  LANE_BOTH,
  LANE_Z,
  LevelData,
  SpawnDef,
  TriggerAction,
  makeDamage,
} from './types';

export interface MissionStats {
  time: number;
  kills: number;
  headshots: number;
  explosiveKills: number;
  meleeKills: number;
  shotsFired: number;
  shotsHit: number;
  damageTaken: number;
  deaths: number;
  intel: number;
  caches: number;
  tankHits: number;
  score: number;
  requisition: number;
}

export const emptyStats = (): MissionStats => ({
  time: 0,
  kills: 0,
  headshots: 0,
  explosiveKills: 0,
  meleeKills: 0,
  shotsFired: 0,
  shotsHit: 0,
  damageTaken: 0,
  deaths: 0,
  intel: 0,
  caches: 0,
  tankHits: 0,
  score: 0,
  requisition: 0,
});

export interface ExplodeOpts {
  x: number;
  y: number;
  lane: number;
  radius: number;
  damage: number;
  kind: 'frag' | 'plasma' | 'rocket' | 'barrel' | 'boss' | 'tank' | 'drone' | 'small';
  byPlayer: boolean;
  faction: Faction | 'neutral';
  sourceId: number;
  shieldMult: number;
  incendiary?: boolean;
}

export interface WorldOptions {
  difficulty: string;
  checkpoint?: CheckpointSave | null;
  secondaryWeapon?: string | null;
  upgrades?: Record<string, number>;
  upgradeValues?: (id: string) => number;
}

interface EncounterRuntime {
  def: EncounterDef;
  waveIdx: number;
  members: Enemy[];
  waveDelay: number;
  cleared: boolean;
}

interface Scheduled {
  t: number;
  fn: () => void;
}

interface BurnField {
  x: number;
  y: number;
  lane: number;
  t: number;
  byPlayer: boolean;
}

type Listener<T> = (v: T) => void;

class Signal<T> {
  private ls: Listener<T>[] = [];
  on(fn: Listener<T>): () => void {
    this.ls.push(fn);
    return () => {
      const i = this.ls.indexOf(fn);
      if (i >= 0) this.ls.splice(i, 1);
    };
  }
  emit(v: T): void {
    for (const l of this.ls) l(v);
  }
}

export class World {
  readonly events = new EventBus();
  readonly entityAdded = new Signal<Entity>();
  readonly entityRemoved = new Signal<Entity>();
  readonly dt = 1 / 60;
  time = 0;
  level: LevelData;
  solids = new SolidWorld();
  player: Player;
  entities: Entity[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  grenades: Grenade[] = [];
  damageables: Damageable[] = [];
  interactables: Interactable[] = [];
  covers: CoverSpot[] = [];
  barriers = new Map<string, Barrier[]>();
  burns: BurnField[] = [];
  boss: Colossus | null = null;
  director: Director;
  difficulty: DifficultyDef;
  stats: MissionStats = emptyStats();
  collected = new Set<string>();
  completedTriggers = new Set<string>();
  clearedEncounters = new Set<string>();
  arenaLock: { left: number; right: number } | null = null;
  cameraOverride: { x0: number; x1: number; zoom: number } | null = null;
  cinematic = false;
  playerUpgrades = { incendiary: false };
  objective: { text: string; x?: number; y?: number } | null = null;
  pendingCutscene: string | null = null;
  missionComplete = false;
  bossDefeated = false;
  lastCheckpoint: string | null = null;
  onCheckpoint: ((id: string) => void) | null = null;
  onWeaponUnlocked: ((id: string) => void) | null = null;
  onIntel: ((id: string) => void) | null = null;
  onCache: ((id: string) => void) | null = null;
  private encounters = new Map<string, EncounterRuntime>();
  private activeEncounter: EncounterRuntime | null = null;
  private scheduled: Scheduled[] = [];
  private noiseCooldown = 0;
  private actorScratch: Actor[] = [];
  private hurtScratch: Hurtbox[] = [];

  constructor(level: LevelData, opts: WorldOptions) {
    this.level = level;
    this.difficulty = DIFFICULTIES[opts.difficulty] ?? DIFFICULTIES.regular;
    this.director = new Director(this);
    const cp = opts.checkpoint ?? null;
    const cpDef = cp ? level.checkpoints.find((c) => c.id === cp.checkpointId) : undefined;

    // Static geometry.
    for (const s of level.solids) {
      if (s.crumble) {
        this.addEntity(new CrumblePlatform(s.x, s.y, s.w, s.h, s.lanes, this));
      } else {
        this.solids.add({ x: s.x, y: s.y, w: s.w, h: s.h, lanes: s.lanes, oneWay: !!s.oneWay, style: s.style, tag: s.id });
      }
    }

    // Player.
    const spawn = cpDef ? { x: cpDef.x + 0.8, y: cpDef.y, lane: cpDef.lane } : level.spawn;
    this.player = new Player(spawn.x, spawn.y, spawn.lane);
    this.applyUpgrades(opts);
    if (cp) {
      this.player.weapons = [null, null];
      cp.weapons.forEach((w, i) => {
        if (i < 2 && WEAPONS[w.id]) {
          this.player.current = i;
          this.player.giveWeapon(w.id, w.mag, w.reserve);
        }
      });
      this.player.current = clamp(cp.current, 0, 1);
      if (!this.player.weapons[this.player.current]) this.player.current = this.player.weapons[0] ? 0 : 1;
      this.player.grenades = { ...cp.grenades };
      this.player.grenadeType = cp.grenadeType;
      cp.collected.forEach((c) => this.collected.add(c));
      cp.completedTriggers.forEach((c) => {
        this.completedTriggers.add(c);
        if (c.startsWith('enc:')) this.clearedEncounters.add(c.slice(4));
      });
      Object.assign(this.stats, cp.stats);
      this.stats.time = cp.time;
      this.lastCheckpoint = cp.checkpointId;
    } else {
      this.player.defaultLoadout(opts.secondaryWeapon ?? null);
    }
    this.addEntity(this.player);

    // Props.
    for (const p of level.props) this.spawnProp(p.type, p);
    for (const c of level.checkpoints) {
      const b = new CheckpointBeacon(c.id, c.x, c.y, c.lane);
      if (cp && c.id === cp.checkpointId) b.active = true;
      this.addEntity(b);
    }

    // Encounter barriers.
    for (const e of level.encounters) {
      this.encounters.set(e.id, { def: e, waveIdx: 0, members: [], waveDelay: 0, cleared: this.clearedEncounters.has(e.id) });
      if (e.lock) {
        const gl = this.solids.groundBelow(e.lock.left, 40, 1, 80) ?? 0;
        const gr = this.solids.groundBelow(e.lock.right, 40, 1, 80) ?? 0;
        const bl = new Barrier(e.lock.left, gl, this);
        const br = new Barrier(e.lock.right, gr, this);
        this.addEntity(bl);
        this.addEntity(br);
        this.barriers.set(e.id, [bl, br]);
      }
    }
    if (level.boss) {
      const a = level.boss.arena;
      const gl = this.solids.groundBelow(a.left, 40, 1, 80) ?? 0;
      const gr = this.solids.groundBelow(a.right, 40, 1, 80) ?? 0;
      const bl = new Barrier(a.left, gl, this);
      const br = new Barrier(a.right, gr, this);
      this.addEntity(bl);
      this.addEntity(br);
      this.barriers.set('boss', [bl, br]);
    }

    // Initial enemies (skip those already behind a restored checkpoint).
    for (const s of level.enemies) {
      if (cpDef && s.x < cpDef.x + 6) continue;
      this.spawnEnemy(s);
    }
    this.player.lastSafe = { x: this.player.x, y: this.player.y, lane: this.player.lane };
  }

  private applyUpgrades(opts: WorldOptions): void {
    const up = opts.upgrades ?? {};
    const val = opts.upgradeValues ?? (() => 1);
    const p = this.player;
    if (up.shieldRecharge) p.shieldDelayMult = val('shieldRecharge');
    if (up.ammoCapacity) p.reserveMult = val('ammoCapacity');
    if (up.precision) p.headshotMult = val('precision');
    if (up.grenadeCapacity) p.grenadeMax = 4 + val('grenadeCapacity');
    if (up.shieldCapacity) p.maxShield = p.shield = 100 * val('shieldCapacity');
    this.playerUpgrades.incendiary = !!up.incendiaryFrag;
  }

  laneDepth(lane: number): number {
    return LANE_Z[lane] ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Entity management
  // ---------------------------------------------------------------------------

  addEntity(e: Entity): void {
    this.entities.push(e);
    if (isDamageable(e)) this.damageables.push(e);
    if (e instanceof Pickup) this.interactables.push(e);
    if (e instanceof Grenade) this.grenades.push(e);
    if (e.kind === 'enemy') this.enemies.push(e as Enemy);
    this.entityAdded.emit(e);
  }

  spawnProp(type: string, p: { x: number; y: number; lane: number; id?: string; weapon?: string; grenade?: string; count?: number; period?: number; offset?: number; rp?: number }): void {
    if (p.id && this.collected.has(p.id)) return;
    switch (type) {
      case 'barrel':
        this.addEntity(new Barrel(p.x, p.y, p.lane, this));
        break;
      case 'crate':
      case 'crateSmall':
        this.addEntity(new Crate(p.x, p.y, p.lane, type === 'crateSmall', this));
        break;
      case 'barricade':
      case 'sandbags':
        this.addEntity(new StaticCover(p.x, p.y, p.lane, type, this));
        break;
      case 'fuelTank':
        this.addEntity(new FuelTank(p.x, p.y, p.lane));
        break;
      case 'vent':
        this.addEntity(new PlasmaVent(p.x, p.y, p.lane, p.period ?? 4, p.offset ?? 0));
        break;
      case 'weapon':
      case 'ammo':
      case 'grenades':
      case 'health':
      case 'intel':
      case 'cache':
      case 'ordnance':
        this.spawnPickup({ type, x: p.x, y: p.y, lane: p.lane, id: p.id, weapon: p.weapon, grenade: p.grenade, count: p.count, rp: p.rp }, false);
        break;
    }
  }

  spawnPickup(init: PickupInit, dropped: boolean): Pickup {
    const pk = new Pickup(init, dropped);
    this.addEntity(pk);
    return pk;
  }

  spawnEnemy(s: SpawnDef): Enemy | null {
    let e: Enemy;
    switch (s.type) {
      case 'skirmisher':
        e = new Skirmisher(s, this);
        break;
      case 'ravager':
        e = new Ravager(s, this);
        break;
      case 'bulwark':
        e = new Bulwark(s, this);
        break;
      case 'drone':
        e = new Drone(s, this);
        break;
      default:
        if (!ENEMIES[s.type]) return null;
        e = new Skirmisher(s, this, s.type);
    }
    this.addEntity(e);
    return e;
  }

  spawnEnemies(spawns: SpawnDef[], into?: Enemy[]): void {
    for (const s of spawns) {
      const go = () => {
        const e = this.spawnEnemy(s);
        if (e && into) into.push(e);
      };
      if (s.delay && s.delay > 0) {
        // Count delayed spawns immediately so encounters don't clear early.
        const placeholder = { dead: false, removed: false } as unknown as Enemy;
        if (into) into.push(placeholder);
        this.schedule(s.delay, () => {
          const e = this.spawnEnemy(s);
          if (into) {
            const i = into.indexOf(placeholder);
            if (i >= 0) into.splice(i, 1);
            if (e) into.push(e);
          }
        });
      } else {
        go();
      }
    }
  }

  spawnProjectile(s: ProjectileSpawn): void {
    this.projectiles.push(new Projectile(s));
    if (s.byPlayer && this.noiseCooldown <= 0) {
      this.noiseCooldown = 0.3;
      // Gunfire alerts nearby enemies.
      for (const e of this.enemies) {
        if (!e.aware && !e.dead && Math.abs(e.x - s.x) < 15) {
          e.aware = true;
          e.setState('alert');
        }
      }
    }
  }

  schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ t: delay, fn });
  }

  // ---------------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    if (!this.cinematic && !this.missionComplete && !this.player.dead) this.stats.time += dt;
    this.noiseCooldown -= dt;

    for (const e of this.entities) e.savePrev();
    for (const e of this.entities) {
      if (!e.removed) e.update(dt, this);
    }
    for (const p of this.projectiles) {
      if (p.alive) updateProjectile(p, dt, this);
    }
    this.updateBurns(dt);

    // Scheduled callbacks.
    if (this.scheduled.length) {
      const due: Scheduled[] = [];
      for (const s of this.scheduled) {
        s.t -= dt;
        if (s.t <= 0) due.push(s);
      }
      if (due.length) {
        this.scheduled = this.scheduled.filter((s) => s.t > 0);
        for (const s of due) s.fn();
      }
    }

    if (!this.cinematic) this.checkTriggers();
    this.updateEncounter(dt);
    this.director.update(dt);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);
    if (!this.entities.some((e) => e.removed)) return;
    const removed = this.entities.filter((e) => e.removed);
    this.entities = this.entities.filter((e) => !e.removed);
    this.damageables = this.damageables.filter((d) => !(d as unknown as Entity).removed);
    this.interactables = this.interactables.filter((i) => !i.removed);
    this.grenades = this.grenades.filter((g) => !g.removed);
    this.enemies = this.enemies.filter((e) => !e.removed);
    for (const e of removed) this.entityRemoved.emit(e);
  }

  // ---------------------------------------------------------------------------
  // Triggers & encounters
  // ---------------------------------------------------------------------------

  private checkTriggers(): void {
    const p = this.player;
    if (p.dead) return;
    for (const t of this.level.triggers) {
      if (this.completedTriggers.has(t.id)) continue;
      if (p.x < t.x) continue;
      if (t.requires && !this.clearedEncounters.has(t.requires)) continue;
      if (t.minY !== undefined && p.y < t.minY) continue;
      if (t.lane !== undefined && p.lane !== t.lane) continue;
      this.completedTriggers.add(t.id);
      for (const a of t.actions) this.runAction(a);
    }
  }

  runAction(a: TriggerAction): void {
    switch (a.type) {
      case 'radio':
        if (a.delay) this.schedule(a.delay, () => this.radio(a.lines));
        else this.radio(a.lines);
        break;
      case 'objective':
        this.objective = { text: a.text, x: a.markerX, y: a.markerY };
        this.events.emit('objective', { text: a.text, x: a.markerX, y: a.markerY });
        break;
      case 'hint':
        this.events.emit('hint', { text: a.text, duration: a.duration ?? 5, actions: a.actions });
        break;
      case 'encounter':
        this.startEncounter(a.id);
        break;
      case 'spawn':
        this.spawnEnemies(a.spawns);
        break;
      case 'music':
        this.director.musicOverride = a.intensity > 1 ? a.intensity : null;
        break;
      case 'cutscene':
        this.pendingCutscene = a.id;
        break;
      case 'endMission':
        this.missionComplete = true;
        break;
    }
  }

  radio(lines: string[]): void {
    for (const l of lines) this.events.emit('radio', { lineId: l });
  }

  startEncounter(id: string): void {
    const enc = this.encounters.get(id);
    if (!enc || enc.cleared || this.activeEncounter === enc) return;
    this.activeEncounter = enc;
    enc.waveIdx = 0;
    enc.members = [];
    enc.waveDelay = 0;
    if (enc.def.lock) {
      this.arenaLock = { ...enc.def.lock };
      for (const b of this.barriers.get(id) ?? []) b.set(true, this);
    }
    if (enc.def.camera) this.cameraOverride = { ...enc.def.camera };
    this.events.emit('encounter', { id, phase: 'start' });
  }

  private updateEncounter(dt: number): void {
    const enc = this.activeEncounter;
    if (!enc) return;
    const alive = enc.members.filter((e) => !e.dead && !e.removed).length;
    const next = enc.def.waves[enc.waveIdx];
    if (next) {
      if (alive <= next.whenRemaining) {
        enc.waveDelay += dt;
        if (enc.waveDelay >= (next.delay ?? 0)) {
          enc.waveDelay = 0;
          enc.waveIdx++;
          this.spawnEnemies(next.spawns, enc.members);
          for (const a of next.actions ?? []) this.runAction(a);
          this.events.emit('encounter', { id: enc.def.id, phase: 'wave' });
        }
      }
      return;
    }
    if (alive === 0) {
      enc.cleared = true;
      this.clearedEncounters.add(enc.def.id);
      this.completedTriggers.add('enc:' + enc.def.id);
      this.activeEncounter = null;
      this.arenaLock = null;
      this.cameraOverride = null;
      for (const b of this.barriers.get(enc.def.id) ?? []) b.set(false, this);
      for (const a of enc.def.onClear) this.runAction(a);
      this.events.emit('encounter', { id: enc.def.id, phase: 'clear' });
    }
  }

  // ---------------------------------------------------------------------------
  // Boss
  // ---------------------------------------------------------------------------

  spawnBoss(): Colossus | null {
    const b = this.level.boss;
    if (!b || this.boss) return this.boss;
    this.boss = new Colossus(b.x, b.y, b.arena, this);
    this.addEntity(this.boss);
    return this.boss;
  }

  activateBoss(): void {
    const boss = this.boss ?? this.spawnBoss();
    if (!boss || !this.level.boss) return;
    boss.active = true;
    this.arenaLock = { ...this.level.boss.arena };
    for (const b of this.barriers.get('boss') ?? []) b.set(true, this);
    this.events.emit('boss', { phase: 'start', name: boss.name });
  }

  onBossDying(_b: Colossus): void {
    this.events.emit('boss', { phase: 'dying' });
    this.events.emit('slowmo', { scale: 0.35, duration: 1.6 });
    for (const e of this.enemies) {
      if (!e.dead && e.faction === 'rogue') e.applyDamage(makeDamage({ amount: 9999, type: 'energy' }), 'body', this);
    }
  }

  onBossDefeated(b: Colossus): void {
    this.bossDefeated = true;
    this.stats.score += 3000;
    this.stats.kills++;
    this.events.emit('boss', { phase: 'defeated' });
    this.events.emit('enemyKilled', { id: b.id, type: 'colossus', x: b.x, y: b.y + 3, z: b.z, headshot: false, byPlayer: true, cause: 'boss' });
    this.arenaLock = null;
    for (const bar of this.barriers.get('boss') ?? []) bar.set(false, this);
    this.player.victory = true;
    this.schedule(2.6, () => {
      this.player.victory = false;
      this.pendingCutscene = 'outro';
    });
  }

  liveTanks(): number {
    let n = 0;
    for (const e of this.entities) if (e instanceof FuelTank && e.alive) n++;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Combat rules
  // ---------------------------------------------------------------------------

  damageTarget(target: Damageable, part: HitPart, info: DamageInfo, tag?: string): void {
    const r = target.applyDamage(info, part, this, tag);
    if (info.byPlayer && target.faction !== 'player') {
      if (!info.explosive && info.weaponId && target.faction !== 'neutral') this.stats.shotsHit++;
      if (target.faction !== 'neutral' && (r.dealt > 0 || r.shieldHit || r.blocked)) {
        this.events.emit('hitmarker', { kill: r.killed, headshot: r.headshot, shield: r.shieldHit || r.blocked });
      }
    }
    this.events.emit('damage', {
      targetId: target.id,
      amount: r.dealt,
      shieldHit: r.shieldHit,
      headshot: r.headshot,
      x: info.x,
      y: info.y,
      z: this.laneDepth(target.lane),
      byPlayer: info.byPlayer,
      killed: r.killed,
    });
    if (target.faction !== 'player') {
      const surface = r.blocked && part === 'shieldPanel' ? 'shield' : r.shieldHit ? 'shield' : target.surface;
      this.events.emit('impact', {
        x: info.x,
        y: info.y,
        z: this.laneDepth(target.lane),
        nx: -info.dirX,
        ny: -info.dirY,
        surface,
        color: surface === 'shield' ? 0x7fe8ff : 0xffd0a0,
        size: info.type === 'melee' ? 1.5 : 1,
      });
    }
  }

  solidHit(solid: Solid, p: Projectile, info: DamageInfo): void {
    const owner = solid.owner as Damageable | undefined;
    if (owner && typeof (owner as Damageable).applyDamage === 'function' && owner.alive) {
      if (owner instanceof FuelTank && !p.byPlayer) return;
      owner.applyDamage(info, 'body', this);
    }
  }

  explodeProjectile(p: Projectile, x: number, y: number): void {
    const ex = p.def.explosive;
    if (!ex) return;
    this.explode({
      x,
      y,
      lane: p.lane,
      radius: ex.radius,
      damage: ex.damage * (p.byPlayer ? 1 : this.difficulty.enemyDamage),
      kind: ex.kind,
      byPlayer: p.byPlayer,
      faction: p.faction,
      sourceId: p.sourceId,
      shieldMult: 1,
    });
  }

  explode(o: ExplodeOpts): void {
    const z = this.laneDepth(o.lane);
    this.events.emit('explosion', { x: o.x, y: o.y, z, radius: o.radius, kind: o.kind });
    const pd = Math.hypot(this.player.x - o.x, this.player.centerY() - o.y);
    this.events.emit('cameraShake', { amount: clamp((o.radius * 1.6) / (pd + 3), 0, 1.1) });
    const hb = this.hurtScratch;
    for (const d of [...this.damageables]) {
      if (!d.alive) continue;
      const dz = this.laneDepth(d.lane) - z;
      hb.length = 0;
      d.getHurtboxes(hb);
      if (!hb.length) continue;
      // Closest point on the target's hurtboxes.
      let best = Infinity;
      let bx = d.x;
      let by = d.centerY();
      let bestPart: HitPart = 'body';
      let bestTag: string | undefined;
      for (const h of hb) {
        const cx = clamp(o.x, h.x, h.x + h.w);
        const cy = clamp(o.y, h.y, h.y + h.h);
        const dd = Math.hypot(cx - o.x, cy - o.y, dz * 0.85);
        if (dd < best) {
          best = dd;
          bx = cx;
          by = cy;
          bestPart = h.part === 'head' ? 'body' : h.part;
          bestTag = h.tag;
        }
      }
      if (best > o.radius) continue;
      let f = 1 - Math.pow(best / o.radius, 1.4);
      if (d.lane === o.lane) {
        const blocked = this.solids.raycast(o.x, o.y + 0.1, bx, by, o.lane === 0 ? 1 : 2);
        if (blocked && blocked.t < 0.9 && !(blocked.solid.owner === d)) f *= 0.35;
      }
      let dmg = o.damage * f;
      if (d.faction === 'player' && o.byPlayer) dmg *= 0.6;
      if (d === (this.boss as unknown as Damageable) && o.kind === 'tank') continue;
      const dirX = Math.sign(d.x - o.x) || 1;
      this.damageTarget(
        d,
        bestPart === 'shieldPanel' ? 'body' : bestPart,
        makeDamage({
          amount: dmg,
          type: 'explosive',
          explosive: true,
          shieldMult: o.shieldMult,
          armorMult: 2.4,
          byPlayer: o.byPlayer,
          sourceId: o.sourceId,
          sourceFaction: o.faction,
          dirX,
          dirY: 0.6,
          x: bx,
          y: by,
          knockback: 7 * f,
        }),
        bestTag,
      );
    }
    // Shove loose grenades.
    for (const g of this.grenades) {
      if (g.lane !== o.lane || g.stuckTo || g.stuckSolid) continue;
      const d = Math.hypot(g.x - o.x, g.y - o.y);
      if (d < o.radius && d > 0.01) {
        g.vx += ((g.x - o.x) / d) * 8;
        g.vy += 6;
      }
    }
    if (o.incendiary) {
      this.burns.push({ x: o.x, y: o.y, lane: o.lane, t: 4, byPlayer: o.byPlayer });
    }
  }

  private updateBurns(dt: number): void {
    if (!this.burns.length) return;
    for (const b of this.burns) {
      b.t -= dt;
      if (Math.random() < dt * 20) this.events.emit('burn', { x: b.x + rand(-2, 2), y: b.y, z: this.laneDepth(b.lane), t: b.t });
      for (const e of this.enemies) {
        if (e.dead || e.lane !== b.lane || Math.abs(e.x - b.x) > 2.4 || Math.abs(e.y - b.y) > 2) continue;
        e.applyDamage(makeDamage({ amount: 24 * dt, type: 'plasma', byPlayer: b.byPlayer, sourceFaction: 'player', x: e.x, y: e.y + 0.5 }), 'body', this);
      }
    }
    this.burns = this.burns.filter((b) => b.t > 0);
  }

  onEnemyKilled(e: Enemy, d: DamageInfo, headshot: boolean): void {
    const byPlayer = d.byPlayer;
    if (byPlayer) {
      this.stats.kills++;
      this.stats.score += e.def.score;
      if (headshot) {
        this.stats.headshots++;
        this.stats.score += 50;
      }
      if (d.explosive || d.type === 'explosive') {
        this.stats.explosiveKills++;
        this.stats.score += 50;
      }
      if (d.type === 'melee') {
        this.stats.meleeKills++;
        this.stats.score += 50;
      }
    }
    this.events.emit('enemyKilled', {
      id: e.id,
      type: e.type,
      x: e.x,
      y: e.y,
      z: e.z,
      headshot,
      byPlayer,
      cause: e.deathCause,
    });
    // Drops (not from enemies that fell into pits).
    if (d.type !== 'fall') {
      for (const drop of rollDrops(e.def.drops)) {
        const lane = e.lane;
        const x = e.x + rand(-0.5, 0.5);
        const y = e.def.flying ? e.y : e.y + 0.4;
        if (drop.kind === 'weapon' && drop.id) {
          const def = WEAPONS[drop.id];
          this.spawnPickup({ type: 'weapon', x, y, lane, weapon: drop.id, mag: def ? Math.round(def.magSize * rand(0.4, 0.9)) : undefined, reserve: 0 }, true);
        } else if (drop.kind === 'grenade') {
          this.spawnPickup({ type: 'grenades', x, y, lane, grenade: drop.id ?? 'frag', count: 1 }, true);
        } else if (drop.kind === 'ammo') {
          this.spawnPickup({ type: 'ammo', x, y, lane }, true);
        } else if (drop.kind === 'health') {
          this.spawnPickup({ type: 'health', x, y, lane }, true);
        }
      }
    }
  }

  onPlayerReload(): void {
    // Enemies notice the reload and press the attack.
    let taunted = false;
    for (const e of this.enemies) {
      if (e.dead || !e.aware || e.faction !== 'thren') continue;
      if (Math.abs(e.x - this.player.x) < 16) {
        e.pressT = 2;
        if (!taunted && Math.random() < 0.5) {
          taunted = true;
          e.vocal(this, 'taunt', 3);
        }
      }
    }
  }

  alertAllies(src: Enemy, radius: number): void {
    for (const e of this.enemies) {
      if (e === src || e.dead || e.faction !== src.faction || e.aware) continue;
      if (Math.abs(e.x - src.x) < radius) {
        e.aware = true;
        e.setState('alert');
        e.stateT = -rand(0, 0.3);
      }
    }
  }

  /** Choose who an enemy should fight: the player or a hostile faction. */
  pickTarget(e: Enemy): Actor | null {
    let best: Actor | null = null;
    let bestScore = Infinity;
    const range = e.def.sight * 1.4;
    const p = this.player;
    if (!p.dead && !this.cinematic) {
      const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 0.5;
      if (d < range) {
        best = p;
        bestScore = d * 0.7 + (p.lane === e.lane ? 0 : 3);
      }
    }
    for (const o of this.enemies) {
      if (o === e || o.dead || o.entering || o.faction === e.faction) continue;
      const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y) * 0.5;
      if (d > range) continue;
      const score = d + (o.lane === e.lane ? 0 : 3) + 2;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    if (this.boss && this.boss.alive && this.boss.active && e.faction !== 'rogue') {
      const d = Math.abs(this.boss.x - e.x);
      if (d < range && d + 4 < bestScore) best = this.boss;
    }
    return best;
  }

  actorsNear(x: number, r: number): Actor[] {
    const out = this.actorScratch;
    out.length = 0;
    const p = this.player;
    if (Math.abs(p.x - x) < r + 2) out.push(p);
    for (const e of this.enemies) if (!e.dead && Math.abs(e.x - x) < r + 2) out.push(e);
    return out;
  }

  /** A charging Ravager plows through crates and barrels. */
  smashCover(a: Actor, dir: number): void {
    const front = a.x + dir * (a.w / 2 + 0.4);
    for (const e of this.entities) {
      if (e.removed || e.lane !== a.lane) continue;
      if (e instanceof Crate) {
        if (Math.abs(e.x - front) < e.w / 2 + 0.3 && e.y < a.y + a.h && e.y + e.h > a.y) e.destroy(this);
      } else if (e instanceof Barrel) {
        if (e.alive && Math.abs(e.x - front) < e.w / 2 + 0.3) e.applyDamage(makeDamage({ amount: 100 }), 'body', this);
      }
    }
  }

  findHomingTarget(p: Projectile): Damageable | null {
    let best: Damageable | null = null;
    let bestD = 22;
    const ang = Math.atan2(p.vy, p.vx);
    for (const d of this.damageables) {
      if (!d.alive || d.lane !== p.lane || !hostile(p.faction, d.faction) || d.faction === 'neutral') continue;
      const dx = d.x - p.x;
      const dy = d.centerY() - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > bestD) continue;
      let da = Math.atan2(dy, dx) - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.9) continue;
      bestD = dist;
      best = d;
    }
    return best;
  }

  findPlayerHomingTarget(player: Player): Damageable | null {
    let best: Damageable | null = null;
    let bestD = 6;
    for (const d of this.damageables) {
      if (!d.alive || d.lane !== player.lane || d.faction === 'player' || d.faction === 'neutral') continue;
      const dist = Math.hypot(d.x - player.aimWorldX, d.centerY() - player.aimWorldY);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  reachCheckpoint(id: string, x: number, y: number): void {
    this.lastCheckpoint = id;
    this.events.emit('checkpoint', { id, x, y });
    this.player.health = Math.max(this.player.health, this.player.maxHealth * 0.75);
    this.onCheckpoint?.(id);
  }

  collectIntel(id: string, _p: Pickup): void {
    if (!id) return;
    this.stats.intel++;
    this.stats.score += 250;
    this.stats.requisition += 25;
    this.events.emit('intel', { id });
    this.radio(['intel_found']);
    this.onIntel?.(id);
  }

  openCache(p: Pickup): void {
    this.stats.caches++;
    this.stats.score += 300;
    this.stats.requisition += p.rp || 50;
    if (p.levelId) this.collected.add(p.levelId);
    this.events.emit('cache', { id: p.levelId ?? '' });
    this.radio(['cache_found']);
    this.onCache?.(p.levelId ?? '');
    if (p.weaponId) {
      this.schedule(0.4, () => {
        this.spawnPickup({ type: 'weapon', x: p.x + 0.9, y: p.y + 0.6, lane: p.lane, weapon: p.weaponId! }, true).life = 600;
      });
    }
    this.schedule(0.55, () => {
      this.spawnPickup({ type: 'grenades', x: p.x - 0.9, y: p.y + 0.6, lane: p.lane, grenade: 'frag', count: 2 }, true).life = 600;
    });
  }

  onWeaponAcquired(id: string): void {
    this.onWeaponUnlocked?.(id);
  }

  /** Snapshot for checkpoint saves. */
  snapshot(checkpointId: string, levelId: string, difficulty: string): CheckpointSave {
    const p = this.player;
    return {
      levelId,
      checkpointId,
      difficulty,
      weapons: p.weapons.filter((w) => w !== null).map((w) => ({ id: w!.def.id, mag: w!.mag, reserve: w!.reserve })),
      current: p.weapons[p.current] ? p.weapons.slice(0, p.current).filter((w) => w !== null).length : 0,
      grenades: { ...p.grenades },
      grenadeType: p.grenadeType,
      collected: [...this.collected],
      completedTriggers: [...this.completedTriggers],
      stats: { ...this.stats } as unknown as Record<string, number>,
      time: this.stats.time,
    };
  }
}

function isDamageable(e: Entity): e is Entity & Damageable {
  return typeof (e as unknown as Damageable).getHurtboxes === 'function' && typeof (e as unknown as Damageable).applyDamage === 'function';
}

export { LANE_BOTH };
