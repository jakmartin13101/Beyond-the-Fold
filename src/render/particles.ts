// GPU-friendly particle systems:
//  - BillboardBatch: instanced camera-facing quads (glows, sparks, smoke, streaks, rings)
//  - DebrisSystem: instanced lit paper scraps with simple physics
//  - ShardBursts: folded glowing polyhedra used by explosions
import * as THREE from 'three';
import { rand } from '../core/math';

export const enum Shape {
  Glow = 0,
  Smoke = 1,
  Ring = 2,
  Spark = 3,
  Hex = 4,
  Star = 5,
}

let atlas: THREE.Texture | null = null;

/** 4x2 atlas: glow, smoke puff, ring, spark, hex, star, (2 spare). */
function particleAtlas(): THREE.Texture {
  if (atlas) return atlas;
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * 4;
  c.height = cell * 2;
  const ctx = c.getContext('2d')!;
  const center = (i: number) => [(i % 4) * cell + cell / 2, Math.floor(i / 4) * cell + cell / 2];
  // 0 glow
  {
    const [x, y] = center(0);
    const g = ctx.createRadialGradient(x, y, 0, x, y, cell / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  // 1 smoke: overlapping paper-like puffs
  {
    const [x, y] = center(1);
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const px = x + (r() - 0.5) * cell * 0.45;
      const py = y + (r() - 0.5) * cell * 0.45;
      const rad = cell * (0.18 + r() * 0.16);
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 2 ring
  {
    const [x, y] = center(2);
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 3 spark (elongated diamond)
  {
    const [x, y] = center(3);
    const g = ctx.createLinearGradient(x - cell / 2, y, x + cell / 2, y);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - cell / 2, y);
    ctx.lineTo(x + cell * 0.3, y - cell * 0.16);
    ctx.lineTo(x + cell / 2, y);
    ctx.lineTo(x + cell * 0.3, y + cell * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  // 4 hex outline (shields)
  {
    const [x, y] = center(4);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath();
      const rr = cell * (ring === 0 ? 0.42 : 0.24);
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  // 5 star flare (muzzle flashes)
  {
    const [x, y] = center(5);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    const n = 5;
    for (let k = 0; k < n * 2; k++) {
      const a = (k / (n * 2)) * Math.PI * 2;
      const rr = k % 2 === 0 ? cell * 0.48 : cell * 0.12;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

const VERT = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iSize;
  attribute vec4 iColor;
  attribute float iRot;
  attribute vec3 iDir;
  attribute float iShape;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    float col = mod(iShape, 4.0);
    float row = floor(iShape / 4.0);
    vUv = vec2((uv.x + col) / 4.0, (uv.y + (1.0 - row)) / 2.0);
    vColor = iColor;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec2 corner = position.xy;
    if (dot(iDir, iDir) > 0.0) {
      vec3 dv = (modelViewMatrix * vec4(iDir, 0.0)).xyz;
      vec2 d = normalize(dv.xy + vec2(1e-5, 0.0));
      vec2 n = vec2(-d.y, d.x);
      mvPosition.xy += d * corner.x * iSize.y + n * corner.y * iSize.x;
    } else {
      float c = cos(iRot);
      float s = sin(iRot);
      vec2 r = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
      mvPosition.xy += r * iSize;
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.003) discard;
    #include <fog_fragment>
  }
`;

export interface Billboard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  drag: number;
  life: number;
  age: number;
  size0: number;
  size1: number;
  /** Stretch length for streaks (0 = round). */
  len: number;
  r: number;
  g: number;
  b: number;
  a0: number;
  a1: number;
  /** End colour (lerped). */
  r1: number;
  g1: number;
  b1: number;
  rot: number;
  vrot: number;
  shape: number;
  stretch: boolean;
  aspect: number;
}

export class BillboardBatch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private size: Float32Array;
  private color: Float32Array;
  private rot: Float32Array;
  private dir: Float32Array;
  private shape: Float32Array;
  private items: Billboard[] = [];
  private pool: Billboard[] = [];
  /** Per-frame immediate quads (projectiles etc). */
  private immediate = 0;
  readonly max: number;

  constructor(max: number, additive: boolean) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max * 2);
    this.color = new Float32Array(max * 4);
    this.rot = new Float32Array(max);
    this.dir = new Float32Array(max * 3);
    this.shape = new Float32Array(max);
    const mk = (arr: Float32Array, n: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('iPos', mk(this.pos, 3));
    geo.setAttribute('iSize', mk(this.size, 2));
    geo.setAttribute('iColor', mk(this.color, 4));
    geo.setAttribute('iRot', mk(this.rot, 1));
    geo.setAttribute('iDir', mk(this.dir, 3));
    geo.setAttribute('iShape', mk(this.shape, 1));
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: particleAtlas() } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 10 : 5;
  }

  get count(): number {
    return this.items.length;
  }

  spawn(p: Partial<Billboard>): Billboard | null {
    if (this.items.length >= this.max - 64) return null;
    const b = this.pool.pop() ?? ({} as Billboard);
    b.x = p.x ?? 0;
    b.y = p.y ?? 0;
    b.z = p.z ?? 0;
    b.vx = p.vx ?? 0;
    b.vy = p.vy ?? 0;
    b.vz = p.vz ?? 0;
    b.ax = p.ax ?? 0;
    b.ay = p.ay ?? 0;
    b.drag = p.drag ?? 0;
    b.life = p.life ?? 1;
    b.age = 0;
    b.size0 = p.size0 ?? 0.5;
    b.size1 = p.size1 ?? b.size0;
    b.len = p.len ?? 0;
    b.r = p.r ?? 1;
    b.g = p.g ?? 1;
    b.b = p.b ?? 1;
    b.r1 = p.r1 ?? b.r;
    b.g1 = p.g1 ?? b.g;
    b.b1 = p.b1 ?? b.b;
    b.a0 = p.a0 ?? 1;
    b.a1 = p.a1 ?? 0;
    b.rot = p.rot ?? 0;
    b.vrot = p.vrot ?? 0;
    b.shape = p.shape ?? Shape.Glow;
    b.stretch = p.stretch ?? false;
    b.aspect = p.aspect ?? 1;
    this.items.push(b);
    return b;
  }

  update(dt: number): void {
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      b.age += dt;
      if (b.age >= b.life) {
        this.pool.push(b);
        continue;
      }
      if (b.drag) {
        const f = Math.exp(-b.drag * dt);
        b.vx *= f;
        b.vy *= f;
        b.vz *= f;
      }
      b.vx += b.ax * dt;
      b.vy += b.ay * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.rot += b.vrot * dt;
      items[w++] = b;
    }
    items.length = w;
  }

  /** Write particles + immediate quads into GPU buffers. Call once per frame after pushes. */
  flush(): void {
    let n = this.immediate;
    for (const b of this.items) {
      if (n >= this.max) break;
      const t = b.age / b.life;
      const s = b.size0 + (b.size1 - b.size0) * t;
      const a = b.a0 + (b.a1 - b.a0) * t;
      this.pos[n * 3] = b.x;
      this.pos[n * 3 + 1] = b.y;
      this.pos[n * 3 + 2] = b.z;
      this.color[n * 4] = b.r + (b.r1 - b.r) * t;
      this.color[n * 4 + 1] = b.g + (b.g1 - b.g) * t;
      this.color[n * 4 + 2] = b.b + (b.b1 - b.b) * t;
      this.color[n * 4 + 3] = Math.max(0, a);
      this.rot[n] = b.rot;
      this.shape[n] = b.shape;
      if (b.stretch) {
        const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
        this.size[n * 2] = s;
        this.size[n * 2 + 1] = Math.max(s, b.len * (0.3 + (sp / 30) * 0.7));
        this.dir[n * 3] = b.vx / sp;
        this.dir[n * 3 + 1] = b.vy / sp;
        this.dir[n * 3 + 2] = b.vz / sp;
      } else {
        this.size[n * 2] = s * b.aspect;
        this.size[n * 2 + 1] = s;
        this.dir[n * 3] = this.dir[n * 3 + 1] = this.dir[n * 3 + 2] = 0;
      }
      n++;
    }
    this.geo.instanceCount = n;
    for (const name of ['iPos', 'iSize', 'iColor', 'iRot', 'iDir', 'iShape']) {
      const attr = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      attr.needsUpdate = true;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
    }
    this.immediate = 0;
  }

  /** Draw a quad for this frame only (projectiles, beams, laser sights). */
  quad(
    x: number,
    y: number,
    z: number,
    width: number,
    length: number,
    dx: number,
    dy: number,
    r: number,
    g: number,
    b: number,
    a: number,
    shape: number = Shape.Glow,
  ): void {
    const n = this.immediate;
    if (n >= this.max - 1) return;
    this.immediate++;
    this.pos[n * 3] = x;
    this.pos[n * 3 + 1] = y;
    this.pos[n * 3 + 2] = z;
    this.color[n * 4] = r;
    this.color[n * 4 + 1] = g;
    this.color[n * 4 + 2] = b;
    this.color[n * 4 + 3] = a;
    this.rot[n] = 0;
    this.shape[n] = shape;
    if (length > 0) {
      const l = Math.hypot(dx, dy) || 1;
      this.size[n * 2] = width;
      this.size[n * 2 + 1] = length;
      this.dir[n * 3] = dx / l;
      this.dir[n * 3 + 1] = dy / l;
      this.dir[n * 3 + 2] = 0;
    } else {
      this.size[n * 2] = width;
      this.size[n * 2 + 1] = width;
      this.dir[n * 3] = this.dir[n * 3 + 1] = this.dir[n * 3 + 2] = 0;
    }
  }

  clear(): void {
    for (const b of this.items) this.pool.push(b);
    this.items.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Paper debris: lit instanced scraps
// ---------------------------------------------------------------------------

interface Scrap {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  s: number;
  life: number;
  age: number;
  ground: number;
  rest: boolean;
  flutter: number;
}

export class DebrisSystem {
  readonly mesh: THREE.InstancedMesh;
  private scraps: Scrap[] = [];
  private colorIdx: number[] = [];
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  readonly max: number;
  groundAt: (x: number, y: number, z: number) => number | null = () => null;

  constructor(max: number, material: THREE.Material) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    // A slightly folded paper scrap: two triangles bent along a crease.
    const v = new Float32Array([-0.5, -0.35, 0, 0.5, -0.3, 0.08, 0.05, 0.4, 0, 0.5, -0.3, 0.08, 0.45, 0.35, -0.1, 0.05, 0.4, 0]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    const colors = new Float32Array(max * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life = 2.5, flutter = 0.5): void {
    if (this.scraps.length >= this.max) {
      // Recycle the oldest.
      this.scraps.shift();
      this.colorIdx.shift();
    }
    const ground = this.groundAt(x, y + 0.5, z);
    this.scraps.push({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      rx: rand(0, 6),
      ry: rand(0, 6),
      rz: rand(0, 6),
      wx: rand(-14, 14),
      wy: rand(-14, 14),
      wz: rand(-14, 14),
      s: size,
      life,
      age: 0,
      ground: ground ?? -1000,
      rest: false,
      flutter,
    });
    this.colorIdx.push(color);
  }

  update(dt: number): void {
    const list = this.scraps;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      s.age += dt;
      if (s.age >= s.life) continue;
      if (!s.rest) {
        // Paper flutters: strong drag, gentle sway.
        const drag = Math.exp(-(1.2 + s.flutter * 2.5) * dt);
        s.vx *= drag;
        s.vz *= drag;
        s.vy -= 22 * dt * (1 - s.flutter * 0.55);
        s.vy = Math.max(s.vy, -9 + s.flutter * 6);
        s.vx += Math.sin(s.age * 7 + s.rx) * s.flutter * 4 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.rx += s.wx * dt;
        s.ry += s.wy * dt;
        s.rz += s.wz * dt;
        if (s.y <= s.ground + 0.02) {
          s.y = s.ground + 0.02;
          if (Math.abs(s.vy) < 3) {
            s.rest = true;
            s.rx = -Math.PI / 2 + rand(-0.2, 0.2);
            s.rz = rand(-0.2, 0.2);
          } else {
            s.vy = -s.vy * 0.25;
            s.vx *= 0.5;
          }
        }
      }
      list[w] = s;
      this.colorIdx[w] = this.colorIdx[i];
      w++;
    }
    list.length = w;
    this.colorIdx.length = w;
    const m = this.mesh;
    const tmp = this.tmp;
    for (let i = 0; i < w; i++) {
      const s = list[i];
      const fade = Math.min(1, (s.life - s.age) / 0.6);
      tmp.position.set(s.x, s.y, s.z);
      tmp.rotation.set(s.rx, s.ry, s.rz);
      tmp.scale.setScalar(s.s * fade);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      this.col.setHex(this.colorIdx[i]);
      m.setColorAt(i, this.col);
    }
    m.count = w;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.scraps.length = 0;
    this.colorIdx.length = 0;
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Folded shard bursts for explosions
// ---------------------------------------------------------------------------

interface Shard {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: THREE.Vector3;
  life: number;
  age: number;
  s0: number;
  s1: number;
}

export class ShardBursts {
  readonly group = new THREE.Group();
  private shards: Shard[] = [];
  private pool: THREE.Mesh[] = [];
  private geos: THREE.BufferGeometry[];
  private mats = new Map<number, THREE.MeshBasicMaterial>();

  constructor() {
    this.geos = [new THREE.OctahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 0)];
  }

  private mat(color: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      this.mats.set(color, m);
    }
    return m;
  }

  burst(x: number, y: number, z: number, radius: number, colors: number[], count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = this.pool.pop() ?? new THREE.Mesh(this.geos[i % 3]);
      mesh.geometry = this.geos[i % 3];
      mesh.material = this.mat(colors[i % colors.length]).clone();
      mesh.position.set(x, y, z);
      mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 1.4) * radius * 2.4;
      const s0 = radius * rand(0.12, 0.3);
      mesh.scale.setScalar(s0);
      this.group.add(mesh);
      this.shards.push({
        mesh,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.8 + radius,
        vz: rand(-0.6, 0.6) * sp * 0.4,
        spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        life: rand(0.35, 0.65),
        age: 0,
        s0,
        s1: s0 * rand(1.6, 2.6),
      });
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.group.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.pool.push(s.mesh);
        continue;
      }
      const t = s.age / s.life;
      const f = Math.exp(-4 * dt);
      s.vx *= f;
      s.vy = s.vy * f - 6 * dt;
      s.vz *= f;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      s.mesh.scale.setScalar(s.s0 + (s.s1 - s.s0) * Math.sqrt(t));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * (1 - t);
      this.shards[w++] = s;
    }
    this.shards.length = w;
  }

  clear(): void {
    for (const s of this.shards) {
      this.group.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    this.shards.length = 0;
  }
}
