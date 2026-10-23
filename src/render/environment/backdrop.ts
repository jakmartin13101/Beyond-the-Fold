// Atmospheric backdrop: gradient sky, layered-paper ringed gas giant and moon, paper stars,
// a Thren carrier hanging in orbit, the distant alien megastructure on the horizon,
// folded-paper mountain ranges, drifting paper clouds and the glowing abyss of the chasm.
import * as THREE from 'three';
import { Rng } from '../../core/math';
import type { LevelData } from '../../game/types';
import { card, edgeColor, glow, paper, shade } from '../paper';

export interface Backdrop {
  group: THREE.Group;
  /** Layers that follow the camera partially (manual parallax for sky elements). */
  update(camX: number, camY: number, time: number): void;
  /** Reveal the awakened megastructure in the finale. */
  awaken(k: number): void;
}

function skyTexture(top: number, mid: number, horizon: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.addColorStop(0, hex(top));
  g.addColorStop(0.42, hex(mid));
  g.addColorStop(0.72, hex(horizon));
  g.addColorStop(1, hex(shade(horizon, -0.25)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function planetTexture(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  // Layered paper bands with hard edges and tiny drop shadows.
  const bands = ['#2f8f86', '#3aa7a0', '#7fd6c4', '#e8dcc0', '#3aa7a0', '#26706c', '#5fc2b2', '#2f8f86', '#1f5c5a'];
  const r = new Rng(21);
  let y = 0;
  for (let i = 0; i < bands.length; i++) {
    const h = (s / bands.length) * r.range(0.7, 1.3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, y + 4);
    for (let x = 0; x <= s; x += 32) ctx.lineTo(x, y + 4 + Math.sin(x * 0.02 + i) * 6);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.fill();
    ctx.fillStyle = bands[i];
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 6);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.fill();
    y += h;
  }
  // Storm spot.
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.ellipse(s * 0.62, s * 0.58, 40, 18, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9714a';
  ctx.beginPath();
  ctx.ellipse(s * 0.62, s * 0.58, 26, 10, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Night-side crescent (a darker paper layer laid over).
  ctx.fillStyle = 'rgba(20,10,40,0.62)';
  ctx.beginPath();
  ctx.arc(s / 2 - s * 0.22, s / 2 + s * 0.08, s / 2, 0, Math.PI * 2);
  ctx.rect(s, 0, -s, s);
  ctx.fill('evenodd');
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,240,220,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 3, -1.2, 1.0);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 8;
  const ctx = c.getContext('2d')!;
  const r = new Rng(4);
  let x = 0;
  while (x < 512) {
    const w = r.range(8, 40);
    const a = r.range(0.25, 0.85);
    ctx.fillStyle = `rgba(${Math.floor(r.range(200, 240))},${Math.floor(r.range(190, 225))},${Math.floor(r.range(170, 200))},${a})`;
    ctx.fillRect(x, 0, w, 8);
    x += w + r.range(0, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const rr = k % 2 === 0 ? 30 : 7;
    const x = 32 + Math.cos(a) * rr;
    const y = 32 + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

/** Folded paper mountain range: silhouette plus darker shadow-side facets. */
function mountainLayer(x0: number, x1: number, z: number, baseY: number, height: number, color: number, seed: number, step: number): THREE.Group {
  const g = new THREE.Group();
  const r = new Rng(seed);
  const pts: Array<[number, number]> = [[x0, baseY - 30]];
  const peaks: Array<[number, number, number, number]> = [];
  let x = x0;
  let prevValley: [number, number] = [x0, baseY + height * 0.3];
  pts.push(prevValley);
  while (x < x1) {
    const w = step * r.range(0.6, 1.4);
    const px = x + w * r.range(0.35, 0.65);
    const py = baseY + height * r.range(0.45, 1);
    const vx = x + w;
    const vy = baseY + height * r.range(0.1, 0.4);
    pts.push([px, py], [vx, vy]);
    peaks.push([px, py, vx, vy]);
    prevValley = [vx, vy];
    x = vx;
  }
  pts.push([x, baseY - 30]);
  const body = card(pts, 1.2, color, { edge: edgeColor(color, 0.35), shadow: false });
  body.castShadow = false;
  body.position.z = z;
  g.add(body);
  // Shadow-side facets give each peak a creased, folded look.
  const dark = shade(color, -0.22);
  const mat = paper(dark);
  for (const [px, py, vx, vy] of peaks) {
    const tri = new THREE.Shape();
    tri.moveTo(px, py);
    tri.lineTo(vx, vy);
    tri.lineTo(px + (vx - px) * 0.25, baseY - 2);
    tri.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), mat);
    m.position.z = z + 0.62;
    g.add(m);
  }
  return g;
}

function cloud(r: Rng, color: number, scale: number): THREE.Mesh {
  const pts: Array<[number, number]> = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * 10;
    const y = Math.sin(t * Math.PI) * r.range(1.4, 2.8) + (i % 2 ? r.range(0.3, 0.9) : 0);
    pts.push([x, y]);
  }
  pts.push([5, -0.2], [-5, -0.2]);
  const m = card(pts, 0.25, color, { edge: 0xfff4e8, shadow: false });
  m.castShadow = false;
  m.scale.setScalar(scale);
  return m;
}

export function buildBackdrop(level: LevelData, scene: THREE.Scene): Backdrop {
  const th = level.theme;
  const group = new THREE.Group();
  scene.background = skyTexture(th.skyTop, th.skyMid, th.skyHorizon);
  scene.fog = new THREE.Fog(th.fog, 24, 330);

  // --- Sky layer that tracks the camera (celestial bodies are effectively at infinity).
  const sky = new THREE.Group();
  sky.userData.noBatch = true;
  group.add(sky);
  const planetMat = new THREE.MeshBasicMaterial({ map: planetTexture(), transparent: true, fog: false });
  const planet = new THREE.Mesh(new THREE.CircleGeometry(70, 64), planetMat);
  planet.position.set(-60, 120, -620);
  sky.add(planet);
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(90, 150, 96, 1);
  // Map the 1D band texture radially.
  const pos = ringGeo.attributes.position as THREE.BufferAttribute;
  const uv = ringGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const rr = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (rr - 90) / 60, 0.5);
  }
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(planet.position).add(new THREE.Vector3(0, 0, 2));
  ring.rotation.set(-1.15, 0.25, 0.32);
  sky.add(ring);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xe8dcc0, fog: false }));
  moon.position.set(110, 150, -600);
  sky.add(moon);
  const moonShade = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0x2a1a44, transparent: true, opacity: 0.7, fog: false }));
  moonShade.position.set(113, 151, -599);
  sky.add(moonShade);
  // Stars.
  const r = new Rng(8);
  const starPos: number[] = [];
  for (let i = 0; i < 260; i++) starPos.push(r.range(-520, 520), r.range(90, 320), -640);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 4.5, map: starTexture(), transparent: true, depthWrite: false, fog: false, color: 0xfff2d8, sizeAttenuation: true }),
  );
  sky.add(stars);

  // Thren carrier: a vast angular hull with glowing ports.
  const carrier = new THREE.Group();
  const hull = card(
    [
      [-60, 0],
      [40, -6],
      [70, 2],
      [30, 12],
      [-20, 16],
      [-70, 8],
    ],
    6,
    0x2a1a3e,
    { edge: 0x4a3060, shadow: false },
  );
  carrier.add(hull);
  const fin = card(
    [
      [-30, 14],
      [10, 15],
      [-10, 30],
    ],
    2,
    0x22142f,
    { shadow: false },
  );
  carrier.add(fin);
  for (let i = 0; i < 24; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), glow(i % 5 === 0 ? 0x9dff4a : 0xffb36b, 2.2, { fog: false }));
    p.position.set(r.range(-55, 55), r.range(1, 10), 3.2);
    carrier.add(p);
  }
  const engine = new THREE.Mesh(new THREE.CircleGeometry(4, 6), glow(0x9dff4a, 2.5, { fog: false }));
  engine.position.set(-68, 6, 3.2);
  carrier.add(engine);
  carrier.position.set(140, 95, -360);
  carrier.rotation.z = -0.05;
  carrier.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (m && !Array.isArray(m)) (m as THREE.MeshBasicMaterial).fog = false;
  });
  sky.add(carrier);

  // --- The Crease: folded megastructure on the eastern horizon.
  const crease = new THREE.Group();
  crease.userData.noBatch = true;
  const seamMats: THREE.MeshBasicMaterial[] = [];
  const spires: Array<[number, number, number]> = [
    [0, 110, 18],
    [-26, 70, 12],
    [24, 82, 13],
    [-48, 40, 9],
    [46, 48, 9],
  ];
  for (const [sx, h, w] of spires) {
    const sp = card(
      [
        [-w, 0],
        [w, 0],
        [w * 0.25, h * 0.7],
        [0, h],
        [-w * 0.3, h * 0.65],
      ],
      w * 0.6,
      0x3a2a58,
      { edge: 0x6a5a90, shadow: false },
    );
    sp.position.x = sx;
    crease.add(sp);
    const half = new THREE.Shape();
    half.moveTo(0, 0);
    half.lineTo(w, 0);
    half.lineTo(w * 0.25, h * 0.7);
    half.lineTo(0, h);
    half.closePath();
    const shadowFace = new THREE.Mesh(new THREE.ShapeGeometry(half), paper(0x261a3c));
    shadowFace.position.set(sx, 0, w * 0.3 + 0.05);
    crease.add(shadowFace);
    const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff2ff).multiplyScalar(1.2), fog: false, transparent: true, opacity: 0.85 });
    seamMats.push(seamMat);
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.8, h * 0.95), seamMat);
    seam.position.set(sx, h * 0.47, w * 0.3 + 0.1);
    crease.add(seam);
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(38, 42, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff2ff).multiplyScalar(1.4), fog: false, transparent: true, opacity: 0.5 }));
  halo.position.set(0, 75, -4);
  crease.add(halo);
  const beamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x9ff8ff).multiplyScalar(2.5),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(26, 600), beamMat);
  beam.position.set(0, 300, 2);
  crease.add(beam);
  // Unfolding petals revealed in the finale.
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const pm = card(
      [
        [0, 0],
        [46, 12],
        [88, 0],
        [46, -12],
      ],
      1,
      i % 2 ? 0x6a5aa0 : 0x4a3a78,
      { edge: 0x9ff8ff, shadow: false },
    );
    pm.position.set(0, 120, 0);
    pm.rotation.z = (i / 10) * Math.PI * 2;
    pm.scale.setScalar(0.001);
    crease.add(pm);
    petals.push(pm);
  }
  const pulseMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x9ff8ff).multiplyScalar(2),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 6), pulseMat);
  pulse.position.set(0, 120, 1);
  crease.add(pulse);
  crease.position.set(0, -6, -300);
  crease.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (m && !Array.isArray(m)) (m as THREE.MeshStandardMaterial).fog = false;
    else if (Array.isArray(m)) m.forEach((mm) => ((mm as THREE.MeshStandardMaterial).fog = false));
  });
  group.add(crease);

  // --- Mountain ranges (true perspective parallax).
  const minX = level.bounds.minX - 260;
  const maxX = level.bounds.maxX + 300;
  group.add(mountainLayer(minX, maxX, -240, -6, 46, 0x6d4a86, 31, 70));
  group.add(mountainLayer(minX, maxX, -170, -8, 34, 0x5a3a78, 32, 50));
  group.add(mountainLayer(minX + 60, maxX - 60, -110, -10, 24, 0x4a2e66, 33, 34));
  group.add(mountainLayer(level.bounds.minX - 140, level.bounds.maxX + 140, -60, -10, 14, 0x3a2456, 34, 20));
  group.add(mountainLayer(level.bounds.minX - 90, level.bounds.maxX + 90, -34, -14, 15, 0x2e1c46, 35, 9));

  // --- Paper clouds.
  const clouds = new THREE.Group();
  clouds.userData.noBatch = true;
  for (let i = 0; i < 18; i++) {
    const c = cloud(r, r.chance(0.5) ? 0xf2c9b8 : 0xd9a8c8, r.range(1.6, 3.6));
    c.position.set(r.range(minX + 100, maxX - 100), r.range(28, 70), r.range(-200, -90));
    clouds.add(c);
  }
  group.add(clouds);

  // --- Chasm abyss glow.
  for (const ch of level.chasms) {
    const w = ch.x1 - ch.x0 + 10;
    const abyssMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x3ff2c8).multiplyScalar(1.4),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const abyss = new THREE.Mesh(new THREE.PlaneGeometry(w, 18), abyssMat);
    abyss.position.set((ch.x0 + ch.x1) / 2, -16, -12);
    group.add(abyss);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), glow(0x1a6a6a, 1.2));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((ch.x0 + ch.x1) / 2, -18, -10);
    group.add(floor);
    // Distant cliff walls of the chasm.
    const wall = mountainLayer(ch.x0 - 6, ch.x1 + 6, -26, -24, 18, 0x2e1f48, 51, 6);
    group.add(wall);
  }

  let awakened = 0;
  return {
    group,
    update(camX: number, camY: number, time: number) {
      sky.position.x = camX * 0.97;
      sky.position.y = camY * 0.6;
      crease.position.x = 360 + (camX - 360) * 0.72;
      carrier.position.x = 140 + Math.sin(time * 0.02) * 6 - camX * 0.04;
      clouds.position.x = (time * 0.6) % 200;
      halo.rotation.z = time * 0.05;
      for (let i = 0; i < seamMats.length; i++) seamMats[i].opacity = 0.55 + 0.3 * Math.sin(time * 1.3 + i) + awakened * 0.3;
      for (let i = 0; i < petals.length; i++) {
        const k = Math.max(0, Math.min(1, awakened * 1.4 - i * 0.05));
        petals[i].scale.setScalar(0.001 + k);
        petals[i].rotation.z = (i / 10) * Math.PI * 2 + time * 0.05 * awakened;
      }
      beamMat.opacity = awakened * (0.6 + Math.sin(time * 8) * 0.1);
      const pk = (time * 0.35) % 1;
      pulse.scale.setScalar(20 + pk * 260);
      pulseMat.opacity = awakened * (1 - pk) * 0.8;
      halo.scale.setScalar(1 + awakened * 1.5);
    },
    awaken(k: number) {
      awakened = k;
    },
  };
}
