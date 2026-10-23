// Papercraft material and geometry toolkit. Everything visible in the world is built from
// these helpers: cardstock extrusions with cream cut edges, faceted folded prisms,
// paper-grain textures, metallic paper panels and glowing inks.
import * as THREE from 'three';
import { Rng } from '../core/math';

let fiberTex: THREE.Texture | null = null;
let bumpTex: THREE.Texture | null = null;
let panelTex: THREE.Texture | null = null;
let stripeTex: THREE.Texture | null = null;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** Paper fibre texture: subtle mottling with fine fibres; multiplies material colour. */
export function paperFiber(): THREE.Texture {
  if (fiberTex) return fiberTex;
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const rng = new Rng(77);
  // Value noise base.
  const grid = 32;
  const vals: number[] = [];
  for (let i = 0; i < (grid + 1) * (grid + 1); i++) vals.push(rng.next());
  const at = (gx: number, gy: number) => vals[(gy % grid) * (grid + 1) + (gx % grid)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * grid;
      const fy = (y / size) * grid;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const v = at(ix, iy) * (1 - sx) * (1 - sy) + at(ix + 1, iy) * sx * (1 - sy) + at(ix, iy + 1) * (1 - sx) * sy + at(ix + 1, iy + 1) * sx * sy;
      const n = 236 + v * 16 + (rng.next() - 0.5) * 10;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Fibres.
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 1400; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const a = rng.range(0, Math.PI * 2);
    const l = rng.range(4, 18);
    ctx.strokeStyle = rng.chance(0.5) ? '#ffffff' : '#9a948a';
    ctx.lineWidth = rng.range(0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(0.35, 0.35);
  fiberTex = t;
  return t;
}

export function paperBump(): THREE.Texture {
  if (bumpTex) return bumpTex;
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  const rng = new Rng(91);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(rng.range(90, 170));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 3));
  }
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = rng.chance(0.5) ? '#c8c8c8' : '#404040';
    ctx.beginPath();
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-10, 10), y + rng.range(-10, 10));
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.6, 0.6);
  bumpTex = t;
  return t;
}

/** Riveted panel texture for metallic cardstock (outpost, machines). */
export function panelTexture(): THREE.Texture {
  if (panelTex) return panelTex;
  const size = 256;
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#e9e9e9';
  ctx.fillRect(0, 0, size, size);
  const rng = new Rng(5);
  for (let i = 0; i < 2000; i++) {
    const v = Math.floor(rng.range(215, 250));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 6), 1);
  }
  ctx.strokeStyle = 'rgba(60,60,60,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(70,70,70,0.6)';
  for (const [x, y] of [
    [10, 10],
    [size - 10, 10],
    [10, size - 10],
    [size - 10, size - 10],
    [10, size / 2 - 8],
    [size - 10, size / 2 - 8],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(0.5, 0.5);
  panelTex = t;
  return t;
}

/** Diagonal hazard stripes. */
export function stripeTexture(): THREE.Texture {
  if (stripeTex) return stripeTex;
  const size = 128;
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#f2b632';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#26221e';
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 16 - size, size);
    ctx.lineTo(i - size, size);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1.5, 1.5);
  stripeTex = t;
  return t;
}

/** Stencilled label texture (crate markings, signage). */
export function labelTexture(text: string, fg = '#2a2a2a', bg = 'rgba(0,0,0,0)', w = 256, h = 128, font = 'bold 64px "Chakra Petch", sans-serif'): THREE.Texture {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const matCache = new Map<string, THREE.Material>();

export interface PaperOpts {
  rough?: number;
  metal?: number;
  side?: THREE.Side;
  bump?: number;
  textured?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  fog?: boolean;
  transparent?: boolean;
  opacity?: number;
  flat?: boolean;
}

/** Matte paper material (cached per colour/options). */
export function paper(color: number, o: PaperOpts = {}): THREE.MeshStandardMaterial {
  const key = `p${color}|${o.rough ?? 0.9}|${o.metal ?? 0}|${o.side ?? 0}|${o.bump ?? 1}|${o.textured ?? true}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 0}|${o.fog ?? true}|${o.opacity ?? 1}|${o.flat ?? true}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.9,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? true,
      side: o.side ?? THREE.FrontSide,
      map: o.textured === false ? null : paperFiber(),
      bumpMap: o.textured === false ? null : paperBump(),
      bumpScale: 0.6 * (o.bump ?? 1),
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 0,
      fog: o.fog ?? true,
      transparent: o.transparent ?? (o.opacity !== undefined && o.opacity < 1),
      opacity: o.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

/** Metallic cardstock (foil-laminated paper). */
export function metalPaper(color: number, rough = 0.55, metal = 0.35): THREE.MeshStandardMaterial {
  const key = `m${color}|${rough}|${metal}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      flatShading: true,
      map: panelTexture(),
      bumpMap: paperBump(),
      bumpScale: 0.4,
    });
    matCache.set(key, m);
  }
  return m;
}

export function stripes(): THREE.MeshStandardMaterial {
  const key = 'stripes';
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.8, flatShading: true });
    matCache.set(key, m);
  }
  return m;
}

/** Self-lit ink that blooms (HDR colour). */
export function glow(color: number, strength = 2.5, o: { transparent?: boolean; opacity?: number; additive?: boolean; side?: THREE.Side; fog?: boolean } = {}): THREE.MeshBasicMaterial {
  const key = `g${color}|${strength}|${o.transparent ?? false}|${o.opacity ?? 1}|${o.additive ?? false}|${o.side ?? 0}|${o.fog ?? true}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    const c = new THREE.Color(color).multiplyScalar(strength);
    m = new THREE.MeshBasicMaterial({
      color: c,
      transparent: o.transparent ?? o.additive ?? false,
      opacity: o.opacity ?? 1,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !(o.additive ?? false),
      side: o.side ?? THREE.FrontSide,
      fog: o.fog ?? true,
      toneMapped: true,
    });
    matCache.set(key, m);
  }
  return m;
}

/** Lighter "cut edge" colour for a cardstock face colour. */
export function edgeColor(color: number, amount = 0.55): number {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color(0xf3ead8), amount);
  return c.getHex();
}

export function shade(color: number, f: number): number {
  const c = new THREE.Color(color);
  if (f >= 0) c.lerp(new THREE.Color(0xffffff), f);
  else c.multiplyScalar(1 + f);
  return c.getHex();
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Pt = [number, number];

const geoCache = new Map<string, THREE.BufferGeometry>();

function shapeFrom(points: Pt[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/** Extruded cardstock shape centred on z. Material group 0 = faces, 1 = cut edges. */
export function cardGeo(points: Pt[], depth: number, key?: string): THREE.BufferGeometry {
  if (key && geoCache.has(key)) return geoCache.get(key)!;
  const g = new THREE.ExtrudeGeometry(shapeFrom(points), { depth, bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  if (key) geoCache.set(key, g);
  return g;
}

/** Cardstock mesh with coloured faces and lighter cut edges. */
export function card(points: Pt[], depth: number, color: number, o: { edge?: number; key?: string; metal?: boolean; mat?: THREE.Material; shadow?: boolean } = {}): THREE.Mesh {
  const g = cardGeo(points, depth, o.key);
  const face = o.mat ?? (o.metal ? metalPaper(color) : paper(color));
  const edge = paper(o.edge ?? edgeColor(color), { bump: 0.5 });
  const m = new THREE.Mesh(g, [face, edge]);
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = true;
  return m;
}

/** Octagonal-profile box: reads like a folded paper block. */
export function chamferGeo(w: number, h: number, d: number, c = 0.18): THREE.BufferGeometry {
  const key = `ch${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${c}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const cw = Math.min(w, h) * c;
  const hw = w / 2;
  const hh = h / 2;
  const pts: Pt[] = [
    [-hw + cw, -hh],
    [hw - cw, -hh],
    [hw, -hh + cw],
    [hw, hh - cw],
    [hw - cw, hh],
    [-hw + cw, hh],
    [-hw, hh - cw],
    [-hw, -hh + cw],
  ];
  const g = cardGeo(pts, d);
  geoCache.set(key, g);
  return g;
}

export function chamfer(w: number, h: number, d: number, color: number | THREE.Material, c = 0.18, edge?: number): THREE.Mesh {
  const g = chamferGeo(w, h, d, c);
  const face = typeof color === 'number' ? paper(color) : color;
  const ec = typeof color === 'number' ? (edge ?? shade(color, -0.12)) : (edge ?? 0xd8d0c0);
  const m = new THREE.Mesh(g, [face, typeof color === 'number' ? paper(ec) : face]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Faceted prism (low radial segments) — folded paper tubes and cones. */
export function prism(rTop: number, rBot: number, h: number, sides: number, mat: THREE.Material, open = false): THREE.Mesh {
  const key = `pr${rTop}|${rBot}|${h}|${sides}|${open}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, h, sides, 1, open);
    geoCache.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[]): THREE.Mesh {
  const key = `bx${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function gem(r: number, mat: THREE.Material, detail = 0, kind: 'ico' | 'oct' | 'tet' | 'dod' = 'ico'): THREE.Mesh {
  const key = `gm${r}|${detail}|${kind}`;
  let g = geoCache.get(key);
  if (!g) {
    g =
      kind === 'oct'
        ? new THREE.OctahedronGeometry(r, detail)
        : kind === 'tet'
          ? new THREE.TetrahedronGeometry(r, detail)
          : kind === 'dod'
            ? new THREE.DodecahedronGeometry(r, detail)
            : new THREE.IcosahedronGeometry(r, detail);
    geoCache.set(key, g);
  }
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A folded rock: jittered box with flat facets. */
export function foldedRockGeo(w: number, h: number, d: number, seed: number, segs = 2, jitter = 0.22): THREE.BufferGeometry {
  const key = `rk${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${seed}|${segs}|${jitter}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const rng = new Rng(seed);
  const base = new THREE.BoxGeometry(w, h, d, segs, segs, 1);
  const pos = base.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let off = seen.get(k);
    if (!off) {
      // Keep the top face flat-ish so it sits flush with walkable surfaces.
      const top = y > h / 2 - 1e-3;
      off = [rng.range(-1, 1) * w * jitter * 0.3, top ? rng.range(-0.02, 0.02) : rng.range(-1, 1) * h * jitter * 0.3, rng.range(-1, 1) * d * jitter * 0.4];
      seen.set(k, off);
    }
    pos.setXYZ(i, x + off[0], y + off[1], z + off[2]);
  }
  const g = base.toNonIndexed();
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/** Thin outline for readability against busy backgrounds. */
export function outline(mesh: THREE.Mesh, color = 0x140c1c, opacity = 0.45, threshold = 35): THREE.LineSegments {
  const key = `ol${mesh.geometry.uuid}|${threshold}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.EdgesGeometry(mesh.geometry, threshold);
    geoCache.set(key, g);
  }
  const mk = `ol${color}|${opacity}`;
  let m = matCache.get(mk) as THREE.LineBasicMaterial | undefined;
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    matCache.set(mk, m);
  }
  const l = new THREE.LineSegments(g, m);
  l.raycast = () => {};
  mesh.add(l);
  return l;
}

/** Utility: set shadow flags on a whole hierarchy. */
export function shadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

/** A soft round sprite texture used by glows. */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
