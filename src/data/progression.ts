// Upgrades, cosmetics and mission challenges.

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  costs: number[];
  /** Value per level (meaning depends on the upgrade). */
  values: number[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'shieldRecharge',
    name: 'Capacitor Tuning',
    description: 'Shields begin recharging sooner after taking damage.',
    costs: [150, 300],
    values: [0.85, 0.7],
  },
  {
    id: 'ammoCapacity',
    name: 'Ammo Webbing',
    description: 'Carry more reserve ammunition for kinetic and explosive weapons.',
    costs: [120, 260],
    values: [1.25, 1.5],
  },
  {
    id: 'precision',
    name: 'Precision Optics',
    description: 'Increases headshot damage bonus.',
    costs: [140, 280],
    values: [1.15, 1.3],
  },
  {
    id: 'grenadeCapacity',
    name: 'Grenade Harness',
    description: 'Carry one additional grenade of each type.',
    costs: [180],
    values: [1],
  },
  {
    id: 'incendiaryFrag',
    name: 'Ember-Cored Frags',
    description: 'Frag grenades leave a burning plasma field for a few seconds.',
    costs: [240],
    values: [1],
  },
  {
    id: 'shieldCapacity',
    name: 'Reinforced Emitters',
    description: 'Increases maximum shield strength.',
    costs: [200, 360],
    values: [1.15, 1.3],
  },
];

export interface ArmorScheme {
  id: string;
  name: string;
  primary: number;
  secondary: number;
  accent: number;
  unlock: string;
}

export const ARMOR_SCHEMES: ArmorScheme[] = [
  { id: 'kestrel', name: 'Kestrel Standard', primary: 0x8a9eae, secondary: 0x4d5a66, accent: 0xff8a3a, unlock: 'Default' },
  { id: 'arctic', name: 'Arctic Survey', primary: 0xd9dde0, secondary: 0x8b97a0, accent: 0x2f8fd8, unlock: 'Default' },
  { id: 'nightops', name: 'Night Operations', primary: 0x2c3036, secondary: 0x1a1d22, accent: 0x5ff2ff, unlock: 'Complete Mission 01' },
  { id: 'ember', name: 'Ember Guard', primary: 0x8c3b2a, secondary: 0x4a2219, accent: 0xffc24a, unlock: 'Earn rank A or better' },
  { id: 'crimson', name: 'Crimson Vanguard', primary: 0x9a2230, secondary: 0x3d1218, accent: 0xe8e2d0, unlock: 'Complete on Veteran or higher' },
  { id: 'origami', name: 'Origami Gold', primary: 0xd6b25a, secondary: 0x7a5e2a, accent: 0xfff2c8, unlock: 'Recover all intel' },
];

export interface VisorDef {
  id: string;
  name: string;
  color: number;
  unlock: string;
}

export const VISORS: VisorDef[] = [
  { id: 'cyan', name: 'Cyan', color: 0x5ff2ff, unlock: 'Default' },
  { id: 'amber', name: 'Amber', color: 0xffb340, unlock: 'Default' },
  { id: 'violet', name: 'Violet', color: 0xc77dff, unlock: 'Defeat the Colossus' },
  { id: 'jade', name: 'Jade', color: 0x5dff9a, unlock: 'Complete all challenges' },
];

export interface ChallengeDef {
  id: string;
  name: string;
  description: string;
  reward: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'm01_marksman', name: 'Marksman', description: 'Score 12 headshots in Mission 01.', reward: 100 },
  { id: 'm01_demolition', name: 'Demolitions Expert', description: 'Kill 6 enemies with explosions.', reward: 100 },
  { id: 'm01_archivist', name: 'Archivist', description: 'Recover all 3 intel items.', reward: 120 },
  { id: 'm01_untouchable', name: 'Untouchable', description: 'Complete the mission without dying.', reward: 150 },
  { id: 'm01_engineer', name: 'Collateral', description: 'Damage the Colossus with an exploding fuel tank.', reward: 80 },
];

export const RANKS = [
  { rank: 'S', min: 12000 },
  { rank: 'A', min: 9000 },
  { rank: 'B', min: 6000 },
  { rank: 'C', min: 3500 },
  { rank: 'D', min: 0 },
];
