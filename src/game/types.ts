// Shared simulation types and level-data schema.
import type { Surface } from '../core/events';
import type { DamageType } from '../data/weapons';
import type { Faction } from '../data/enemies';

export type { Faction };

/** Depth lanes: 0 = foreground combat lane, 1 = background lane. */
export const LANE_Z = [0, -3.2];
export const LANE_FRONT = 1;
export const LANE_BACK = 2;
export const LANE_BOTH = 3;
export const laneMask = (lane: number): number => (lane === 0 ? LANE_FRONT : LANE_BACK);

export const GRAVITY = 36;

export type HitPart = 'body' | 'head' | 'shieldPanel' | 'armor' | 'core' | 'weak';

export interface Hurtbox {
  x: number;
  y: number;
  w: number;
  h: number;
  part: HitPart;
  /** Optional sub-part identifier (boss armor plates). */
  tag?: string;
}

export interface DamageInfo {
  amount: number;
  type: DamageType;
  shieldMult: number;
  armorMult: number;
  headshotMult: number;
  byPlayer: boolean;
  sourceId: number;
  sourceFaction: Faction | 'neutral';
  dirX: number;
  dirY: number;
  x: number;
  y: number;
  stripShield?: boolean;
  stun?: number;
  knockback?: number;
  weaponId?: string;
  explosive?: boolean;
}

export function makeDamage(partial: Partial<DamageInfo> & { amount: number }): DamageInfo {
  return {
    type: 'kinetic',
    shieldMult: 1,
    armorMult: 1,
    headshotMult: 1,
    byPlayer: false,
    sourceId: 0,
    sourceFaction: 'neutral',
    dirX: 0,
    dirY: 0,
    x: 0,
    y: 0,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Level data schema
// ---------------------------------------------------------------------------

export type SolidStyle =
  | 'ground'
  | 'rock'
  | 'cliff'
  | 'floating'
  | 'metal'
  | 'catwalk'
  | 'concrete'
  | 'wreck'
  | 'hull';

export interface SolidDef {
  x: number;
  y: number;
  w: number;
  h: number;
  lanes: number;
  style: SolidStyle;
  oneWay?: boolean;
  /** Set for crumbling platforms. */
  crumble?: boolean;
  id?: string;
}

export type EntryStyle = 'none' | 'drop' | 'leap' | 'fly' | 'hangar' | 'pod';

export interface SpawnDef {
  type: string;
  x: number;
  y?: number;
  lane?: number;
  entry?: EntryStyle;
  delay?: number;
  facing?: number;
  patrol?: [number, number];
  /** Enemy starts already aware of the player. */
  alerted?: boolean;
}

export type TriggerAction =
  | { type: 'radio'; lines: string[]; delay?: number }
  | { type: 'objective'; text: string; markerX?: number; markerY?: number }
  | { type: 'hint'; text: string; duration?: number; actions?: string[] }
  | { type: 'encounter'; id: string }
  | { type: 'spawn'; spawns: SpawnDef[] }
  | { type: 'music'; intensity: number }
  | { type: 'cutscene'; id: string }
  | { type: 'endMission' };

export interface TriggerDef {
  id: string;
  x: number;
  /** Optional vertical/ lane constraints. */
  minY?: number;
  lane?: number;
  /** Only fires once the named encounter has been cleared. */
  requires?: string;
  actions: TriggerAction[];
}

export interface WaveDef {
  /** Start when the number of living enemies from earlier waves is at or below this. */
  whenRemaining: number;
  delay?: number;
  spawns: SpawnDef[];
  actions?: TriggerAction[];
}

export interface EncounterDef {
  id: string;
  lock?: { left: number; right: number };
  waves: WaveDef[];
  onClear: TriggerAction[];
  /** Camera zone used while the encounter is active. */
  camera?: { x0: number; x1: number; zoom: number };
}

export type PropType =
  | 'barrel'
  | 'crate'
  | 'crateSmall'
  | 'barricade'
  | 'sandbags'
  | 'fuelTank'
  | 'vent'
  | 'checkpoint'
  | 'weapon'
  | 'ammo'
  | 'grenades'
  | 'health'
  | 'intel'
  | 'cache'
  | 'ordnance';

export interface PropDef {
  type: PropType;
  x: number;
  y: number;
  lane: number;
  id?: string;
  weapon?: string;
  grenade?: string;
  count?: number;
  period?: number;
  offset?: number;
  w?: number;
  h?: number;
  rp?: number;
}

export type DecorType =
  | 'treePine'
  | 'treeFan'
  | 'flower'
  | 'bulbPlant'
  | 'fern'
  | 'grass'
  | 'rockPile'
  | 'crystal'
  | 'wreck'
  | 'wreckPiece'
  | 'fire'
  | 'smoke'
  | 'tower'
  | 'wall'
  | 'hangar'
  | 'antenna'
  | 'pylon'
  | 'fence'
  | 'sign'
  | 'lamp'
  | 'vines'
  | 'stalactite'
  | 'bridgeRuin'
  | 'container'
  | 'monolith'
  | 'pipe'
  | 'girder';

export interface DecorDef {
  type: DecorType;
  x: number;
  y: number;
  z: number;
  scale?: number;
  rot?: number;
  flip?: boolean;
  color?: number;
  seed?: number;
  /** Foreground pieces fade out when they overlap the player. */
  foreground?: boolean;
}

export interface CameraZone {
  x0: number;
  x1: number;
  zoom?: number;
  yOffset?: number;
  minY?: number;
}

export interface CheckpointDef {
  id: string;
  x: number;
  y: number;
  lane: number;
}

export interface LevelData {
  id: string;
  name: string;
  spawn: { x: number; y: number; lane: number };
  bounds: { minX: number; maxX: number };
  killY: number;
  solids: SolidDef[];
  props: PropDef[];
  decor: DecorDef[];
  triggers: TriggerDef[];
  encounters: EncounterDef[];
  cameraZones: CameraZone[];
  checkpoints: CheckpointDef[];
  /** Initial (non-encounter) enemy placements. */
  enemies: SpawnDef[];
  boss?: { x: number; y: number; arena: { left: number; right: number }; triggerX: number };
  /** Visual identity of the level. */
  theme: {
    skyTop: number;
    skyMid: number;
    skyHorizon: number;
    fog: number;
    sun: number;
    hemiSky: number;
    hemiGround: number;
    grass: number;
    soil: number;
    rock: number;
    rockDark: number;
  };
  /** Pits/abysses rendered with glowing energy below. */
  chasms: Array<{ x0: number; x1: number }>;
}

export interface SurfaceInfo {
  surface: Surface;
}
