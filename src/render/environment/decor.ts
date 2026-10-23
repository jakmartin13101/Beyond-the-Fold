// Decorative set dressing: folded-paper trees, alien flora, crystals, wreckage, military
// structures and foreground silhouettes. Pure presentation (no collision).
import * as THREE from 'three';
import { Rng } from '../../core/math';
import type { DecorDef } from '../../game/types';
import { Pt, box, card, chamfer, edgeColor, foldedRockGeo, gem, glow, labelTexture, metalPaper, paper, prism, shade, stripes } from '../paper';
import { buildDropship } from '../models/props';

export interface DecorInstance {
  obj: THREE.Object3D;
  def: DecorDef;
  /** Light emitted by this decor (fires, lamps, crystals). */
  light?: { color: number; intensity: number; distance: number; y: number; flicker: number };
  /** Emitters (fire/smoke). */
  emitter?: 'fire' | 'smoke';
  /** Foreground pieces fade when overlapping the player. */
  fade?: THREE.Material[];
  sway?: number;
}

const TEAL = [0x2f8f86, 0x247a78, 0x3aa7a0, 0x1f6a6e, 0x2d6f8f];
const MAGENTA = [0xc4508c, 0xa83a7a, 0xd96aa0, 0x8e3a8a];

function treePine(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const trunk = prism(0.12, 0.2, 2.2, 5, paper(0x4a3040));
  trunk.position.y = 1.1;
  g.add(trunk);
  const tiers = r.int(3, 5);
  const col = r.pick(TEAL);
  for (let i = 0; i < tiers; i++) {
    const rad = 1.5 - i * 0.28;
    const c = prism(0.02, rad, 1.5, r.int(5, 7), paper(shade(col, i * 0.06)));
    c.position.y = 1.6 + i * 0.85;
    c.rotation.y = r.range(0, 3);
    g.add(c);
    // Cream underside ring: the visible cut edge of the folded cone.
    const rim = prism(rad, rad * 1.02, 0.06, 7, paper(edgeColor(col, 0.5)));
    rim.position.y = 0.85 + i * 0.85;
    g.add(rim);
  }
  return g;
}

function treeFan(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = r.range(3.5, 5.5);
  const trunk = prism(0.1, 0.18, h, 5, paper(0x5a3a50));
  trunk.position.y = h / 2;
  trunk.rotation.z = r.range(-0.08, 0.08);
  g.add(trunk);
  const col = r.pick(MAGENTA);
  const leaves = r.int(6, 9);
  for (let i = 0; i < leaves; i++) {
    const a = -0.3 + (i / (leaves - 1)) * (Math.PI + 0.6);
    const len = r.range(1.6, 2.4);
    const leaf = card(
      [
        [0, 0],
        [len * 0.5, 0.28],
        [len, 0],
        [len * 0.5, -0.18],
      ],
      0.04,
      shade(col, r.range(-0.1, 0.1)),
    );
    leaf.position.set(0, h, 0);
    leaf.rotation.set(r.range(-0.4, 0.4), r.range(-0.6, 0.6), a);
    g.add(leaf);
  }
  const pod = gem(0.22, glow(0xffb36b, 2), 0, 'oct');
  pod.position.y = h - 0.3;
  g.add(pod);
  return g;
}

function flower(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = r.range(2.2, 3.6);
  const stem = prism(0.06, 0.1, h, 5, paper(0x2a6a5a));
  stem.position.y = h / 2;
  g.add(stem);
  const head = new THREE.Group();
  head.position.y = h;
  head.rotation.x = r.range(-0.3, 0.1);
  g.add(head);
  const petals = r.int(5, 7);
  const col = r.chance(0.5) ? r.pick(MAGENTA) : 0xf2c94a;
  for (let i = 0; i < petals; i++) {
    const p = card(
      [
        [0, 0],
        [0.7, 0.32],
        [1.25, 0],
        [0.7, -0.32],
      ],
      0.04,
      shade(col, (i % 2) * 0.12),
    );
    p.rotation.z = (i / petals) * Math.PI * 2;
    p.rotation.x = 0.35;
    head.add(p);
  }
  const center = gem(0.28, glow(0xfff0a0, 1.8), 0, 'ico');
  head.add(center);
  for (const side of [1, -1]) {
    const leaf = card(
      [
        [0, 0],
        [0.6, 0.2],
        [1.1, 0.05],
        [0.5, -0.1],
      ],
      0.03,
      0x2f8f86,
    );
    leaf.position.y = h * 0.35;
    leaf.rotation.set(0, side > 0 ? 0 : Math.PI, 0.4);
    g.add(leaf);
  }
  return g;
}

function bulbPlant(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const n = r.int(2, 4);
  const col = r.chance(0.5) ? 0x5ff2d0 : 0xff6fe0;
  for (let i = 0; i < n; i++) {
    const h = r.range(0.6, 1.4);
    const s = prism(0.025, 0.04, h, 4, paper(0x2a5a4a));
    s.position.set(r.range(-0.3, 0.3), h / 2, r.range(-0.2, 0.2));
    s.rotation.z = r.range(-0.3, 0.3);
    g.add(s);
    const b = gem(r.range(0.1, 0.18), glow(col, 2.2), 0, 'oct');
    b.position.set(s.position.x - Math.sin(s.rotation.z) * h * 0.5, h, s.position.z);
    g.add(b);
  }
  return g;
}

function fern(r: Rng, dark: boolean): THREE.Group {
  const g = new THREE.Group();
  const n = r.int(5, 8);
  const col = dark ? 0x140c1e : r.pick(TEAL);
  for (let i = 0; i < n; i++) {
    const len = r.range(0.9, 1.6);
    const pts: Pt[] = [[0, 0]];
    const segs = 5;
    for (let k = 1; k <= segs; k++) pts.push([(len * k) / segs, 0.1 + Math.sin((k / segs) * Math.PI) * 0.16 + (k % 2 ? 0.08 : 0)]);
    for (let k = segs; k >= 1; k--) pts.push([(len * k) / segs - 0.05, -0.05 - (k % 2 ? 0.06 : 0)]);
    const leaf = card(pts, 0.03, dark ? col : shade(col, r.range(-0.1, 0.1)), { edge: dark ? 0x2a1a34 : undefined, shadow: !dark });
    leaf.rotation.z = 0.4 + (i / (n - 1)) * 2.3;
    leaf.rotation.y = r.range(-0.6, 0.6);
    g.add(leaf);
  }
  return g;
}

function grass(r: Rng, dark: boolean): THREE.Group {
  const g = new THREE.Group();
  const n = r.int(6, 11);
  const col = dark ? 0x120a1a : r.pick(TEAL);
  const pts: Pt[] = [[-0.6, 0]];
  for (let i = 0; i < n; i++) {
    const x = -0.6 + (1.2 * (i + 0.5)) / n;
    pts.push([x - 0.03, r.range(0.35, 0.9)], [x + 0.06, 0.05]);
  }
  pts.push([0.6, 0]);
  const m = card(pts, 0.04, dark ? col : shade(col, 0.05), { edge: dark ? 0x1a1022 : undefined, shadow: !dark });
  g.add(m);
  return g;
}

function rockPile(r: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < r.int(3, 5); i++) {
    const s = r.range(0.4, 1.1);
    const m = new THREE.Mesh(foldedRockGeo(s, s * 0.8, s, r.int(0, 999), 1, 0.35), paper(shade(0x6c5a80, r.range(-0.15, 0.1))));
    m.position.set(r.range(-1, 1), s * 0.35, r.range(-0.5, 0.5));
    m.rotation.y = r.range(0, 3);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

function crystal(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const col = r.chance(0.6) ? 0x5ff2d0 : 0xff6fe0;
  for (let i = 0; i < r.int(3, 6); i++) {
    const c = gem(r.range(0.15, 0.32), paper(col, { emissive: col, emissiveIntensity: 0.9, rough: 0.35, textured: false }), 0, 'oct');
    c.scale.y = r.range(2.2, 4);
    c.position.set(r.range(-0.4, 0.4), c.scale.y * 0.18, r.range(-0.3, 0.3));
    c.rotation.set(r.range(-0.4, 0.4), r.range(0, 3), r.range(-0.4, 0.4));
    g.add(c);
  }
  return g;
}

function wreckPiece(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const pts: Pt[] = [
    [-1.2, 0],
    [1.3, 0],
    [1.1, 0.8],
    [0.2, 1.4],
    [-0.9, 1.0],
  ];
  const m = card(pts, 1.1, r.chance(0.5) ? 0x5d6f7c : 0x343c44, { metal: true });
  g.add(m);
  const st = box(1.4, 0.14, 0.04, paper(0xe8772e));
  st.position.set(0, 0.6, 0.56);
  st.rotation.z = 0.2;
  g.add(st);
  const char = box(0.8, 0.5, 0.03, paper(0x1a1414));
  char.position.set(0.4, 0.9, 0.56);
  char.rotation.z = -0.3;
  g.add(char);
  return g;
}

function tower(): THREE.Group {
  // Watchtower whose deck aligns with the level's tower platform (top at y=6).
  const g = new THREE.Group();
  const legH = 4.8;
  for (const x of [-1.9, 1.9]) {
    for (const z of [-1.0, -3.0]) {
      const leg = box(0.22, legH, 0.22, metalPaper(0x4a4f55, 0.5, 0.4));
      leg.position.set(x, legH / 2, z);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const cabin = chamfer(4.6, 1.6, 2.6, metalPaper(0x5a6050, 0.6, 0.35), 0.15);
  cabin.position.set(0, legH + 0.8, -2.2);
  g.add(cabin);
  const roof = card(
    [
      [-2.6, 0],
      [2.6, 0],
      [2.2, 0.5],
      [-2.2, 0.5],
    ],
    3,
    0x3a3f45,
    { metal: true },
  );
  roof.position.set(0, legH + 1.6, -2.2);
  g.add(roof);
  const win = box(3.4, 0.5, 0.05, glow(0xffc070, 1.4));
  win.position.set(0, legH + 0.95, -0.88);
  g.add(win);
  const st = box(4.6, 0.2, 0.05, stripes());
  st.position.set(0, legH + 0.15, -0.88);
  g.add(st);
  const light = gem(0.18, glow(0xff3020, 3), 0, 'oct');
  light.position.set(1.8, legH + 2.2, -2.2);
  g.add(light);
  return g;
}

function wall(r: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const w = card(
      [
        [0, 0],
        [6, 0],
        [6, 4.2],
        [0.4, 4.6],
      ],
      1.0,
      0x6a6e66,
      { metal: true },
    );
    w.position.set(side < 0 ? -9.5 : 3.5, 0, 0);
    if (side < 0) w.rotation.y = 0;
    g.add(w);
    const st = box(6, 0.3, 1.02, stripes());
    st.position.set(side < 0 ? -6.5 : 6.5, 3.6, 0);
    g.add(st);
  }
  const arch = card(
    [
      [-3.5, 4.0],
      [3.5, 4.0],
      [3.5, 5.0],
      [-3.5, 5.0],
    ],
    1.0,
    0x50544c,
    { metal: true },
  );
  g.add(arch);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 0.8),
    new THREE.MeshBasicMaterial({ map: labelTexture('HALDEN PERIMETER · AUTHORIZED ONLY', '#f2e6c0', '#2a2e2a', 512, 80, 'bold 30px "Chakra Petch", sans-serif') }),
  );
  sign.position.set(0, 4.5, 0.52);
  g.add(sign);
  void r;
  return g;
}

function hangar(): THREE.Group {
  const g = new THREE.Group();
  const body = card(
    [
      [-9, 0],
      [9, 0],
      [9, 7],
      [6, 9.5],
      [-6, 9.5],
      [-9, 7],
    ],
    10,
    0x5a6058,
    { metal: true },
  );
  g.add(body);
  const door = box(10, 6.5, 0.1, metalPaper(0x2a2e30, 0.6, 0.4));
  door.name = 'door';
  door.position.set(0, 3.25, 5.06);
  g.add(door);
  const st = box(10.4, 0.4, 0.12, stripes());
  st.position.set(0, 6.7, 5.06);
  g.add(st);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshBasicMaterial({ map: labelTexture('H-3', '#f2e6c0', 'rgba(0,0,0,0)', 256, 128, 'bold 90px "Chakra Petch", sans-serif'), transparent: true }));
  num.position.set(-6.5, 7.8, 5.06);
  g.add(num);
  for (const x of [-7.5, 7.5]) {
    const l = gem(0.25, glow(0xff3020, 3), 0, 'oct');
    l.position.set(x, 9.6, 4);
    g.add(l);
  }
  return g;
}

function antenna(): THREE.Group {
  const g = new THREE.Group();
  const mast = prism(0.08, 0.2, 9, 4, metalPaper(0x4a4f55, 0.5, 0.4));
  mast.position.y = 4.5;
  g.add(mast);
  for (let i = 0; i < 3; i++) {
    const bar = box(1.6 - i * 0.4, 0.08, 0.08, metalPaper(0x4a4f55));
    bar.position.y = 6 + i * 1.2;
    g.add(bar);
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8, 1, true), paper(0xd8d4c8, { side: THREE.DoubleSide }));
  dish.position.set(0.6, 7.5, 0.4);
  dish.rotation.set(0.3, 0, -1.2);
  g.add(dish);
  const light = gem(0.12, glow(0xff3020, 3), 0, 'oct');
  light.position.y = 9.1;
  g.add(light);
  return g;
}

function pylon(): THREE.Group {
  const g = new THREE.Group();
  const p = box(0.25, 2.6, 0.25, metalPaper(0x4a4f55, 0.5, 0.4));
  p.position.y = 1.3;
  g.add(p);
  return g;
}

function fence(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const post = box(0.12, 2.2, 0.12, metalPaper(0x3a3f45));
    post.position.set(i * 2.2, 1.1, 0);
    g.add(post);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.8, 12, 4), new THREE.MeshBasicMaterial({ color: 0x3a3f45, wireframe: true }));
  mesh.position.set(3.3, 1.2, 0);
  g.add(mesh);
  return g;
}

function sign(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const post = box(0.1, 1.6, 0.1, metalPaper(0x3a3f45));
  post.position.y = 0.8;
  g.add(post);
  const txt = r.pick(['HALDEN STN 2.1 KM', 'RESTRICTED · SUBLEVEL ACCESS', 'SURVEY GRID 7', 'CAUTION: SHALE']);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5),
    new THREE.MeshStandardMaterial({ map: labelTexture(txt, '#1a1a1a', '#e8dcc0', 384, 96, 'bold 30px "Chakra Petch", sans-serif'), roughness: 0.9 }),
  );
  plate.position.y = 1.5;
  g.add(plate);
  const back = box(1.64, 0.54, 0.04, paper(0x3a3f45));
  back.position.set(0, 1.5, -0.03);
  g.add(back);
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  const post = prism(0.06, 0.1, 4, 5, metalPaper(0x3a3f45));
  post.position.y = 2;
  g.add(post);
  const arm = box(0.8, 0.08, 0.08, metalPaper(0x3a3f45));
  arm.position.set(0.35, 3.95, 0);
  g.add(arm);
  const head = chamfer(0.4, 0.16, 0.3, 0x2a2e30, 0.3);
  head.position.set(0.7, 3.88, 0);
  g.add(head);
  const bulb = box(0.3, 0.04, 0.22, glow(0xffd8a0, 3));
  bulb.position.set(0.7, 3.79, 0);
  g.add(bulb);
  return g;
}

function vines(r: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const len = r.range(3, 8);
    const v = card(
      [
        [-0.06, 0],
        [0.06, 0],
        [0.03, -len],
        [-0.03, -len],
      ],
      0.03,
      0x120a1a,
      { edge: 0x1a1022, shadow: false },
    );
    v.position.set(r.range(-3, 3), 0, r.range(-0.3, 0.3));
    g.add(v);
    for (let k = 0; k < 4; k++) {
      const leaf = card(
        [
          [0, 0],
          [0.3, 0.1],
          [0.5, 0],
          [0.3, -0.1],
        ],
        0.02,
        0x120a1a,
        { edge: 0x1a1022, shadow: false },
      );
      leaf.position.set(v.position.x, -r.range(0.5, len), v.position.z);
      leaf.rotation.z = r.range(-2, 2);
      g.add(leaf);
    }
  }
  return g;
}

function stalactite(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(foldedRockGeo(4, 1, 3, r.int(0, 999), 2, 0.2), paper(0x5a4a70));
  g.add(top);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 6, 1), paper(0x3b2d4f));
  cone.rotation.x = Math.PI;
  cone.position.y = -2.4;
  g.add(cone);
  const cap = box(4, 0.15, 3, paper(0x2f8f86));
  cap.position.y = 0.55;
  g.add(cap);
  return g;
}

function bridgeRuin(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    const seg = chamfer(2.4, 1.0, 2, 0x5a4a70, 0.3);
    seg.position.set(Math.cos(a) * -10, Math.sin(a) * 6, 0);
    seg.rotation.z = a + Math.PI / 2;
    g.add(seg);
    if (i % 2 === 0) {
      const seam = box(2.2, 0.08, 0.05, glow(0x5ff2ff, 1.6));
      seam.position.copy(seg.position).add(new THREE.Vector3(0, 0, 1.02));
      seam.rotation.z = seg.rotation.z;
      g.add(seam);
    }
  }
  return g;
}

function container(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = chamfer(6, 2.6, 2.4, metalPaper(color, 0.6, 0.3), 0.06);
  body.position.y = 1.3;
  g.add(body);
  for (let i = 0; i < 9; i++) {
    const rib = box(0.08, 2.5, 2.44, metalPaper(shade(color, -0.15)));
    rib.position.set(-2.6 + i * 0.65, 1.3, 0);
    g.add(rib);
  }
  return g;
}

function monolith(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = r.range(6, 9);
  const m = card(
    [
      [-1, 0],
      [1, 0],
      [0.6, h * 0.8],
      [0, h],
      [-0.7, h * 0.75],
    ],
    1.4,
    0x3a2a58,
    { edge: 0x6a5a90 },
  );
  g.add(m);
  const seam = box(0.12, h * 0.85, 0.05, glow(0x5ff2ff, 1.8));
  seam.position.set(0, h * 0.45, 0.72);
  g.add(seam);
  for (let i = 0; i < 3; i++) {
    const glyph = box(0.5, 0.08, 0.05, glow(0x5ff2ff, 1.6));
    glyph.position.set(r.range(-0.4, 0.4), h * (0.2 + i * 0.2), 0.73);
    glyph.rotation.z = r.range(-0.8, 0.8);
    g.add(glyph);
  }
  return g;
}

function pipe(): THREE.Group {
  const g = new THREE.Group();
  const p = prism(0.5, 0.5, 14, 8, metalPaper(0x6a5a4a, 0.5, 0.4));
  p.rotation.z = Math.PI / 2;
  p.position.y = 1.4;
  g.add(p);
  for (const x of [-5, 0, 5]) {
    const s = box(0.3, 1.2, 0.8, metalPaper(0x3a3f45));
    s.position.set(x, 0.6, 0);
    g.add(s);
  }
  return g;
}

function girder(): THREE.Group {
  const g = new THREE.Group();
  const beam = box(14, 0.6, 0.4, paper(0x120a1a));
  g.add(beam);
  for (let i = 0; i < 8; i++) {
    const brace = box(1.6, 0.12, 0.3, paper(0x120a1a));
    brace.position.set(-6 + i * 1.7, -0.5, 0);
    brace.rotation.z = i % 2 ? 0.6 : -0.6;
    g.add(brace);
  }
  const bottom = box(14, 0.3, 0.4, paper(0x120a1a));
  bottom.position.y = -1;
  g.add(bottom);
  return g;
}

export function buildDecor(d: DecorDef): DecorInstance {
  const r = new Rng(d.seed ?? Math.floor(d.x * 13 + d.z * 7));
  let obj: THREE.Object3D;
  const inst: DecorInstance = { obj: new THREE.Group(), def: d };
  switch (d.type) {
    case 'treePine':
      obj = treePine(r);
      inst.sway = 0.02;
      break;
    case 'treeFan':
      obj = treeFan(r);
      inst.sway = 0.03;
      break;
    case 'flower':
      obj = flower(r);
      inst.sway = 0.04;
      break;
    case 'bulbPlant':
      obj = bulbPlant(r);
      break;
    case 'fern':
      obj = fern(r, !!d.foreground);
      inst.sway = 0.05;
      break;
    case 'grass':
      obj = grass(r, !!d.foreground);
      inst.sway = 0.06;
      break;
    case 'rockPile':
      obj = rockPile(r);
      break;
    case 'crystal':
      obj = crystal(r);
      inst.light = { color: 0x5ff2d0, intensity: 3, distance: 6, y: 1, flicker: 0.1 };
      break;
    case 'wreck': {
      const ship = buildDropship(true);
      ship.rotation.z = -0.18;
      ship.rotation.y = 0.35;
      ship.position.y = 1.2;
      obj = new THREE.Group();
      obj.add(ship);
      break;
    }
    case 'wreckPiece':
      obj = wreckPiece(r);
      break;
    case 'fire':
      obj = new THREE.Group();
      inst.emitter = 'fire';
      inst.light = { color: 0xff8a3a, intensity: 14, distance: 9, y: 0.5, flicker: 0.4 };
      break;
    case 'smoke':
      obj = new THREE.Group();
      inst.emitter = 'smoke';
      break;
    case 'tower':
      obj = tower();
      break;
    case 'wall':
      obj = wall(r);
      break;
    case 'hangar':
      obj = hangar();
      break;
    case 'antenna':
      obj = antenna();
      break;
    case 'pylon':
      obj = pylon();
      break;
    case 'fence':
      obj = fence();
      break;
    case 'sign':
      obj = sign(r);
      break;
    case 'lamp':
      obj = lamp();
      inst.light = { color: 0xffd8a0, intensity: 10, distance: 9, y: 3.6, flicker: 0.02 };
      break;
    case 'vines':
      obj = vines(r);
      inst.sway = 0.03;
      break;
    case 'stalactite':
      obj = stalactite(r);
      break;
    case 'bridgeRuin':
      obj = bridgeRuin();
      break;
    case 'container':
      obj = container(d.color ?? 0x6a7d5a);
      break;
    case 'monolith':
      obj = monolith(r);
      break;
    case 'pipe':
      obj = pipe();
      break;
    case 'girder':
      obj = girder();
      break;
    default:
      obj = new THREE.Group();
  }
  obj.position.set(d.x, d.y, d.z);
  obj.scale.setScalar(d.scale ?? 1);
  if (d.flip) obj.scale.x *= -1;
  if (d.rot) obj.rotation.z = d.rot;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !d.foreground && d.z > -14;
      m.receiveShadow = !d.foreground;
    }
  });
  if (d.foreground) {
    // Unique fading materials so foreground pieces can turn translucent near the player.
    const mats: THREE.Material[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const cloned = src.map((s) => {
        const c = s.clone();
        c.transparent = true;
        mats.push(c);
        return c;
      });
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
    });
    inst.fade = mats;
  }
  inst.obj = obj;
  return inst;
}
