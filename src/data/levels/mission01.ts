// Mission 01 — LANDFALL. Crash site → alien ridge → chasm crossing → perimeter outpost → Colossus.
import { Rng } from '../../core/math';
import type { DecorDef, LevelData, SolidDef } from '../../game/types';
import { LANE_BACK, LANE_BOTH, LANE_FRONT } from '../../game/types';

const S = (x0: number, x1: number, top: number, h: number, lanes: number, style: SolidDef['style'], extra: Partial<SolidDef> = {}): SolidDef => ({
  x: x0,
  y: top - h,
  w: x1 - x0,
  h,
  lanes,
  style,
  ...extra,
});

const solids: SolidDef[] = [
  // --- Crash site
  S(-34, -14, 9, 21, LANE_BOTH, 'cliff'),
  S(-14, 31, 0, 12, LANE_BOTH, 'ground'),
  S(12.4, 14.8, 1.3, 1.3, LANE_FRONT, 'hull'),
  S(5.5, 9.5, 1.7, 1.7, LANE_BACK, 'rock'),
  // --- Ridge & first contact
  S(31, 113, 1.2, 13.2, LANE_BOTH, 'ground'),
  S(39.5, 41.3, 2.1, 0.9, LANE_FRONT, 'rock'),
  S(83.6, 85.4, 2.2, 1.0, LANE_BOTH, 'rock'),
  S(100, 107, 3.1, 1.9, LANE_BACK, 'rock'),
  // --- Chasm crossing
  S(115, 119.5, 2.0, 5, LANE_BOTH, 'floating'),
  S(121.6, 124.6, 3.0, 0.7, LANE_FRONT, 'floating', { crumble: true }),
  S(127, 132, 2.4, 4.4, LANE_BOTH, 'floating'),
  S(135, 144, 2.0, 5, LANE_BOTH, 'floating'),
  S(147, 150, 3.0, 0.7, LANE_FRONT, 'floating', { crumble: true }),
  S(152.5, 156.5, 2.4, 4.4, LANE_BOTH, 'floating'),
  // Hidden upper path (background lane)
  S(130.6, 134.6, 4.3, 0.55, LANE_BACK, 'floating', { oneWay: true }),
  S(137, 141, 5.8, 0.55, LANE_BACK, 'floating', { oneWay: true }),
  S(143.4, 152.2, 6.4, 0.7, LANE_BACK, 'floating', { oneWay: true }),
  // --- Outpost
  S(159, 290, 1.2, 13.2, LANE_BOTH, 'ground'),
  S(217, 231, 3.8, 0.35, LANE_FRONT, 'catwalk', { oneWay: true }),
  S(250.6, 253.2, 4.1, 0.35, LANE_FRONT, 'catwalk', { oneWay: true }),
  S(253, 257.4, 6.0, 0.35, LANE_FRONT, 'catwalk', { oneWay: true }),
  // --- Yard & boss arena
  S(290, 352, 0.4, 12.4, LANE_BOTH, 'concrete'),
  S(323.6, 331.4, 4.4, 0.35, LANE_FRONT, 'catwalk', { oneWay: true }),
  S(352, 380, 14, 26, LANE_BOTH, 'metal'),
];

function buildDecor(): DecorDef[] {
  const r = new Rng(1337);
  const d: DecorDef[] = [];
  const add = (x: DecorDef) => d.push(x);

  // Background forest bands along the walk, skipping the chasm and the yard.
  const bands: Array<[number, number, number]> = [
    [-30, 112, 0],
    [158, 182, 1.2],
  ];
  for (const [x0, x1, y] of bands) {
    for (let x = x0; x < x1; x += r.range(3.2, 6.5)) {
      add({ type: r.chance(0.6) ? 'treePine' : 'treeFan', x, y, z: r.range(-7.5, -13), scale: r.range(0.85, 1.5), seed: r.int(0, 9999) });
      if (r.chance(0.45)) add({ type: 'treePine', x: x + r.range(-2, 2), y, z: r.range(-16, -24), scale: r.range(1.2, 2), seed: r.int(0, 9999) });
    }
  }
  // Undergrowth near the lanes.
  for (let x = -12; x < 112; x += r.range(1.6, 3.4)) {
    const y = x < 31 ? 0 : 1.2;
    const t = r.next();
    if (t < 0.35) add({ type: 'grass', x, y, z: r.range(-5.2, -4.6), scale: r.range(0.8, 1.3), seed: r.int(0, 9999) });
    else if (t < 0.55) add({ type: 'fern', x, y, z: r.range(-5.6, -4.8), scale: r.range(0.7, 1.1), seed: r.int(0, 9999) });
    else if (t < 0.7) add({ type: 'bulbPlant', x, y, z: r.range(-6, -5), scale: r.range(0.7, 1.2), seed: r.int(0, 9999) });
    else if (t < 0.8) add({ type: 'flower', x, y, z: r.range(-9, -6.5), scale: r.range(1.2, 2.2), seed: r.int(0, 9999) });
    if (r.chance(0.3)) add({ type: 'grass', x: x + 0.7, y, z: r.range(1.35, 1.6), scale: r.range(0.5, 0.8), seed: r.int(0, 9999) });
  }
  for (let x = 160; x < 182; x += r.range(1.8, 3)) {
    add({ type: r.chance(0.5) ? 'grass' : 'fern', x, y: 1.2, z: r.range(-5.6, -4.7), scale: r.range(0.7, 1.1), seed: r.int(0, 9999) });
  }

  // Foreground silhouettes (fade when overlapping the player).
  const fg: Array<[number, number]> = [
    [-6, 0],
    [22, 0],
    [48, 1.2],
    [77, 1.2],
    [104, 1.2],
    [170, 1.2],
    [199, 1.2],
    [241, 1.2],
    [276, 1.2],
  ];
  for (const [x, y] of fg) {
    add({ type: 'fern', x, y: y - 0.4, z: r.range(4.2, 5.2), scale: r.range(1.6, 2.3), seed: r.int(0, 9999), foreground: true });
    if (r.chance(0.6)) add({ type: 'grass', x: x + r.range(1, 2.5), y: y - 0.3, z: r.range(3.5, 4.2), scale: r.range(1.2, 1.6), seed: r.int(0, 9999), foreground: true });
  }
  add({ type: 'girder', x: 216, y: 9, z: 4.5, scale: 1.3, foreground: true });
  add({ type: 'girder', x: 318, y: 10, z: 4.8, scale: 1.5, foreground: true, rot: 0.2 });
  add({ type: 'vines', x: 36, y: 12, z: 4, scale: 1.4, foreground: true, seed: 4 });
  add({ type: 'vines', x: 140, y: 13, z: 3.6, scale: 1.6, foreground: true, seed: 9 });

  // --- Crash site set dressing
  add({ type: 'wreck', x: 2, y: 0, z: -6.6, scale: 1, rot: -0.12 });
  add({ type: 'fire', x: -1.5, y: 1.4, z: -5.4, scale: 1.2 });
  add({ type: 'fire', x: 5.2, y: 2.6, z: -6.2, scale: 0.9 });
  add({ type: 'smoke', x: 1, y: 3, z: -7, scale: 1.6 });
  add({ type: 'smoke', x: 6, y: 3.5, z: -7.5, scale: 1.2 });
  add({ type: 'wreckPiece', x: 13.6, y: 0, z: 0, scale: 1, seed: 1 });
  add({ type: 'wreckPiece', x: 19, y: 0, z: -4.3, scale: 0.8, seed: 2, rot: 0.6 });
  add({ type: 'wreckPiece', x: -8, y: 0, z: -4.5, scale: 0.9, seed: 3, rot: -0.4 });
  add({ type: 'fire', x: 19.3, y: 0.6, z: -4.2, scale: 0.6 });
  add({ type: 'rockPile', x: 24, y: 0, z: -5.4, scale: 1.2, seed: 5 });
  add({ type: 'rockPile', x: 58, y: 1.2, z: -5.3, scale: 1, seed: 6 });
  add({ type: 'monolith', x: 66, y: 1.2, z: -11, scale: 1.4, seed: 2 });
  add({ type: 'crystal', x: 90, y: 1.2, z: -5.6, scale: 1.1, seed: 3 });
  add({ type: 'crystal', x: 108, y: 1.2, z: -5.4, scale: 1.4, seed: 8 });
  add({ type: 'sign', x: 96, y: 1.2, z: -5.2, scale: 1, seed: 1 });

  // --- Chasm: floating rock undersides, crystals, hanging vines
  for (let x = 114; x < 158; x += r.range(5, 9)) {
    add({ type: 'stalactite', x, y: r.range(-4, -1), z: r.range(-14, -24), scale: r.range(1.5, 3), seed: r.int(0, 9999) });
  }
  add({ type: 'crystal', x: 117, y: 2, z: -4.8, scale: 0.9, seed: 11 });
  add({ type: 'crystal', x: 141.5, y: 2, z: -4.9, scale: 0.8, seed: 12 });
  add({ type: 'bridgeRuin', x: 136, y: 9, z: -18, scale: 1.4 });
  add({ type: 'monolith', x: 148, y: -2, z: -30, scale: 3.2, seed: 7 });

  // --- Outpost structures
  add({ type: 'wall', x: 184, y: 1.2, z: -6.2, scale: 1, seed: 1 });
  add({ type: 'tower', x: 255, y: 1.2, z: 0, scale: 1 });
  add({ type: 'hangar', x: 241, y: 1.2, z: -14, scale: 1, seed: 1 });
  add({ type: 'fence', x: 196, y: 1.2, z: -5.8, scale: 1 });
  add({ type: 'fence', x: 214, y: 1.2, z: -5.8, scale: 1 });
  add({ type: 'fence', x: 262, y: 1.2, z: -5.8, scale: 1 });
  add({ type: 'lamp', x: 190, y: 1.2, z: -5, scale: 1 });
  add({ type: 'lamp', x: 222, y: 1.2, z: -5, scale: 1 });
  add({ type: 'lamp', x: 268, y: 1.2, z: -5, scale: 1 });
  add({ type: 'container', x: 205, y: 1.2, z: -8.5, scale: 1, color: 0x6a7d5a, rot: 0.1 });
  add({ type: 'container', x: 230, y: 1.2, z: -9.5, scale: 1, color: 0x8a5a3a, rot: -0.2 });
  add({ type: 'container', x: 230, y: 3.8, z: -9.5, scale: 1, color: 0x4a6a8a, rot: -0.15 });
  add({ type: 'antenna', x: 212, y: 1.2, z: -12, scale: 1.4 });
  add({ type: 'pylon', x: 224, y: 1.2, z: -2.4, scale: 1 });
  add({ type: 'pylon', x: 218, y: 1.2, z: -2.4, scale: 1 });
  add({ type: 'pylon', x: 230, y: 1.2, z: -2.4, scale: 1 });
  add({ type: 'sign', x: 179, y: 1.2, z: -5.3, scale: 1.1, seed: 2 });

  // --- Yard & arena
  add({ type: 'pipe', x: 296, y: 0.4, z: -6, scale: 1 });
  add({ type: 'container', x: 282, y: 1.2, z: -7.8, scale: 1, color: 0x7a6a4a, rot: 0.05 });
  add({ type: 'lamp', x: 300, y: 0.4, z: -5, scale: 1.1 });
  add({ type: 'lamp', x: 326, y: 0.4, z: -5.4, scale: 1.1 });
  add({ type: 'pylon', x: 324.2, y: 0.4, z: -0.6, scale: 1.05 });
  add({ type: 'pylon', x: 330.8, y: 0.4, z: -0.6, scale: 1.05 });
  add({ type: 'antenna', x: 310, y: 0.4, z: -16, scale: 2 });
  add({ type: 'wall', x: 300, y: 0.4, z: -9, scale: 1.3, seed: 2 });
  add({ type: 'sign', x: 292, y: 0.4, z: -5.2, scale: 1.2, seed: 3 });

  return d;
}

export const MISSION_01: LevelData = {
  id: 'm01',
  name: 'Landfall',
  spawn: { x: 1.5, y: 0, lane: 0 },
  bounds: { minX: -12.5, maxX: 351 },
  killY: -9,
  solids,
  chasms: [{ x0: 113, x1: 159 }],
  props: [
    // Crash site
    { type: 'intel', x: 7.6, y: 1.7, lane: 1, id: 'intel_heron' },
    { type: 'ammo', x: 17, y: 0, lane: 0, id: 'ammo_crash' },
    { type: 'grenades', x: 27, y: 0, lane: 0, grenade: 'frag', count: 2, id: 'gren_crash' },
    // First contact
    { type: 'crate', x: 71.5, y: 1.2, lane: 0 },
    { type: 'crateSmall', x: 73.4, y: 1.2, lane: 0 },
    { type: 'crate', x: 95, y: 1.2, lane: 0 },
    { type: 'barrel', x: 91.2, y: 1.2, lane: 0 },
    { type: 'barrel', x: 99, y: 1.2, lane: 1 },
    { type: 'sandbags', x: 79, y: 1.2, lane: 1 },
    { type: 'health', x: 110, y: 1.2, lane: 0, id: 'med_b' },
    // Chasm
    { type: 'vent', x: 139.5, y: 2.0, lane: 0, period: 3.4, offset: 0 },
    { type: 'vent', x: 117.3, y: 2.0, lane: 1, period: 4.2, offset: 1.5 },
    { type: 'intel', x: 145.4, y: 6.4, lane: 1, id: 'intel_sen' },
    { type: 'cache', x: 149.6, y: 6.4, lane: 1, id: 'cache_ridge', weapon: 'br', rp: 60 },
    // Outpost
    { type: 'ammo', x: 172, y: 1.2, lane: 0, id: 'ammo_cp' },
    { type: 'weapon', x: 176.5, y: 1.2, lane: 0, weapon: 'shotgun', id: 'shotgun_rack' },
    { type: 'barricade', x: 198, y: 1.2, lane: 0 },
    { type: 'barricade', x: 203, y: 1.2, lane: 1 },
    { type: 'sandbags', x: 207.5, y: 1.2, lane: 0 },
    { type: 'barrel', x: 211, y: 1.2, lane: 0 },
    { type: 'crate', x: 214.5, y: 1.2, lane: 0 },
    { type: 'crate', x: 222, y: 1.2, lane: 1 },
    { type: 'barricade', x: 226.5, y: 1.2, lane: 0 },
    { type: 'barrel', x: 229.5, y: 1.2, lane: 1 },
    { type: 'crate', x: 233.5, y: 1.2, lane: 0 },
    { type: 'sandbags', x: 238.5, y: 1.2, lane: 1 },
    { type: 'sandbags', x: 244, y: 1.2, lane: 0 },
    { type: 'barrel', x: 247, y: 1.2, lane: 0 },
    { type: 'crate', x: 249.2, y: 1.2, lane: 0 },
    { type: 'ammo', x: 210, y: 1.2, lane: 1, id: 'ammo_out1' },
    { type: 'grenades', x: 236, y: 1.2, lane: 1, grenade: 'frag', count: 2, id: 'gren_out' },
    { type: 'health', x: 259, y: 1.2, lane: 0, id: 'med_out' },
    { type: 'cache', x: 255.6, y: 6.0, lane: 0, id: 'cache_tower', weapon: 'sniper', rp: 60 },
    // Yard & arena
    { type: 'intel', x: 279, y: 1.2, lane: 1, id: 'intel_override' },
    { type: 'ammo', x: 287, y: 1.2, lane: 0, id: 'ammo_yard' },
    { type: 'ordnance', x: 302.5, y: 0.4, lane: 0, id: 'ordnance' },
    { type: 'fuelTank', x: 313, y: 0.4, lane: 1 },
    { type: 'fuelTank', x: 340, y: 0.4, lane: 1 },
    { type: 'barricade', x: 320.5, y: 0.4, lane: 0 },
    { type: 'barricade', x: 334.5, y: 0.4, lane: 0 },
    { type: 'health', x: 299.5, y: 0.4, lane: 1, id: 'med_arena' },
  ],
  decor: buildDecor(),
  checkpoints: [{ id: 'cp_ridge', x: 166, y: 1.2, lane: 0 }],
  enemies: [],
  encounters: [
    {
      id: 'contact',
      waves: [
        {
          whenRemaining: 99,
          spawns: [
            { type: 'skirmisher', x: 88, lane: 0, patrol: [86, 92], facing: -1 },
            { type: 'skirmisher', x: 97, lane: 0, facing: -1 },
            { type: 'skirmisher', x: 104, lane: 1, facing: -1 },
          ],
        },
        {
          whenRemaining: 1,
          delay: 1.2,
          spawns: [{ type: 'drone', x: 100, lane: 0, entry: 'fly', alerted: true }],
          actions: [
            { type: 'radio', lines: ['drone_1'] },
            { type: 'radio', lines: ['drone_2'], delay: 3 },
          ],
        },
      ],
      onClear: [
        { type: 'radio', lines: ['clear_b'], delay: 1 },
        { type: 'objective', text: 'Cross the shale ridge', markerX: 160, markerY: 1.2 },
      ],
    },
    {
      id: 'outpost',
      lock: { left: 183, right: 263 },
      camera: { x0: 183, x1: 263, zoom: 1.12 },
      waves: [
        {
          whenRemaining: 99,
          spawns: [
            { type: 'skirmisher', x: 221, y: 3.8, lane: 0, alerted: true },
            { type: 'skirmisher', x: 229.5, lane: 0, alerted: true },
            { type: 'bulwark', x: 236.5, lane: 0, alerted: true },
            { type: 'skirmisher', x: 242, lane: 1, alerted: true },
          ],
          actions: [{ type: 'radio', lines: ['bulwark_hint'], delay: 5 }],
        },
        {
          whenRemaining: 1,
          delay: 1.2,
          spawns: [
            { type: 'drone', x: 244, lane: 0, entry: 'hangar', alerted: true },
            { type: 'drone', x: 236, lane: 0, entry: 'hangar', alerted: true, delay: 0.8 },
            { type: 'drone', x: 226, lane: 1, entry: 'hangar', alerted: true, delay: 1.6 },
          ],
          actions: [{ type: 'radio', lines: ['out_3'] }],
        },
        {
          whenRemaining: 1,
          delay: 1.6,
          spawns: [
            { type: 'ravager', x: 248, lane: 0, entry: 'leap', alerted: true },
            { type: 'skirmisher', x: 240, lane: 0, entry: 'drop', alerted: true, delay: 0.6 },
            { type: 'skirmisher', x: 231, lane: 1, entry: 'drop', alerted: true, delay: 1.0 },
            { type: 'ravager', x: 200, lane: 0, entry: 'leap', alerted: true, delay: 2.4 },
          ],
          actions: [{ type: 'radio', lines: ['out_4'] }],
        },
      ],
      onClear: [
        { type: 'radio', lines: ['out_5'], delay: 1.2 },
        { type: 'objective', text: "Proceed to Halden's main yard", markerX: 300, markerY: 0.4 },
        { type: 'music', intensity: 1 },
      ],
    },
  ],
  boss: { x: 344, y: 0.4, arena: { left: 297.5, right: 351 }, triggerX: 307 },
  triggers: [
    { id: 't_start', x: -100, actions: [{ type: 'objective', text: 'Head east to Halden Station', markerX: 300, markerY: 1 }] },
    {
      id: 't_move',
      x: -100,
      actions: [{ type: 'hint', text: 'Move with [left]/[right] · Aim with the mouse · [fire] to shoot', duration: 7, actions: ['left', 'right', 'fire'] }],
    },
    {
      id: 't_lane',
      x: 3.5,
      actions: [
        { type: 'radio', lines: ['lane_hint'] },
        { type: 'hint', text: '[laneIn] / [laneOut] step between the foreground and background lanes', duration: 7, actions: ['laneIn', 'laneOut'] },
      ],
    },
    { id: 't_jump', x: 25, actions: [{ type: 'hint', text: '[jump] to jump — hold for extra height', duration: 5, actions: ['jump'] }] },
    { id: 't_sprint', x: 40, actions: [{ type: 'hint', text: 'Hold [sprint] to sprint · [crouch] while moving to dodge roll', duration: 6, actions: ['sprint', 'crouch'] }] },
    {
      id: 't_contact',
      x: 62,
      actions: [
        { type: 'encounter', id: 'contact' },
        { type: 'radio', lines: ['contact_1', 'contact_2'] },
      ],
    },
    {
      id: 't_combat_hint',
      x: 70,
      actions: [{ type: 'hint', text: '[grenade] throw grenade · [melee] melee · [reload] reload · [switchWeapon] switch weapon', duration: 7, actions: ['grenade', 'melee', 'reload'] }],
    },
    { id: 't_chasm', x: 111, actions: [{ type: 'radio', lines: ['chasm_1'] }] },
    { id: 't_vent', x: 127, actions: [{ type: 'radio', lines: ['vent_1'] }] },
    {
      id: 't_cp',
      x: 165,
      actions: [
        { type: 'radio', lines: ['cp_1', 'cp_2'] },
        { type: 'objective', text: 'Investigate the perimeter outpost', markerX: 215, markerY: 1.2 },
      ],
    },
    {
      id: 't_shotgun',
      x: 172,
      actions: [{ type: 'hint', text: 'Walk over weapons to pick them up · [interact] to swap when your hands are full', duration: 6, actions: ['interact'] }],
    },
    {
      id: 't_outpost',
      x: 186,
      actions: [
        { type: 'radio', lines: ['out_1', 'out_2'] },
        { type: 'objective', text: 'Clear the perimeter outpost' },
      ],
    },
    { id: 't_enc_outpost', x: 192, actions: [{ type: 'encounter', id: 'outpost' }] },
    {
      id: 't_yard',
      x: 284,
      requires: 'outpost',
      actions: [
        { type: 'radio', lines: ['yard_1', 'yard_2'] },
        { type: 'objective', text: 'Investigate the hangar', markerX: 345, markerY: 0.4 },
      ],
    },
    { id: 't_boss', x: 307, requires: 'outpost', actions: [{ type: 'cutscene', id: 'boss_intro' }] },
  ],
  cameraZones: [
    { x0: -40, x1: 30, zoom: 1, yOffset: 0.6 },
    { x0: 30, x1: 112, zoom: 1.02 },
    { x0: 112, x1: 160, zoom: 1.12, yOffset: 1.2 },
    { x0: 160, x1: 290, zoom: 1.04 },
    { x0: 290, x1: 400, zoom: 1.08 },
  ],
  theme: {
    skyTop: 0x140c2e,
    skyMid: 0x4b2a6b,
    skyHorizon: 0xf2925a,
    fog: 0x6a4277,
    sun: 0xffc48a,
    hemiSky: 0x8f8ad8,
    hemiGround: 0x3a2236,
    grass: 0x2f8f86,
    soil: 0x5a3b4c,
    rock: 0x6c5a80,
    rockDark: 0x3b2d4f,
  },
};
