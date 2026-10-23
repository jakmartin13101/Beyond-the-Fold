// Data-driven weapon statistics. Gameplay code reads only these definitions,
// so new weapons can be added here without touching the weapon system.
import type { ExplosionKind } from '../core/events';

export type FireMode = 'auto' | 'burst' | 'semi' | 'charge' | 'pump';
export type ProjectileKind = 'bullet' | 'plasma' | 'pellet' | 'rocket' | 'shard' | 'slug' | 'bolt' | 'missile';
export type DamageType = 'kinetic' | 'plasma' | 'explosive' | 'melee' | 'energy' | 'fall' | 'hazard';

export interface ProjectileDef {
  kind: ProjectileKind;
  speed: number;
  gravity: number;
  radius: number;
  life: number;
  color: number;
  glow: number;
  length: number;
  width: number;
  light: number;
  damageType: DamageType;
  explosive?: { radius: number; damage: number; kind: ExplosionKind };
  bounces?: number;
  homing?: number;
  accel?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  short: string;
  description: string;
  family: 'kinetic' | 'energy' | 'explosive';
  fireMode: FireMode;
  rpm: number;
  burst?: { count: number; interval: number };
  damage: number;
  headshotMult: number;
  shieldMult: number;
  armorMult: number;
  pellets: number;
  spread: number;
  spreadMax: number;
  spreadPerShot: number;
  spreadRecovery: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  /** Shell-by-shell reload (shotgun). */
  perShellReload?: boolean;
  /** Battery weapons consume charge instead of reloading. */
  battery?: { perShot: number; heatPerShot: number; coolRate: number; overheatTime: number };
  charge?: { time: number; damage: number; cost: number; speedMult: number; homing: number; stripShield: boolean };
  falloff?: { start: number; end: number; min: number };
  recoil: { kick: number; shake: number; climb: number };
  projectile: ProjectileDef;
  muzzle: { color: number; size: number; light: number };
  sound: string;
  model: string;
  zoom?: number;
  /** Seconds the player needs to bring the weapon up after switching. */
  readyTime: number;
  /** Visual tint for HUD icon. */
  hudColor: string;
}

const KINETIC_TRACER = 0xffd48a;

export const WEAPONS: Record<string, WeaponDef> = {
  ar: {
    id: 'ar',
    name: 'AR-41 Vanguard',
    short: 'ASSAULT RIFLE',
    description: 'Reliable fully-automatic rifle. Effective at close to medium range.',
    family: 'kinetic',
    fireMode: 'auto',
    rpm: 600,
    damage: 9,
    headshotMult: 1.6,
    shieldMult: 0.85,
    armorMult: 0.5,
    pellets: 1,
    spread: 1.4,
    spreadMax: 5.5,
    spreadPerShot: 0.45,
    spreadRecovery: 9,
    magSize: 36,
    reserveMax: 288,
    reloadTime: 1.85,
    recoil: { kick: 0.08, shake: 0.06, climb: 0.35 },
    projectile: {
      kind: 'bullet',
      speed: 95,
      gravity: 0,
      radius: 0.05,
      life: 0.6,
      color: 0xfff1c8,
      glow: KINETIC_TRACER,
      length: 2.2,
      width: 0.09,
      light: 0,
      damageType: 'kinetic',
    },
    muzzle: { color: 0xffb860, size: 0.55, light: 5 },
    sound: 'ar',
    model: 'ar',
    readyTime: 0.45,
    hudColor: '#ffd48a',
  },
  br: {
    id: 'br',
    name: 'BR-9 Longbow',
    short: 'BATTLE RIFLE',
    description: 'Three-round burst rifle. Precise at medium range; rewards headshots.',
    family: 'kinetic',
    fireMode: 'burst',
    rpm: 160,
    burst: { count: 3, interval: 0.065 },
    damage: 13,
    headshotMult: 2.6,
    shieldMult: 0.85,
    armorMult: 0.55,
    pellets: 1,
    spread: 0.35,
    spreadMax: 1.6,
    spreadPerShot: 0.25,
    spreadRecovery: 6,
    magSize: 36,
    reserveMax: 180,
    reloadTime: 2.05,
    recoil: { kick: 0.12, shake: 0.09, climb: 0.5 },
    projectile: {
      kind: 'bullet',
      speed: 130,
      gravity: 0,
      radius: 0.05,
      life: 0.6,
      color: 0xffffff,
      glow: 0xbfe6ff,
      length: 2.8,
      width: 0.08,
      light: 0,
      damageType: 'kinetic',
    },
    muzzle: { color: 0xffd7a0, size: 0.6, light: 6 },
    sound: 'br',
    model: 'br',
    readyTime: 0.5,
    hudColor: '#bfe6ff',
  },
  ember: {
    id: 'ember',
    name: 'Thren Ember Pistol',
    short: 'PLASMA PISTOL',
    description: 'Alien plasma sidearm. Strips shields. Hold fire to charge an overcharged bolt that disables shields and drones.',
    family: 'energy',
    fireMode: 'charge',
    rpm: 330,
    damage: 11,
    headshotMult: 1.2,
    shieldMult: 2.1,
    armorMult: 0.7,
    pellets: 1,
    spread: 1.0,
    spreadMax: 3,
    spreadPerShot: 0.3,
    spreadRecovery: 6,
    magSize: 100,
    reserveMax: 0,
    reloadTime: 0,
    battery: { perShot: 1.5, heatPerShot: 0.11, coolRate: 0.55, overheatTime: 1.6 },
    charge: { time: 0.9, damage: 32, cost: 10, speedMult: 0.75, homing: 3.2, stripShield: true },
    recoil: { kick: 0.06, shake: 0.05, climb: 0.2 },
    projectile: {
      kind: 'plasma',
      speed: 34,
      gravity: 0,
      radius: 0.14,
      life: 1.4,
      color: 0xe9ffd0,
      glow: 0x8dff3a,
      length: 0.9,
      width: 0.34,
      light: 4,
      damageType: 'plasma',
    },
    muzzle: { color: 0x9dff4a, size: 0.5, light: 5 },
    sound: 'plasma',
    model: 'ember',
    readyTime: 0.35,
    hudColor: '#9dff4a',
  },
  shotgun: {
    id: 'shotgun',
    name: 'SG-4 Breacher',
    short: 'SHOTGUN',
    description: 'Pump-action shotgun. Devastating at close range; reload shell by shell.',
    family: 'kinetic',
    fireMode: 'pump',
    rpm: 72,
    damage: 12,
    headshotMult: 1.25,
    shieldMult: 0.9,
    armorMult: 0.6,
    pellets: 10,
    spread: 7.5,
    spreadMax: 7.5,
    spreadPerShot: 0,
    spreadRecovery: 10,
    magSize: 6,
    reserveMax: 36,
    reloadTime: 0.48,
    perShellReload: true,
    falloff: { start: 5, end: 13, min: 0.15 },
    recoil: { kick: 0.32, shake: 0.32, climb: 1.8 },
    projectile: {
      kind: 'pellet',
      speed: 80,
      gravity: 0,
      radius: 0.06,
      life: 0.22,
      color: 0xfff4d8,
      glow: 0xffc070,
      length: 1.2,
      width: 0.07,
      light: 0,
      damageType: 'kinetic',
    },
    muzzle: { color: 0xffa040, size: 1.0, light: 10 },
    sound: 'shotgun',
    model: 'shotgun',
    readyTime: 0.55,
    hudColor: '#ffb070',
  },
  sniper: {
    id: 'sniper',
    name: 'SR-2 Lancet',
    short: 'SNIPER RIFLE',
    description: 'High-velocity precision rifle. Headshots are lethal. Widens the tactical view.',
    family: 'kinetic',
    fireMode: 'semi',
    rpm: 70,
    damage: 85,
    headshotMult: 3,
    shieldMult: 0.9,
    armorMult: 1,
    pellets: 1,
    spread: 0.05,
    spreadMax: 0.6,
    spreadPerShot: 0.6,
    spreadRecovery: 2,
    magSize: 4,
    reserveMax: 16,
    reloadTime: 2.4,
    recoil: { kick: 0.4, shake: 0.35, climb: 2.5 },
    projectile: {
      kind: 'slug',
      speed: 240,
      gravity: 0,
      radius: 0.05,
      life: 0.45,
      color: 0xffffff,
      glow: 0x9fd8ff,
      length: 6,
      width: 0.1,
      light: 2,
      damageType: 'kinetic',
    },
    muzzle: { color: 0xcfe8ff, size: 1.1, light: 9 },
    sound: 'sniper',
    model: 'sniper',
    zoom: 1.35,
    readyTime: 0.7,
    hudColor: '#9fd8ff',
  },
  rocket: {
    id: 'rocket',
    name: 'RL-6 Hammerfall',
    short: 'ROCKET LAUNCHER',
    description: 'Shoulder-fired rocket. Massive explosive damage against armored targets.',
    family: 'explosive',
    fireMode: 'semi',
    rpm: 55,
    damage: 40,
    headshotMult: 1,
    shieldMult: 1,
    armorMult: 2.4,
    pellets: 1,
    spread: 0.3,
    spreadMax: 0.3,
    spreadPerShot: 0,
    spreadRecovery: 2,
    magSize: 2,
    reserveMax: 6,
    reloadTime: 2.9,
    recoil: { kick: 0.45, shake: 0.5, climb: 1.2 },
    projectile: {
      kind: 'rocket',
      speed: 16,
      accel: 38,
      gravity: 0,
      radius: 0.18,
      life: 2.6,
      color: 0xffe2b0,
      glow: 0xff8a3a,
      length: 0.9,
      width: 0.35,
      light: 7,
      damageType: 'explosive',
      explosive: { radius: 4.6, damage: 175, kind: 'rocket' },
    },
    muzzle: { color: 0xff9a40, size: 1.4, light: 12 },
    sound: 'rocket',
    model: 'rocket',
    readyTime: 0.8,
    hudColor: '#ff8a3a',
  },
  prism: {
    id: 'prism',
    name: 'Thren Prism Lance',
    short: 'PRISM LANCE',
    description: 'Alien crystal projector. Fires refracting shards that ricochet off hard surfaces.',
    family: 'energy',
    fireMode: 'auto',
    rpm: 280,
    damage: 14,
    headshotMult: 1.3,
    shieldMult: 1.6,
    armorMult: 0.8,
    pellets: 1,
    spread: 1.2,
    spreadMax: 3.5,
    spreadPerShot: 0.35,
    spreadRecovery: 7,
    magSize: 100,
    reserveMax: 0,
    reloadTime: 0,
    battery: { perShot: 2.5, heatPerShot: 0.08, coolRate: 0.6, overheatTime: 1.5 },
    recoil: { kick: 0.07, shake: 0.06, climb: 0.25 },
    projectile: {
      kind: 'shard',
      speed: 46,
      gravity: 0,
      radius: 0.1,
      life: 1.2,
      color: 0xffe0ff,
      glow: 0xff4fd8,
      length: 1.1,
      width: 0.22,
      light: 3,
      damageType: 'energy',
      bounces: 2,
    },
    muzzle: { color: 0xff6fe0, size: 0.6, light: 6 },
    sound: 'prism',
    model: 'prism',
    readyTime: 0.45,
    hudColor: '#ff6fe0',
  },
};

/** Enemy weapons use the same schema; only a subset of fields matter for AI. */
export const ENEMY_WEAPONS: Record<string, WeaponDef> = {
  threnCarbine: {
    ...WEAPONS.ember,
    id: 'threnCarbine',
    name: 'Thren Carbine',
    fireMode: 'burst',
    burst: { count: 3, interval: 0.14 },
    damage: 7,
    projectile: { ...WEAPONS.ember.projectile, speed: 24, life: 2.2, width: 0.3 },
    sound: 'threnShot',
  },
  threnPistol: {
    ...WEAPONS.ember,
    id: 'threnPistol',
    name: 'Thren Pistol',
    fireMode: 'semi',
    damage: 10,
    projectile: { ...WEAPONS.ember.projectile, speed: 22, life: 2.2, width: 0.38, color: 0xfff6d0, glow: 0xc6ff3d },
    sound: 'threnShot',
  },
  droneBlaster: {
    ...WEAPONS.ember,
    id: 'droneBlaster',
    name: 'Watchdog Blaster',
    fireMode: 'burst',
    burst: { count: 2, interval: 0.12 },
    damage: 6,
    shieldMult: 1,
    projectile: {
      kind: 'bolt',
      speed: 28,
      gravity: 0,
      radius: 0.12,
      life: 2,
      color: 0xffe0e0,
      glow: 0xff3030,
      length: 1.1,
      width: 0.24,
      light: 3,
      damageType: 'energy',
    },
    muzzle: { color: 0xff4040, size: 0.45, light: 4 },
    sound: 'droneShot',
  },
  colossusCannon: {
    ...WEAPONS.ember,
    id: 'colossusCannon',
    name: 'Colossus Autocannon',
    fireMode: 'auto',
    damage: 9,
    shieldMult: 1,
    projectile: {
      kind: 'bolt',
      speed: 30,
      gravity: 0,
      radius: 0.16,
      life: 2.4,
      color: 0xfff0d0,
      glow: 0xff5a20,
      length: 1.6,
      width: 0.32,
      light: 4,
      damageType: 'energy',
    },
    muzzle: { color: 0xff7030, size: 1.1, light: 9 },
    sound: 'cannon',
  },
  colossusMissile: {
    ...WEAPONS.rocket,
    id: 'colossusMissile',
    name: 'Colossus Missile',
    damage: 20,
    projectile: {
      ...WEAPONS.rocket.projectile,
      kind: 'missile',
      speed: 12,
      accel: 0,
      gravity: 14,
      life: 6,
      explosive: { radius: 3.2, damage: 45, kind: 'rocket' },
    },
    sound: 'missile',
  },
};

export function getWeapon(id: string): WeaponDef {
  const w = WEAPONS[id] ?? ENEMY_WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}

export interface GrenadeDef {
  id: string;
  name: string;
  fuse: number;
  sticky: boolean;
  restitution: number;
  radius: number;
  damage: number;
  shieldMult: number;
  throwSpeed: number;
  color: number;
  glow: number;
  max: number;
}

export const GRENADES: Record<string, GrenadeDef> = {
  frag: {
    id: 'frag',
    name: 'M3 Frag',
    fuse: 1.7,
    sticky: false,
    restitution: 0.42,
    radius: 4.4,
    damage: 135,
    shieldMult: 1,
    throwSpeed: 16,
    color: 0x5a6a48,
    glow: 0xffa040,
    max: 4,
  },
  plasma: {
    id: 'plasma',
    name: 'Thren Cling Charge',
    fuse: 1.6,
    sticky: true,
    restitution: 0,
    radius: 3.6,
    damage: 155,
    shieldMult: 1.5,
    throwSpeed: 15,
    color: 0x9dff4a,
    glow: 0x9dff4a,
    max: 4,
  },
};
