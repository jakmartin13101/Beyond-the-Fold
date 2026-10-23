// Papercraft weapon models. Each model faces +x with the grip at the origin and exposes
// named parts used by animations: 'mag' (reload), 'pump' (shotgun), 'core' (energy glow),
// and 'muzzle' (barrel tip marker).
import * as THREE from 'three';
import { Pt, box, card, chamfer, gem, glow, metalPaper, paper, prism } from '../paper';

const GUN = 0x3d434c;
const DARK = 0x23272d;
const ACCENT = 0xe8772e;
const SAND = 0x8d7f63;

function barrel(len: number, r: number, x: number, y: number, mat: THREE.Material): THREE.Mesh {
  const b = prism(r, r, len, 6, mat);
  b.rotation.z = Math.PI / 2;
  b.position.set(x + len / 2, y, 0);
  return b;
}

function muzzleMarker(g: THREE.Group, x: number, y: number): void {
  const m = new THREE.Object3D();
  m.name = 'muzzle';
  m.position.set(x, y, 0);
  g.add(m);
}

function grip(g: THREE.Group, x: number, color = DARK): void {
  const pts: Pt[] = [
    [-0.03, 0.02],
    [0.06, 0.02],
    [0.03, -0.17],
    [-0.06, -0.17],
  ];
  const m = card(pts, 0.07, color);
  m.position.x = x;
  g.add(m);
}

function buildAR(): THREE.Group {
  const g = new THREE.Group();
  const recv = chamfer(0.66, 0.17, 0.11, metalPaper(GUN), 0.25);
  recv.position.set(0.22, 0.04, 0);
  g.add(recv);
  const shroud = chamfer(0.46, 0.07, 0.09, DARK, 0.3);
  shroud.position.set(0.33, 0.15, 0);
  g.add(shroud);
  const stripe = box(0.34, 0.025, 0.115, paper(ACCENT));
  stripe.position.set(0.2, 0.0, 0);
  g.add(stripe);
  g.add(barrel(0.3, 0.026, 0.55, 0.06, metalPaper(DARK)));
  const brake = box(0.08, 0.06, 0.06, metalPaper(DARK));
  brake.position.set(0.88, 0.06, 0);
  g.add(brake);
  const stock = card(
    [
      [-0.42, -0.06],
      [-0.1, -0.02],
      [-0.1, 0.12],
      [-0.4, 0.09],
      [-0.44, 0.03],
    ],
    0.08,
    DARK,
  );
  g.add(stock);
  grip(g, 0);
  const mag = chamfer(0.09, 0.24, 0.07, paper(0x2f343a), 0.3);
  mag.name = 'mag';
  mag.position.set(0.24, -0.12, 0);
  mag.rotation.z = -0.12;
  g.add(mag);
  const optic = chamfer(0.14, 0.07, 0.07, DARK, 0.3);
  optic.position.set(0.22, 0.22, 0);
  g.add(optic);
  const lens = box(0.012, 0.045, 0.05, glow(0xff7a2a, 2));
  lens.position.set(0.295, 0.22, 0);
  g.add(lens);
  const counter = box(0.08, 0.035, 0.01, glow(0x5ff2ff, 2.2));
  counter.position.set(0.1, 0.08, 0.06);
  g.add(counter);
  muzzleMarker(g, 0.92, 0.06);
  return g;
}

function buildBR(): THREE.Group {
  const g = new THREE.Group();
  const recv = chamfer(0.74, 0.17, 0.11, metalPaper(0x4a525c), 0.22);
  recv.position.set(0.24, 0.05, 0);
  g.add(recv);
  const top = chamfer(0.62, 0.06, 0.09, DARK, 0.3);
  top.position.set(0.3, 0.16, 0);
  g.add(top);
  g.add(barrel(0.36, 0.028, 0.6, 0.07, metalPaper(DARK)));
  const brake = box(0.1, 0.07, 0.07, metalPaper(DARK));
  brake.position.set(1.0, 0.07, 0);
  g.add(brake);
  const scope = prism(0.045, 0.045, 0.3, 6, metalPaper(DARK));
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.25, 0.26, 0);
  g.add(scope);
  const lens = box(0.01, 0.06, 0.06, glow(0x9fd8ff, 2.2));
  lens.position.set(0.405, 0.26, 0);
  g.add(lens);
  const stock = card(
    [
      [-0.38, -0.08],
      [-0.12, -0.03],
      [-0.12, 0.13],
      [-0.36, 0.1],
    ],
    0.08,
    DARK,
  );
  g.add(stock);
  grip(g, 0.02);
  const mag = chamfer(0.1, 0.2, 0.07, paper(0x2f343a), 0.3);
  mag.name = 'mag';
  mag.position.set(0.3, -0.1, 0);
  g.add(mag);
  const stripe = box(0.2, 0.02, 0.115, paper(0x9fd8ff));
  stripe.position.set(0.05, 0.0, 0);
  g.add(stripe);
  muzzleMarker(g, 1.05, 0.07);
  return g;
}

function buildShotgun(): THREE.Group {
  const g = new THREE.Group();
  const recv = chamfer(0.42, 0.18, 0.11, metalPaper(GUN), 0.25);
  recv.position.set(0.12, 0.05, 0);
  g.add(recv);
  g.add(barrel(0.62, 0.035, 0.32, 0.1, metalPaper(DARK)));
  const tube = barrel(0.5, 0.03, 0.32, 0.02, metalPaper(GUN));
  g.add(tube);
  const pump = chamfer(0.26, 0.08, 0.1, paper(SAND), 0.3);
  pump.name = 'pump';
  pump.position.set(0.55, 0.02, 0);
  g.add(pump);
  const stock = card(
    [
      [-0.46, -0.1],
      [-0.08, -0.01],
      [-0.08, 0.12],
      [-0.44, 0.08],
    ],
    0.09,
    SAND,
  );
  g.add(stock);
  grip(g, 0, SAND);
  const shells = box(0.16, 0.05, 0.02, paper(0xc8432a));
  shells.position.set(0.1, 0.06, 0.065);
  g.add(shells);
  const mag = new THREE.Object3D();
  mag.name = 'mag';
  g.add(mag);
  muzzleMarker(g, 0.96, 0.1);
  return g;
}

function buildEmber(): THREE.Group {
  const g = new THREE.Group();
  const shell = card(
    [
      [-0.08, -0.04],
      [0.15, -0.08],
      [0.48, -0.02],
      [0.58, 0.06],
      [0.42, 0.13],
      [0.12, 0.15],
      [-0.06, 0.1],
    ],
    0.12,
    0x4b2a6e,
    { edge: 0xc9a24a },
  );
  g.add(shell);
  const prongU = card(
    [
      [0.3, 0.1],
      [0.66, 0.16],
      [0.62, 0.2],
      [0.28, 0.16],
    ],
    0.05,
    0xc9a24a,
  );
  prongU.position.z = 0.03;
  g.add(prongU);
  const prongD = card(
    [
      [0.3, -0.02],
      [0.64, -0.04],
      [0.6, 0.0],
      [0.28, 0.03],
    ],
    0.05,
    0xc9a24a,
  );
  prongD.position.z = -0.03;
  g.add(prongD);
  const core = gem(0.07, glow(0x9dff4a, 2.6), 0, 'oct');
  core.name = 'core';
  core.position.set(0.22, 0.05, 0);
  g.add(core);
  const handle = card(
    [
      [-0.02, 0.0],
      [0.08, 0.0],
      [0.02, -0.17],
      [-0.08, -0.15],
    ],
    0.08,
    0x3a2054,
  );
  g.add(handle);
  const mag = new THREE.Object3D();
  mag.name = 'mag';
  g.add(mag);
  muzzleMarker(g, 0.62, 0.08);
  return g;
}

function buildSniper(): THREE.Group {
  const g = new THREE.Group();
  const recv = chamfer(0.6, 0.15, 0.1, metalPaper(0x3b4652), 0.25);
  recv.position.set(0.12, 0.04, 0);
  g.add(recv);
  g.add(barrel(0.95, 0.028, 0.42, 0.06, metalPaper(DARK)));
  const brake = box(0.12, 0.07, 0.07, metalPaper(DARK));
  brake.position.set(1.42, 0.06, 0);
  g.add(brake);
  const scope = prism(0.055, 0.055, 0.42, 6, metalPaper(DARK));
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.18, 0.2, 0);
  g.add(scope);
  const lens = box(0.01, 0.07, 0.07, glow(0x9fd8ff, 2.4));
  lens.position.set(0.395, 0.2, 0);
  g.add(lens);
  const stock = card(
    [
      [-0.5, -0.1],
      [-0.16, -0.03],
      [-0.16, 0.11],
      [-0.48, 0.1],
      [-0.52, 0.0],
    ],
    0.08,
    DARK,
  );
  g.add(stock);
  grip(g, 0);
  const mag = chamfer(0.1, 0.14, 0.07, paper(0x2f343a), 0.3);
  mag.name = 'mag';
  mag.position.set(0.25, -0.08, 0);
  g.add(mag);
  muzzleMarker(g, 1.5, 0.06);
  return g;
}

function buildRocket(): THREE.Group {
  const g = new THREE.Group();
  const tube = prism(0.12, 0.12, 1.4, 8, paper(0x5b6650));
  tube.rotation.z = Math.PI / 2;
  tube.position.set(0.3, 0.16, 0);
  g.add(tube);
  const front = prism(0.15, 0.13, 0.16, 8, metalPaper(DARK));
  front.rotation.z = Math.PI / 2;
  front.position.set(0.98, 0.16, 0);
  g.add(front);
  const back = prism(0.13, 0.17, 0.2, 8, metalPaper(DARK));
  back.rotation.z = Math.PI / 2;
  back.position.set(-0.42, 0.16, 0);
  g.add(back);
  const band = prism(0.125, 0.125, 0.1, 8, stripesMat());
  band.rotation.z = Math.PI / 2;
  band.position.set(0.62, 0.16, 0);
  g.add(band);
  const sight = chamfer(0.18, 0.1, 0.06, DARK, 0.3);
  sight.position.set(0.25, 0.33, -0.08);
  g.add(sight);
  const lens = box(0.01, 0.06, 0.05, glow(0xff8a3a, 2.4));
  lens.position.set(0.345, 0.33, -0.08);
  g.add(lens);
  grip(g, 0);
  grip(g, 0.42);
  const mag = gem(0.1, paper(0xb8b0a0), 0, 'oct');
  mag.name = 'mag';
  mag.scale.set(1.6, 0.8, 0.8);
  mag.position.set(1.0, 0.16, 0);
  g.add(mag);
  muzzleMarker(g, 1.06, 0.16);
  return g;
}

let stripeMatCache: THREE.Material | null = null;
function stripesMat(): THREE.Material {
  if (!stripeMatCache) stripeMatCache = paper(0xe8b23a);
  return stripeMatCache;
}

function buildPrism(): THREE.Group {
  const g = new THREE.Group();
  const body = card(
    [
      [-0.2, -0.05],
      [0.3, -0.08],
      [0.55, 0.04],
      [0.3, 0.15],
      [-0.18, 0.12],
    ],
    0.13,
    0x5a2860,
    { edge: 0xe8c860 },
  );
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const c = gem(0.06 + i * 0.015, glow(0xff4fd8, 2.4), 0, 'oct');
    c.scale.set(2.2, 0.7, 0.7);
    c.position.set(0.45 + i * 0.1, 0.04 + (i - 1) * 0.04, 0);
    g.add(c);
  }
  const core = gem(0.06, glow(0xff8fe8, 3), 0, 'ico');
  core.name = 'core';
  core.position.set(0.1, 0.04, 0.07);
  g.add(core);
  grip(g, 0, 0x3a1840);
  const mag = new THREE.Object3D();
  mag.name = 'mag';
  g.add(mag);
  muzzleMarker(g, 0.8, 0.05);
  return g;
}

const builders: Record<string, () => THREE.Group> = {
  ar: buildAR,
  br: buildBR,
  shotgun: buildShotgun,
  ember: buildEmber,
  sniper: buildSniper,
  rocket: buildRocket,
  prism: buildPrism,
};

/** Build a fresh weapon model (meshes share cached geometry/materials). */
export function buildWeaponModel(id: string): THREE.Group {
  const b = builders[id] ?? builders.ar;
  const g = b();
  g.name = 'weapon:' + id;
  return g;
}
