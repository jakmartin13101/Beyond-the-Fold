// Builds the walkable world from level collision data: layered cardstock ground with cut-paper
// grass fringes, folded rock cliffs, floating shale islands, catwalks, concrete yards and
// metal buildings. Visual tops always match collision tops so the player reads them instantly.
import * as THREE from 'three';
import { Rng } from '../../core/math';
import type { LevelData, SolidDef } from '../../game/types';
import { LANE_BACK, LANE_FRONT } from '../../game/types';
import { Pt, box, card, chamfer, edgeColor, foldedRockGeo, gem, glow, metalPaper, paper, prism, shade, stripes, wbox } from '../paper';

function zRange(lanes: number): [number, number] {
  if (lanes === LANE_FRONT) return [-1.45, 1.35];
  if (lanes === LANE_BACK) return [-4.75, -1.65];
  return [-4.9, 1.45];
}

/** Zig-zag cut paper fringe along the front edge of a grassy surface. */
function grassFringe(x0: number, x1: number, y: number, z: number, color: number, r: Rng): THREE.Mesh {
  const pts: Pt[] = [[x0, y + 0.06]];
  let x = x0;
  while (x < x1) {
    const w = r.range(0.18, 0.42);
    const nx = Math.min(x1, x + w);
    pts.push([x + (nx - x) * 0.5, y - r.range(0.18, 0.42)]);
    pts.push([nx, y - r.range(0.02, 0.08)]);
    x = nx;
  }
  pts.push([x1, y + 0.06]);
  const m = card(pts, 0.05, color, { edge: edgeColor(color, 0.3) });
  m.position.z = z;
  return m;
}

function strata(x0: number, x1: number, top: number, bottom: number, z0: number, z1: number, colors: number[], r: Rng, g: THREE.Group): void {
  // Horizontal paper layers stacked down the cliff face, each slightly proud of the one below.
  let y = top;
  let i = 0;
  while (y > bottom) {
    const h = Math.min(y - bottom, r.range(0.9, 2.2));
    const pts: Pt[] = [];
    const n = Math.max(2, Math.floor((x1 - x0) / 1.6));
    pts.push([x0, y]);
    pts.push([x1, y]);
    // Ragged bottom edge.
    for (let k = n; k >= 0; k--) {
      const xx = x0 + ((x1 - x0) * k) / n;
      pts.push([xx, y - h + r.range(-0.15, 0.15)]);
    }
    const c = colors[i % colors.length];
    const m = card(pts, 0.12, c, { edge: edgeColor(c, 0.35) });
    m.position.z = z1 + 0.02 + (i % 2) * 0.05;
    m.receiveShadow = true;
    g.add(m);
    y -= h;
    i++;
  }
  // Main body behind the strata.
  const body = new THREE.Mesh(wbox(x1 - x0, top - bottom, z1 - z0), paper(colors[colors.length - 1]));
  body.position.set((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2);
  body.receiveShadow = true;
  g.add(body);
}

function buildGround(s: SolidDef, level: LevelData, r: Rng, g: THREE.Group): void {
  const th = level.theme;
  const [z0, z1] = zRange(s.lanes);
  const top = s.y + s.h;
  const x0 = s.x;
  const x1 = s.x + s.w;
  // Top surface: grass card with lane-path tint.
  const slab = new THREE.Mesh(wbox(x1 - x0, 0.3, z1 - z0 + 0.2), [
    paper(shade(th.grass, -0.1)),
    paper(shade(th.grass, -0.1)),
    paper(th.grass),
    paper(th.grass),
    paper(shade(th.grass, -0.05)),
    paper(shade(th.grass, -0.05)),
  ]);
  slab.position.set((x0 + x1) / 2, top - 0.15, (z0 + z1) / 2 + 0.1);
  slab.receiveShadow = true;
  g.add(slab);
  // Walked dirt paths along each lane.
  for (const lz of [0, -3.2]) {
    if (lz > z1 || lz < z0) continue;
    const path = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 1.3), paper(shade(th.grass, -0.22)));
    path.rotation.x = -Math.PI / 2;
    path.position.set((x0 + x1) / 2, top + 0.005, lz);
    path.receiveShadow = true;
    g.add(path);
  }
  g.add(grassFringe(x0 - 0.05, x1 + 0.05, top - 0.02, z1 + 0.22, shade(th.grass, 0.08), r));
  strata(x0, x1, top - 0.3, s.y, z0, z1, [th.soil, shade(th.soil, -0.12), shade(th.rock, -0.2), shade(th.soil, -0.25)], r, g);
  // Pebbles & paper tufts scattered on top.
  for (let x = x0 + 0.5; x < x1 - 0.5; x += r.range(1.2, 3)) {
    if (r.chance(0.5)) {
      const peb = new THREE.Mesh(foldedRockGeo(r.range(0.2, 0.45), r.range(0.12, 0.25), r.range(0.2, 0.4), r.int(0, 999), 1, 0.4), paper(shade(th.rock, r.range(-0.1, 0.15))));
      peb.position.set(x, top + 0.05, r.chance(0.5) ? r.range(0.7, 1.2) : r.range(-2.2, -1.2));
      peb.castShadow = true;
      g.add(peb);
    }
  }
}

function buildRock(s: SolidDef, level: LevelData, r: Rng, g: THREE.Group, floating: boolean): void {
  const th = level.theme;
  const [z0, z1] = zRange(s.lanes);
  const top = s.y + s.h;
  const w = s.w;
  const d = z1 - z0;
  const cx = s.x + w / 2;
  const cz = (z0 + z1) / 2;
  if (!floating) {
    const rock = new THREE.Mesh(foldedRockGeo(w, s.h, d, r.int(0, 9999), Math.max(2, Math.round(w / 1.2)), 0.18), [paper(th.rock)]);
    rock.position.set(cx, s.y + s.h / 2, cz);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
    const cap = new THREE.Mesh(wbox(w + 0.05, 0.12, d + 0.05), paper(shade(th.grass, -0.05)));
    cap.position.set(cx, top - 0.05, cz);
    cap.receiveShadow = true;
    g.add(cap);
    return;
  }
  // Floating shale island: grassy slab with a faceted underside and hanging crystals.
  const slabH = Math.min(0.7, s.h);
  const slab = new THREE.Mesh(foldedRockGeo(w, slabH, d, r.int(0, 9999), Math.max(2, Math.round(w / 1.4)), 0.12), [paper(th.rock)]);
  slab.position.set(cx, top - slabH / 2, cz);
  slab.castShadow = true;
  slab.receiveShadow = true;
  g.add(slab);
  const grass = new THREE.Mesh(wbox(w + 0.04, 0.1, d + 0.04), paper(th.grass));
  grass.position.set(cx, top - 0.04, cz);
  grass.receiveShadow = true;
  g.add(grass);
  g.add(grassFringe(s.x - 0.04, s.x + w + 0.04, top - 0.03, z1 + 0.04, shade(th.grass, 0.08), r));
  if (s.h > 1.5 || !s.oneWay) {
    const depth = Math.max(2.5, s.h + 2);
    const cone = new THREE.ConeGeometry(Math.min(w, d) * 0.62, depth, 6, 2);
    // Jitter the cone for a folded look.
    const pos = cone.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) < depth / 2 - 0.01) pos.setXYZ(i, pos.getX(i) * r.range(0.85, 1.15), pos.getY(i), pos.getZ(i) * r.range(0.85, 1.15));
    }
    const coneGeo = cone.toNonIndexed();
    coneGeo.computeVertexNormals();
    const under = new THREE.Mesh(coneGeo, paper(th.rockDark));
    under.scale.x = w / Math.min(w, d);
    under.rotation.x = Math.PI;
    under.position.set(cx, top - slabH - depth / 2 + 0.05, cz);
    under.castShadow = true;
    g.add(under);
    for (let i = 0; i < 2; i++) {
      const c = gem(r.range(0.15, 0.3), glow(r.chance(0.5) ? 0x5ff2d0 : 0xff6fe0, 2), 0, 'oct');
      c.scale.y = 2.4;
      c.position.set(cx + r.range(-w * 0.3, w * 0.3), top - slabH - r.range(0.6, 1.6), z1 - 0.2);
      g.add(c);
    }
  } else {
    // Thin ledges get a few hanging roots.
    for (let i = 0; i < Math.floor(w / 1.5); i++) {
      const root = prism(0.02, 0.05, r.range(0.6, 1.4), 4, paper(shade(th.grass, -0.3)));
      root.position.set(s.x + 0.5 + i * 1.5 + r.range(0, 0.6), top - slabH - 0.4, z1 - 0.1);
      g.add(root);
    }
  }
}

function buildCliff(s: SolidDef, level: LevelData, r: Rng, g: THREE.Group): void {
  const th = level.theme;
  const [z0, z1] = zRange(s.lanes);
  const rock = new THREE.Mesh(foldedRockGeo(s.w, s.h, z1 - z0 + 4, r.int(0, 9999), 4, 0.2), [paper(shade(th.rock, -0.1))]);
  rock.position.set(s.x + s.w / 2, s.y + s.h / 2, (z0 + z1) / 2 - 1);
  rock.castShadow = true;
  rock.receiveShadow = true;
  g.add(rock);
  const cap = new THREE.Mesh(wbox(s.w, 0.3, z1 - z0 + 4), paper(th.grass));
  cap.position.set(s.x + s.w / 2, s.y + s.h - 0.1, (z0 + z1) / 2 - 1);
  g.add(cap);
}

function buildCatwalk(s: SolidDef, level: LevelData, g: THREE.Group, solids: SolidDef[]): void {
  void level;
  const [z0, z1] = zRange(s.lanes);
  const top = s.y + s.h;
  const d = z1 - z0 - 0.8;
  const cz = (z0 + z1) / 2;
  const deck = new THREE.Mesh(wbox(s.w, 0.16, d), metalPaper(0x5a6068, 0.5, 0.45));
  deck.position.set(s.x + s.w / 2, top - 0.08, cz);
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);
  const edge = box(s.w, 0.14, 0.06, stripes());
  edge.position.set(s.x + s.w / 2, top - 0.12, cz + d / 2 + 0.03);
  g.add(edge);
  // Back railing only, so the front stays readable.
  const rail = box(s.w, 0.05, 0.05, metalPaper(0x3a3f45));
  rail.position.set(s.x + s.w / 2, top + 0.9, cz - d / 2 + 0.05);
  g.add(rail);
  for (let x = s.x + 0.2; x <= s.x + s.w - 0.1; x += 1.4) {
    const post = box(0.06, 0.9, 0.06, metalPaper(0x3a3f45));
    post.position.set(x, top + 0.45, cz - d / 2 + 0.05);
    g.add(post);
  }
  // Support legs down to the ground below.
  let ground = -10;
  for (const o of solids) {
    if (o === s || o.oneWay) continue;
    if (s.x + 0.5 >= o.x && s.x + 0.5 <= o.x + o.w && o.y + o.h <= top - 0.5) ground = Math.max(ground, o.y + o.h);
  }
  const legH = top - ground;
  if (legH > 0.5 && legH < 12) {
    for (const x of [s.x + 0.3, s.x + s.w - 0.3]) {
      for (const z of [cz - d / 2 + 0.15, cz + d / 2 - 0.15]) {
        const leg = box(0.16, legH, 0.16, metalPaper(0x4a4f55, 0.5, 0.4));
        leg.position.set(x, ground + legH / 2, z);
        leg.castShadow = true;
        g.add(leg);
      }
    }
    const brace = box(s.w - 0.6, 0.1, 0.08, metalPaper(0x4a4f55));
    brace.position.set(s.x + s.w / 2, ground + legH * 0.45, cz - d / 2 + 0.15);
    brace.rotation.z = Math.atan2(legH * 0.6, s.w) * 0.6;
    g.add(brace);
  }
}

function buildConcrete(s: SolidDef, level: LevelData, r: Rng, g: THREE.Group): void {
  const th = level.theme;
  const [z0, z1] = zRange(s.lanes);
  const top = s.y + s.h;
  for (let x = s.x; x < s.x + s.w; x += 4) {
    const w = Math.min(4, s.x + s.w - x);
    const slab = new THREE.Mesh(wbox(w - 0.06, 0.3, z1 - z0 + 0.2), paper(r.chance(0.5) ? 0x8a8478 : 0x7e786e));
    slab.position.set(x + w / 2, top - 0.15, (z0 + z1) / 2 + 0.1);
    slab.receiveShadow = true;
    g.add(slab);
  }
  for (const lz of [0.75, -3.95]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(s.w, 0.12), paper(0xf2b632));
    line.rotation.x = -Math.PI / 2;
    line.position.set(s.x + s.w / 2, top + 0.006, lz);
    g.add(line);
  }
  strata(s.x, s.x + s.w, top - 0.3, s.y, z0, z1, [0x6e685e, 0x5e584e, shade(th.soil, -0.2)], r, g);
}

function buildMetalWall(s: SolidDef, g: THREE.Group): void {
  const [z0, z1] = zRange(s.lanes);
  const wall = new THREE.Mesh(wbox(s.w, s.h, z1 - z0 + 6), metalPaper(0x5a6068, 0.6, 0.35));
  wall.position.set(s.x + s.w / 2, s.y + s.h / 2, (z0 + z1) / 2 - 2);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);
  // Hangar door frame facing the arena.
  const frame = chamfer(1.0, 11, 7, metalPaper(0x3a3f45, 0.5, 0.4), 0.1);
  frame.position.set(s.x + 0.2, s.y + s.h - 6, -1.6);
  g.add(frame);
  const st = box(0.3, 1.0, 7.2, stripes());
  st.position.set(s.x - 0.25, s.y + s.h - 11.2, -1.6);
  g.add(st);
}

function buildHull(s: SolidDef, g: THREE.Group, r: Rng): void {
  const [z0, z1] = zRange(s.lanes);
  const m = card(
    [
      [s.x, s.y],
      [s.x + s.w, s.y],
      [s.x + s.w - 0.2, s.y + s.h],
      [s.x + 0.4, s.y + s.h + 0.1],
    ],
    z1 - z0 - 0.6,
    0x5d6f7c,
    { metal: true },
  );
  m.position.z = (z0 + z1) / 2;
  m.rotation.z = r.range(-0.02, 0.02);
  g.add(m);
  const st = box(s.w * 0.6, 0.16, 0.04, paper(0xe8772e));
  st.position.set(s.x + s.w / 2, s.y + s.h * 0.6, z1 - 0.29);
  g.add(st);
}

export function buildTerrain(level: LevelData): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(4242);
  for (const s of level.solids) {
    if (s.crumble) continue;
    switch (s.style) {
      case 'ground':
        buildGround(s, level, r, g);
        break;
      case 'rock':
        buildRock(s, level, r, g, false);
        break;
      case 'floating':
        buildRock(s, level, r, g, true);
        break;
      case 'cliff':
        buildCliff(s, level, r, g);
        break;
      case 'catwalk':
        buildCatwalk(s, level, g, level.solids);
        break;
      case 'concrete':
        buildConcrete(s, level, r, g);
        break;
      case 'metal':
        buildMetalWall(s, g);
        break;
      case 'hull':
      case 'wreck':
        buildHull(s, g, r);
        break;
    }
  }
  return g;
}
