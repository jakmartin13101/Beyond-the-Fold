// Typed event bus. The simulation emits plain-data events; rendering, audio and UI
// subscribe to them. This keeps gameplay logic independent from presentation.

export type Surface = 'paper' | 'rock' | 'metal' | 'flesh' | 'shield' | 'energy' | 'armor' | 'foliage';
export type ExplosionKind = 'frag' | 'plasma' | 'rocket' | 'barrel' | 'boss' | 'tank' | 'drone' | 'small';
export type VocalKind = 'alert' | 'pain' | 'death' | 'charge' | 'callout' | 'grenade' | 'taunt' | 'flee';

export interface GameEvents {
  shot: {
    weaponId: string;
    x: number;
    y: number;
    z: number;
    angle: number;
    byPlayer: boolean;
    charged?: boolean;
  };
  impact: { x: number; y: number; z: number; nx: number; ny: number; surface: Surface; color: number; size: number };
  explosion: { x: number; y: number; z: number; radius: number; kind: ExplosionKind };
  damage: { targetId: number; amount: number; shieldHit: boolean; headshot: boolean; x: number; y: number; z: number; byPlayer: boolean; killed: boolean };
  playerHurt: { amount: number; dirX: number; dirY: number; shield: boolean };
  shieldBroken: { x: number; y: number; z: number; isPlayer: boolean };
  shieldRecharge: Record<string, never>;
  shieldFull: Record<string, never>;
  lowHealth: { on: boolean };
  enemyKilled: { id: number; type: string; x: number; y: number; z: number; headshot: boolean; byPlayer: boolean; cause: string };
  vocal: { id: number; type: string; kind: VocalKind; x: number; y: number };
  pickup: { kind: string; label: string; x: number; y: number };
  reload: { weaponId: string; phase: 'start' | 'mag-out' | 'mag-in' | 'done'; byPlayer: boolean; x: number; y: number };
  weaponSwitch: { weaponId: string };
  dryFire: { weaponId: string };
  overheat: { weaponId: string; x: number; y: number };
  chargeStart: { weaponId: string; x: number; y: number };
  jump: { x: number; y: number; isPlayer: boolean; double?: boolean };
  land: { x: number; y: number; z: number; heavy: number; isPlayer: boolean };
  footstep: { x: number; y: number; z: number; heavy: number; isPlayer: boolean; surface: Surface };
  roll: { x: number; y: number };
  laneShift: { x: number; y: number; toLane: number; isPlayer: boolean };
  melee: { x: number; y: number; z: number; hit: boolean; byPlayer: boolean; dir: number };
  grenadeThrow: { x: number; y: number; kind: string; byPlayer: boolean };
  grenadeBounce: { x: number; y: number; kind: string };
  grenadeStick: { x: number; y: number };
  checkpoint: { id: string; x: number; y: number };
  objective: { text: string; x?: number; y?: number };
  radio: { lineId: string };
  hazard: { kind: string; x: number; y: number; phase: string };
  propDestroyed: { x: number; y: number; z: number; kind: string; color: number; w: number; h: number };
  cameraShake: { amount: number };
  cameraKick: { x: number; y: number };
  music: { intensity: number };
  intel: { id: string };
  cache: { id: string };
  encounter: { id: string; phase: 'start' | 'wave' | 'clear' };
  telegraph: { kind: string; x: number; y: number; z: number; duration: number };
  boss: { phase: string; name?: string };
  bossHit: { part: string; x: number; y: number };
  playerDied: Record<string, never>;
  hitmarker: { kill: boolean; headshot: boolean; shield: boolean };
  slowmo: { scale: number; duration: number };
  spawnFx: { kind: string; x: number; y: number; z: number };
  platform: { kind: 'crumble' | 'fall' | 'restore'; x: number; y: number; w: number };
  barrier: { on: boolean; x: number };
  flash: { color: string; strength: number };
  hint: { text: string; duration: number; actions?: string[] };
  burn: { x: number; y: number; z: number; t: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers: { [K in EventName]?: Handler<K>[] } = {};

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    const list = (this.handlers[name] ??= []) as Handler<K>[];
    list.push(fn);
    return () => {
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    const list = this.handlers[name] as Handler<K>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
