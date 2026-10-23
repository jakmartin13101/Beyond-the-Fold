// Enemy archetypes. Behaviour code is shared (see game/ai); these numbers tune each class.

export type Faction = 'player' | 'thren' | 'rogue';

export interface DropDef {
  kind: 'weapon' | 'ammo' | 'grenade' | 'health';
  id?: string;
  chance: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  faction: Faction;
  health: number;
  shield: number;
  shieldDelay: number;
  shieldRate: number;
  /** Damage multiplier applied to all non-explosive damage. */
  armor: number;
  width: number;
  height: number;
  crouchHeight: number;
  headHeight: number;
  speed: number;
  accel: number;
  jump: number;
  flying?: boolean;
  weapon?: string;
  sight: number;
  fireRange: number;
  preferredRange: [number, number];
  reaction: number;
  /** Aim error in degrees (scaled by difficulty). */
  inaccuracy: number;
  melee?: { damage: number; range: number; cooldown: number };
  drops: DropDef[];
  score: number;
  staggerThreshold: number;
  voice: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  skirmisher: {
    id: 'skirmisher',
    name: 'Thren Skirmisher',
    faction: 'thren',
    health: 55,
    shield: 45,
    shieldDelay: 3.5,
    shieldRate: 30,
    armor: 1,
    width: 0.8,
    height: 1.9,
    crouchHeight: 1.15,
    headHeight: 0.42,
    speed: 4.6,
    accel: 30,
    jump: 11,
    weapon: 'threnCarbine',
    sight: 21,
    fireRange: 17,
    preferredRange: [7, 15],
    reaction: 0.55,
    inaccuracy: 4.5,
    melee: { damage: 25, range: 1.4, cooldown: 1.2 },
    drops: [
      { kind: 'weapon', id: 'ember', chance: 0.4 },
      { kind: 'grenade', id: 'plasma', chance: 0.35 },
    ],
    score: 100,
    staggerThreshold: 30,
    voice: 'thren',
  },
  ravager: {
    id: 'ravager',
    name: 'Thren Ravager',
    faction: 'thren',
    health: 190,
    shield: 0,
    shieldDelay: 0,
    shieldRate: 0,
    armor: 0.85,
    width: 1.3,
    height: 2.4,
    crouchHeight: 2.0,
    headHeight: 0.5,
    speed: 4.2,
    accel: 40,
    jump: 12,
    sight: 26,
    fireRange: 0,
    preferredRange: [0, 2],
    reaction: 0.4,
    inaccuracy: 0,
    melee: { damage: 45, range: 2.2, cooldown: 1.4 },
    drops: [
      { kind: 'ammo', chance: 0.6 },
      { kind: 'health', chance: 0.25 },
    ],
    score: 250,
    staggerThreshold: 70,
    voice: 'ravager',
  },
  bulwark: {
    id: 'bulwark',
    name: 'Thren Bulwark',
    faction: 'thren',
    health: 120,
    shield: 0,
    shieldDelay: 0,
    shieldRate: 0,
    armor: 1,
    width: 1.0,
    height: 2.05,
    crouchHeight: 1.6,
    headHeight: 0.42,
    speed: 2.8,
    accel: 20,
    jump: 9,
    weapon: 'threnPistol',
    sight: 20,
    fireRange: 16,
    preferredRange: [5, 11],
    reaction: 0.6,
    inaccuracy: 3.5,
    melee: { damage: 35, range: 1.8, cooldown: 1.6 },
    drops: [
      { kind: 'grenade', id: 'plasma', chance: 0.5 },
      { kind: 'weapon', id: 'ember', chance: 0.3 },
    ],
    score: 200,
    staggerThreshold: 60,
    voice: 'thren',
  },
  drone: {
    id: 'drone',
    name: 'Watchdog Drone',
    faction: 'rogue',
    health: 50,
    shield: 0,
    shieldDelay: 0,
    shieldRate: 0,
    armor: 1,
    width: 1.1,
    height: 1.0,
    crouchHeight: 1.0,
    headHeight: 0,
    speed: 6,
    accel: 14,
    jump: 0,
    flying: true,
    weapon: 'droneBlaster',
    sight: 22,
    fireRange: 17,
    preferredRange: [6, 12],
    reaction: 0.5,
    inaccuracy: 3.5,
    drops: [{ kind: 'ammo', chance: 0.45 }],
    score: 120,
    staggerThreshold: 25,
    voice: 'drone',
  },
};

export interface DifficultyDef {
  id: string;
  name: string;
  description: string;
  enemyDamage: number;
  enemyHealth: number;
  accuracy: number;
  reaction: number;
  attackTokens: number;
  projectileSpeed: number;
  scoreMult: number;
  playerShieldDelay: number;
}

export const DIFFICULTIES: Record<string, DifficultyDef> = {
  recruit: {
    id: 'recruit',
    name: 'Recruit',
    description: 'For players new to shooters. Enemies hit softer and react slower.',
    enemyDamage: 0.55,
    enemyHealth: 0.8,
    accuracy: 1.6,
    reaction: 1.4,
    attackTokens: 2,
    projectileSpeed: 0.85,
    scoreMult: 0.75,
    playerShieldDelay: 0.8,
  },
  regular: {
    id: 'regular',
    name: 'Regular',
    description: 'The intended experience. Enemies fight smart and punish standing still.',
    enemyDamage: 1,
    enemyHealth: 1,
    accuracy: 1,
    reaction: 1,
    attackTokens: 3,
    projectileSpeed: 1,
    scoreMult: 1,
    playerShieldDelay: 1,
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran',
    description: 'Enemies are tougher, deadlier and coordinate more aggressively.',
    enemyDamage: 1.45,
    enemyHealth: 1.3,
    accuracy: 0.75,
    reaction: 0.8,
    attackTokens: 4,
    projectileSpeed: 1.12,
    scoreMult: 1.5,
    playerShieldDelay: 1.1,
  },
  ironclad: {
    id: 'ironclad',
    name: 'Ironclad',
    description: 'No margin for error. Every engagement is lethal.',
    enemyDamage: 2,
    enemyHealth: 1.6,
    accuracy: 0.55,
    reaction: 0.65,
    attackTokens: 5,
    projectileSpeed: 1.22,
    scoreMult: 2.2,
    playerShieldDelay: 1.2,
  },
};
