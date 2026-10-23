// Enemy papercraft sculptures with procedural animation:
//  - ThrenModel: digitigrade alien infantry (Skirmisher) and the shield-bearing Bulwark
//  - RavagerModel: hulking berserker with bone plates and blade arms
//  - DroneModel: corrupted Halden "Watchdog" security drone
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../../core/math';
import type { Enemy } from '../../game/enemy';
import type { Bulwark } from '../../game/enemies/bulwark';
import type { Drone } from '../../game/enemies/drone';
import type { Ravager } from '../../game/enemies/ravager';
import { box, card, chamfer, gem, glow, metalPaper, outline, paper, prism, shade } from '../paper';

export interface EnemyModel {
  root: THREE.Group;
  update(e: Enemy, dt: number): void;
  parts(): THREE.Mesh[];
  /** Additional glow intensity for telegraphs (0..1). */
  telegraph: number;
  dispose(): void;
}

const VIEW_TURN = 0.45;
const FORESHORTEN = Math.cos(VIEW_TURN);

function shieldShell(color: number, sx: number, sy: number, y: number): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.8),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
  mesh.scale.set(sx, sy, sx);
  mesh.position.y = y;
  return { mesh, mat };
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as THREE.Material & { wireframe?: boolean }).wireframe) out.push(m);
  });
  return out;
}

function aimToLocal(aim: number, facing: number): number {
  const local = facing > 0 ? aim : Math.PI - aim;
  const w = Math.atan2(Math.sin(local), Math.cos(local));
  return Math.atan2(Math.sin(w) * FORESHORTEN, Math.cos(w));
}

// ---------------------------------------------------------------------------
// Thren biped
// ---------------------------------------------------------------------------

interface ThrenPalette {
  skin: number;
  plate: number;
  glowC: number;
  dark: number;
}

interface DigiLeg {
  thigh: THREE.Group;
  shin: THREE.Group;
  meta: THREE.Group;
}

export class ThrenModel implements EnemyModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private jawL = new THREE.Group();
  private jawR = new THREE.Group();
  private aim = new THREE.Group();
  private tail: THREE.Group[] = [];
  private legs: DigiLeg[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private weaponGlow: THREE.Mesh | null = null;
  private shield: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
  private panel: THREE.Group | null = null;
  private panelMat: THREE.MeshBasicMaterial | null = null;
  private flip = 1;
  private aimLocal = 0;
  private t = Math.random() * 10;
  telegraph = 0;
  private meshes: THREE.Mesh[] = [];
  private bulwark: boolean;
  private eyeBase = new THREE.Color();

  constructor(kind: 'skirmisher' | 'bulwark') {
    this.bulwark = kind === 'bulwark';
    const pal: ThrenPalette = this.bulwark
      ? { skin: 0x3d3466, plate: 0x7d9a94, glowC: 0x6dffd2, dark: 0x221a3c }
      : { skin: 0x4a2a6e, plate: 0xc9a24a, glowC: 0x9dff4a, dark: 0x2a1840 };
    this.eyeMat = glow(pal.glowC, 2.8).clone();
    this.eyeBase.copy(this.eyeMat.color);
    this.build(pal);
    this.shield = shieldShell(0xffd060, 0.6, 1.1, 1.0);
    this.root.add(this.shield.mesh);
    this.meshes = collectMeshes(this.root);
    if (this.bulwark) this.root.scale.setScalar(1.08);
  }

  private build(pal: ThrenPalette): void {
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.92;
    const pelvis = chamfer(0.36, 0.22, 0.38, pal.dark, 0.3);
    this.hips.add(pelvis);
    const skirt = card(
      [
        [-0.22, 0.05],
        [0.22, 0.05],
        [0.16, -0.26],
        [-0.26, -0.22],
      ],
      0.46,
      pal.plate,
    );
    this.hips.add(skirt);
    outline(skirt);

    // Digitigrade legs: thigh forward, shin back, metatarsal forward.
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0, -0.04, side * 0.15);
      this.hips.add(thigh);
      const tm = chamfer(0.2, 0.42, 0.18, pal.skin, 0.35);
      tm.position.y = -0.2;
      thigh.add(tm);
      const shin = new THREE.Group();
      shin.position.y = -0.4;
      thigh.add(shin);
      const sm = chamfer(0.13, 0.4, 0.14, pal.skin, 0.35);
      sm.position.y = -0.19;
      shin.add(sm);
      const shinPlate = card(
        [
          [0, 0],
          [0.1, -0.05],
          [0.06, -0.34],
          [-0.02, -0.3],
        ],
        0.17,
        pal.plate,
      );
      shinPlate.position.set(-0.08, -0.02, 0);
      shin.add(shinPlate);
      const meta = new THREE.Group();
      meta.position.y = -0.38;
      shin.add(meta);
      const mm = chamfer(0.1, 0.3, 0.1, pal.dark, 0.35);
      mm.position.y = -0.13;
      meta.add(mm);
      for (const k of [-1, 0, 1]) {
        const claw = card(
          [
            [0, 0],
            [0.18, -0.02],
            [0.02, 0.04],
          ],
          0.04,
          0xe8dcc0,
        );
        claw.position.set(0.02, -0.27, k * 0.05);
        claw.rotation.y = k * 0.3;
        meta.add(claw);
      }
      this.legs.push({ thigh, shin, meta });
    }

    // Hunched torso.
    this.torso.position.set(0.02, 0.1, 0);
    this.hips.add(this.torso);
    const belly = chamfer(0.34, 0.36, 0.38, pal.skin, 0.3);
    belly.position.set(0.04, 0.18, 0);
    this.torso.add(belly);
    const chest = chamfer(0.5, 0.44, 0.52, pal.skin, 0.25);
    chest.position.set(0.1, 0.48, 0);
    this.torso.add(chest);
    outline(chest);
    const carapace = card(
      [
        [-0.34, 0.0],
        [0.12, 0.22],
        [0.34, 0.12],
        [0.2, -0.12],
        [-0.3, -0.3],
      ],
      0.58,
      pal.plate,
    );
    carapace.position.set(-0.05, 0.58, 0);
    this.torso.add(carapace);
    outline(carapace);
    // Glowing spine nodes.
    for (let i = 0; i < 4; i++) {
      const n = gem(0.045, glow(pal.glowC, 2.6), 0, 'oct');
      n.position.set(-0.3 + i * 0.12, 0.72 - i * 0.06, 0);
      this.torso.add(n);
    }
    for (const side of [1, -1]) {
      const shoulder = card(
        [
          [-0.16, 0.08],
          [0.18, 0.1],
          [0.2, -0.1],
          [-0.1, -0.16],
        ],
        0.14,
        shade(pal.plate, -0.1),
      );
      shoulder.position.set(0.12, 0.62, side * 0.3);
      shoulder.rotation.x = side * 0.25;
      this.torso.add(shoulder);
    }

    // Neck & long head.
    this.neck.position.set(0.3, 0.62, 0);
    this.torso.add(this.neck);
    const nm = chamfer(0.2, 0.14, 0.16, pal.dark, 0.35);
    nm.position.set(0.08, 0.04, 0);
    nm.rotation.z = 0.4;
    this.neck.add(nm);
    this.head.position.set(0.18, 0.1, 0);
    this.neck.add(this.head);
    const skull = card(
      [
        [-0.12, 0.08],
        [0.18, 0.12],
        [0.38, 0.0],
        [0.3, -0.08],
        [-0.08, -0.1],
      ],
      0.24,
      pal.skin,
    );
    this.head.add(skull);
    outline(skull);
    const crest = card(
      [
        [-0.2, 0.06],
        [0.1, 0.1],
        [-0.05, 0.3],
        [-0.32, 0.36],
      ],
      0.05,
      pal.plate,
    );
    this.head.add(crest);
    for (const side of [1, -1]) {
      const eye = box(0.07, 0.035, 0.03, this.eyeMat);
      eye.position.set(0.2, 0.05, side * 0.11);
      this.head.add(eye);
    }
    this.jawL.position.set(0.22, -0.06, 0.07);
    this.jawR.position.set(0.22, -0.06, -0.07);
    for (const j of [this.jawL, this.jawR]) {
      const m = card(
        [
          [0, 0],
          [0.2, -0.04],
          [0.18, 0.02],
        ],
        0.04,
        0xe8dcc0,
      );
      j.add(m);
      this.head.add(j);
    }

    // Tail.
    let parent: THREE.Object3D = this.hips;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(i === 0 ? -0.18 : -0.17, i === 0 ? 0.0 : 0, 0);
      parent.add(seg);
      const m = prism(0.07 - i * 0.012, 0.08 - i * 0.012, 0.2, 5, paper(i % 2 ? pal.plate : pal.skin));
      m.rotation.z = Math.PI / 2;
      m.position.x = -0.09;
      seg.add(m);
      this.tail.push(seg);
      parent = seg;
    }

    // Arms + weapon.
    this.aim.position.set(0.14, 0.55, 0);
    this.torso.add(this.aim);
    const arm = chamfer(0.36, 0.12, 0.12, pal.skin, 0.35);
    arm.position.set(0.14, -0.12, 0.26);
    arm.rotation.z = -0.5;
    this.aim.add(arm);
    const fore = chamfer(0.3, 0.1, 0.11, pal.dark, 0.35);
    fore.position.set(0.36, -0.14, 0.2);
    fore.rotation.z = 0.3;
    this.aim.add(fore);
    const arm2 = chamfer(0.4, 0.11, 0.11, pal.skin, 0.35);
    arm2.position.set(0.24, -0.15, -0.22);
    arm2.rotation.z = -0.25;
    this.aim.add(arm2);

    if (this.bulwark) {
      // Pistol in the near hand; the shield arm is separate.
      const gun = card(
        [
          [0, -0.04],
          [0.36, -0.02],
          [0.4, 0.06],
          [0.06, 0.08],
        ],
        0.08,
        0x2a1840,
        { edge: pal.plate },
      );
      gun.position.set(0.42, -0.1, 0.18);
      this.aim.add(gun);
      this.weaponGlow = gem(0.05, glow(pal.glowC, 2.6), 0, 'oct');
      this.weaponGlow.position.set(0.7, -0.07, 0.18);
      this.aim.add(this.weaponGlow);
      this.buildPanel(pal);
    } else {
      const carb = card(
        [
          [-0.1, -0.04],
          [0.5, -0.06],
          [0.68, 0.02],
          [0.52, 0.1],
          [0.0, 0.1],
        ],
        0.1,
        0x2a1840,
        { edge: pal.plate },
      );
      carb.position.set(0.3, -0.1, 0.08);
      this.aim.add(carb);
      const prong = card(
        [
          [0.4, 0.08],
          [0.8, 0.12],
          [0.76, 0.16],
          [0.38, 0.13],
        ],
        0.04,
        pal.plate,
      );
      prong.position.set(0.3, -0.1, 0.08);
      this.aim.add(prong);
      this.weaponGlow = gem(0.06, glow(pal.glowC, 2.6), 0, 'oct');
      this.weaponGlow.position.set(0.86, -0.06, 0.08);
      this.aim.add(this.weaponGlow);
    }
  }

  private buildPanel(pal: ThrenPalette): void {
    const g = new THREE.Group();
    g.position.set(0.72, 1.05, -0.05);
    this.body.add(g);
    // Hexagonal hard-light barrier in a folded gold frame.
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push([Math.cos(a) * 0.62, Math.sin(a) * 1.1]);
    }
    this.panelMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pal.glowC).multiplyScalar(1.3),
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const face = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.panelMat);
    face.rotation.y = Math.PI / 2;
    g.add(face);
    const frame = card(
      [
        [-0.08, -1.1],
        [0.08, -1.1],
        [0.08, 1.1],
        [-0.08, 1.1],
      ],
      0.1,
      pal.plate,
    );
    frame.position.set(0, 0, 0);
    g.add(frame);
    const emitter = gem(0.12, glow(pal.glowC, 2.4), 0, 'oct');
    g.add(emitter);
    this.panel = g;
  }

  parts(): THREE.Mesh[] {
    return this.meshes;
  }

  update(e: Enemy, dt: number): void {
    this.t += dt;
    const t = this.t;
    this.flip = damp(this.flip, e.facing, 16, dt);
    if (Math.abs(this.flip - e.facing) < 0.01) this.flip = e.facing;
    const base = this.bulwark ? 1.08 : 1;
    this.root.scale.set((Math.abs(this.flip) < 0.08 ? 0.08 * Math.sign(this.flip || 1) : this.flip) * base, base, base);
    this.root.rotation.y = this.flip >= 0 ? -VIEW_TURN : VIEW_TURN;

    const speed = Math.abs(e.vx);
    const moving = speed > 0.4 && e.onGround;
    const back = Math.sign(e.vx) !== e.facing && moving;
    const ph = back ? -e.runPhase : e.runPhase;
    let hipY = 0.92;
    let lean = -0.35;
    let neckLift = 0;
    let aimA = aimToLocal(e.aimAngle, e.facing);
    if (!e.attacking) aimA = e.target ? aimToLocal(Math.atan2(e.target.y + 1 - (e.y + 1.4), e.target.x - e.x), e.facing) : -0.2;
    const th = [0.3, 0.3];
    const sh = [-0.9, -0.9];
    const mt = [0.7, 0.7];

    if (e.dead) {
      const k = clamp(e.deadTime / 0.5, 0, 1);
      hipY = lerp(0.92, 0.3, k);
      lean = lerp(-0.35, 1.2 * Math.sign(-e.deathDirX * e.facing || 1), k);
      th[0] = th[1] = lerp(0.3, 1.2, k);
      sh[0] = sh[1] = lerp(-0.9, -1.8, k);
      aimA = lerp(aimA, -1.2, k);
    } else if (e.entering) {
      th[0] = th[1] = 0.9;
      sh[0] = sh[1] = -1.6;
      mt[0] = mt[1] = 1.0;
      lean = -0.6;
    } else {
      if (moving) {
        const amp = Math.min(1, speed / 4) * 0.65;
        for (let i = 0; i < 2; i++) {
          const p = ph + (i ? Math.PI : 0);
          th[i] = 0.3 + Math.sin(p) * amp;
          sh[i] = -0.9 - Math.max(0, Math.cos(p)) * 0.7;
          mt[i] = 0.7 + Math.max(0, Math.cos(p)) * 0.4;
        }
        hipY = 0.9 + Math.abs(Math.cos(ph)) * 0.05;
        lean = -0.45;
      } else {
        hipY = 0.92 + Math.sin(t * 2.2) * 0.012;
      }
      if (e.crouching) {
        hipY = 0.58;
        th[0] = th[1] = 0.95;
        sh[0] = sh[1] = -1.7;
        mt[0] = mt[1] = 1.1;
        lean = -0.55;
      }
      if (e.state === 'alert' || e.state === 'idle') neckLift = e.state === 'alert' ? 0.35 : 0;
      if (e.staggerT > 0 || e.stunT > 0) {
        lean = 0.15 + Math.sin(t * 30) * 0.08 * (e.stunT > 0 ? 1 : 0);
        neckLift = 0.4;
        aimA = -0.8;
      }
      if (!e.onGround && !e.entering) {
        th[0] = 0.8;
        th[1] = 0.1;
        sh[0] = -1.4;
        sh[1] = -0.6;
      }
      if (e.meleeWindup > 0) {
        aimA = 0.9;
        lean = -0.1;
      }
    }

    const L = moving ? 30 : 12;
    this.hips.position.y = damp(this.hips.position.y, hipY, 16, dt);
    this.torso.rotation.z = damp(this.torso.rotation.z, lean, 10, dt);
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      leg.thigh.rotation.z = damp(leg.thigh.rotation.z, th[i], L, dt);
      leg.shin.rotation.z = damp(leg.shin.rotation.z, sh[i], L, dt);
      leg.meta.rotation.z = damp(leg.meta.rotation.z, mt[i], L, dt);
    }
    this.neck.rotation.z = damp(this.neck.rotation.z, -lean * 0.8 + neckLift, 10, dt);
    this.head.rotation.z = damp(this.head.rotation.z, clamp(aimA * 0.4, -0.4, 0.4), 10, dt);
    this.aimLocal = dampAngle(this.aimLocal, aimA - this.torso.rotation.z, 18, dt);
    this.aim.rotation.z = this.aimLocal;
    // Mandibles chatter when vocal / attacking.
    const jaw = e.attacking || e.state === 'alert' ? 0.25 + Math.sin(t * 25) * 0.15 : 0.05;
    this.jawL.rotation.y = damp(this.jawL.rotation.y, jaw, 20, dt);
    this.jawR.rotation.y = damp(this.jawR.rotation.y, -jaw, 20, dt);
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.z = Math.sin(t * 2.5 - i * 0.7) * 0.18 + (i === 0 ? 0.35 : 0.05) + (moving ? Math.sin(ph * 2) * 0.08 : 0);
    }

    // Telegraph: weapon and eyes flare before firing.
    const tel = e.telegraphT > 0 || e.meleeWindup > 0 ? 1 : 0;
    this.telegraph = damp(this.telegraph, tel, 20, dt);
    if (this.weaponGlow) this.weaponGlow.scale.setScalar(1 + this.telegraph * 1.6 + Math.sin(t * 40) * this.telegraph * 0.3);
    this.eyeMat.color.copy(this.eyeBase).multiplyScalar(1 + this.telegraph * 1.5 + (e.hitFlash > 0 ? 2 : 0));

    // Energy shield shell.
    let op = 0;
    if (e.maxShield > 0) {
      if (e.lastShieldHit < 0.3 && e.shield > 0) op = (1 - e.lastShieldHit / 0.3) * 0.6;
      if (e.shield > 0 && e.shield < e.maxShield && e.shieldTimer <= 0) op = Math.max(op, 0.1 + Math.sin(t * 18) * 0.05);
    }
    this.shield.mat.opacity = op;
    this.shield.mesh.visible = op > 0.01;
    this.shield.mesh.rotation.y += dt;
    this.shield.mesh.position.y = e.crouching ? 0.7 : 1.0;

    // Bulwark hard-light panel.
    if (this.panel && this.panelMat) {
      const b = e as Bulwark;
      const up = b.panelUp && !e.dead;
      this.panel.visible = up || b.panelDownT > 4.2;
      const hitFlash = b.panelHitT < 0.15 ? 1 - b.panelHitT / 0.15 : 0;
      const hpFrac = b.panelMax > 0 ? b.panelHp / b.panelMax : 0;
      this.panelMat.opacity = up ? 0.22 + hpFrac * 0.2 + hitFlash * 0.5 + Math.sin(t * 9) * 0.03 : Math.random() * 0.3;
      this.panel.position.y = e.crouching ? 0.75 : 1.05;
    }
  }

  dispose(): void {
    this.eyeMat.dispose();
    this.shield.mat.dispose();
    this.shield.mesh.geometry.dispose();
    this.panelMat?.dispose();
  }
}

// ---------------------------------------------------------------------------
// Ravager
// ---------------------------------------------------------------------------

export class RavagerModel implements EnemyModel {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private arms: THREE.Group[] = [];
  private fore: THREE.Group[] = [];
  private legs: Array<{ thigh: THREE.Group; shin: THREE.Group }> = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private ventMat: THREE.MeshBasicMaterial;
  private flip = 1;
  private t = Math.random() * 10;
  telegraph = 0;
  private meshes: THREE.Mesh[];

  constructor() {
    const skin = 0x5a1e3a;
    const bone = 0xe8dcc0;
    const dark = 0x2e0f20;
    this.eyeMat = glow(0xff6a20, 3).clone();
    this.ventMat = glow(0xff4a1a, 1.6).clone();
    this.root.add(this.hips);
    this.hips.position.y = 1.05;
    const pelvis = chamfer(0.5, 0.3, 0.6, dark, 0.3);
    this.hips.add(pelvis);
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0, -0.06, side * 0.24);
      this.hips.add(thigh);
      const tm = chamfer(0.3, 0.52, 0.28, skin, 0.3);
      tm.position.y = -0.24;
      thigh.add(tm);
      const shin = new THREE.Group();
      shin.position.y = -0.5;
      thigh.add(shin);
      const sm = chamfer(0.26, 0.48, 0.25, dark, 0.3);
      sm.position.y = -0.22;
      shin.add(sm);
      const plate = card(
        [
          [0, 0.05],
          [0.16, 0],
          [0.12, -0.42],
          [0, -0.46],
        ],
        0.3,
        bone,
      );
      plate.position.set(0.08, 0, 0);
      shin.add(plate);
      const foot = chamfer(0.42, 0.14, 0.3, dark, 0.3);
      foot.position.set(0.1, -0.5, 0);
      shin.add(foot);
      this.legs.push({ thigh, shin });
    }
    this.torso.position.y = 0.12;
    this.hips.add(this.torso);
    const chest = chamfer(0.8, 0.8, 0.9, skin, 0.25);
    chest.position.set(0.15, 0.55, 0);
    this.torso.add(chest);
    outline(chest);
    // Bone back plates (folded fan).
    for (let i = 0; i < 4; i++) {
      const pl = card(
        [
          [-0.3, 0],
          [0.3, 0.06],
          [0.2, 0.3],
          [-0.24, 0.24],
        ],
        0.9 - i * 0.12,
        bone,
      );
      pl.position.set(-0.25 + i * 0.12, 0.75 + i * 0.12, 0);
      pl.rotation.z = 0.4 - i * 0.2;
      this.torso.add(pl);
      outline(pl);
    }
    const vents = box(0.05, 0.3, 0.5, this.ventMat);
    vents.position.set(0.56, 0.5, 0);
    this.torso.add(vents);
    this.head.position.set(0.55, 0.62, 0);
    this.torso.add(this.head);
    const skull = chamfer(0.42, 0.32, 0.38, dark, 0.3);
    skull.position.set(0.12, 0, 0);
    this.head.add(skull);
    for (const side of [1, -1]) {
      const horn = card(
        [
          [0, 0],
          [0.12, 0.02],
          [-0.2, 0.42],
        ],
        0.08,
        bone,
      );
      horn.position.set(0.0, 0.1, side * 0.18);
      this.head.add(horn);
      const eye = box(0.05, 0.05, 0.05, this.eyeMat);
      eye.position.set(0.33, 0.04, side * 0.1);
      this.head.add(eye);
    }
    const tusks = card(
      [
        [0, 0],
        [0.24, -0.12],
        [0.08, 0.02],
      ],
      0.3,
      bone,
    );
    tusks.position.set(0.28, -0.12, 0);
    this.head.add(tusks);
    for (const side of [1, -1]) {
      const sh = new THREE.Group();
      sh.position.set(0.15, 0.8, side * 0.55);
      this.torso.add(sh);
      const up = chamfer(0.3, 0.6, 0.3, skin, 0.3);
      up.position.y = -0.28;
      sh.add(up);
      const spad = card(
        [
          [-0.25, 0.1],
          [0.25, 0.14],
          [0.28, -0.12],
          [-0.22, -0.18],
        ],
        0.36,
        bone,
      );
      sh.add(spad);
      const fg = new THREE.Group();
      fg.position.y = -0.56;
      sh.add(fg);
      const fm = chamfer(0.38, 0.62, 0.36, dark, 0.3);
      fm.position.y = -0.28;
      fg.add(fm);
      const blade = card(
        [
          [0, 0],
          [0.12, -0.05],
          [0.5, -0.75],
          [0.02, -0.4],
        ],
        0.06,
        bone,
      );
      blade.position.set(0.12, -0.2, 0);
      fg.add(blade);
      this.arms.push(sh);
      this.fore.push(fg);
    }
    this.meshes = collectMeshes(this.root);
  }

  parts(): THREE.Mesh[] {
    return this.meshes;
  }

  update(e: Enemy, dt: number): void {
    const r = e as Ravager;
    this.t += dt;
    const t = this.t;
    this.flip = damp(this.flip, e.facing, 12, dt);
    if (Math.abs(this.flip - e.facing) < 0.01) this.flip = e.facing;
    this.root.scale.x = Math.abs(this.flip) < 0.08 ? 0.08 * Math.sign(this.flip || 1) : this.flip;
    this.root.rotation.y = this.flip >= 0 ? -VIEW_TURN : VIEW_TURN;
    const moving = Math.abs(e.vx) > 0.4 && e.onGround;
    const ph = e.runPhase;
    let hipY = 1.05;
    let lean = -0.3;
    let headR = 0;
    const arm = [0.2, -0.2];
    const fore = [-0.6, -0.6];
    const th = [0, 0];
    const sh = [-0.2, -0.2];
    if (e.dead) {
      const k = clamp(e.deadTime / 0.6, 0, 1);
      hipY = lerp(1.05, 0.4, k);
      lean = lerp(-0.3, -1.3, k);
      th[0] = th[1] = lerp(0, 1.3, k);
      sh[0] = sh[1] = lerp(-0.2, -2.0, k);
    } else if (e.state === 'charge') {
      lean = -0.85;
      for (let i = 0; i < 2; i++) {
        const p = t * 14 + (i ? Math.PI : 0);
        th[i] = Math.sin(p) * 0.9;
        sh[i] = -0.3 - Math.max(0, Math.cos(p)) * 1.0;
        arm[i] = -1.2;
        fore[i] = -0.3;
      }
      headR = 0.4;
    } else if (e.state === 'windup') {
      hipY = 0.85;
      lean = -0.1;
      headR = 0.6;
      arm[0] = arm[1] = 1.4 + Math.sin(t * 40) * 0.05;
      fore[0] = fore[1] = -1.2;
      th[0] = 0.6;
      sh[0] = -1.0;
      th[1] = -0.3;
      sh[1] = -0.4;
    } else if (r.dazedT > 0 || e.state === 'dazed') {
      lean = 0.1 + Math.sin(t * 5) * 0.15;
      headR = Math.sin(t * 7) * 0.3;
      arm[0] = arm[1] = -0.2;
    } else {
      if (moving) {
        for (let i = 0; i < 2; i++) {
          const p = ph + (i ? Math.PI : 0);
          th[i] = Math.sin(p) * 0.6;
          sh[i] = -0.2 - Math.max(0, Math.cos(p)) * 0.9;
          arm[i] = -Math.sin(p) * 0.5 + 0.1;
        }
        hipY = 1.0 + Math.abs(Math.cos(ph)) * 0.08;
        lean = -0.45;
      } else {
        const br = Math.sin(t * 1.4);
        hipY = 1.05 + br * 0.02;
        arm[0] = 0.15 + br * 0.05;
        arm[1] = -0.15 - br * 0.05;
      }
      if (e.state === 'alert') {
        headR = 0.6;
        arm[0] = arm[1] = 1.0;
      }
      if (e.meleeWindup > 0) {
        arm[0] = 2.2;
        fore[0] = -1.4;
      } else if (e.meleeCooldown > 1.0) {
        arm[0] = -1.4;
        fore[0] = -0.2;
      }
      if (e.staggerT > 0) lean = 0.25;
    }
    const L = e.state === 'charge' || moving ? 30 : 12;
    this.hips.position.y = damp(this.hips.position.y, hipY, 14, dt);
    this.torso.rotation.z = damp(this.torso.rotation.z, lean, 10, dt);
    this.head.rotation.z = damp(this.head.rotation.z, headR - lean * 0.6, 10, dt);
    for (let i = 0; i < 2; i++) {
      this.legs[i].thigh.rotation.z = damp(this.legs[i].thigh.rotation.z, th[i], L, dt);
      this.legs[i].shin.rotation.z = damp(this.legs[i].shin.rotation.z, sh[i], L, dt);
      this.arms[i].rotation.z = damp(this.arms[i].rotation.z, arm[i], L, dt);
      this.fore[i].rotation.z = damp(this.fore[i].rotation.z, fore[i], L, dt);
    }
    const tel = e.state === 'windup' || e.meleeWindup > 0 ? 1 : 0;
    this.telegraph = damp(this.telegraph, tel, 15, dt);
    const flash = 1 + this.telegraph * 2 + (e.hitFlash > 0 ? 1.5 : 0) + Math.sin(t * 30) * this.telegraph * 0.4;
    this.eyeMat.color.setHex(0xff6a20).multiplyScalar(3 * flash);
    this.ventMat.color.setHex(0xff4a1a).multiplyScalar(1.4 + this.telegraph * 2.5 + Math.sin(t * 3) * 0.3);
  }

  dispose(): void {
    this.eyeMat.dispose();
    this.ventMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Watchdog drone
// ---------------------------------------------------------------------------

export class DroneModel implements EnemyModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private ring = new THREE.Group();
  private eye: THREE.Mesh;
  private eyeMat: THREE.MeshBasicMaterial;
  private guns: THREE.Group[] = [];
  private t = Math.random() * 10;
  telegraph = 0;
  private meshes: THREE.Mesh[];
  private flip = 1;

  constructor() {
    const white = 0xd6dade;
    const gray = 0x7a8590;
    this.root.add(this.body);
    this.body.position.y = 0.5;
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), [metalPaper(white, 0.5, 0.25)]);
    shell.castShadow = true;
    shell.scale.set(1.1, 0.85, 0.9);
    this.body.add(shell);
    outline(shell, 0x10141a, 0.5, 20);
    const band = prism(0.5, 0.5, 0.12, 8, paper(0xe8772e));
    band.scale.set(1.0, 1, 0.85);
    this.body.add(band);
    const visorPlate = chamfer(0.22, 0.3, 0.42, paper(0x2a2f36), 0.3);
    visorPlate.position.set(0.38, 0.02, 0);
    this.body.add(visorPlate);
    this.eyeMat = glow(0xff2a2a, 3).clone();
    this.eye = gem(0.1, this.eyeMat, 0, 'oct');
    this.eye.position.set(0.5, 0.03, 0);
    this.body.add(this.eye);
    const fin = card(
      [
        [-0.3, 0],
        [0.1, 0],
        [-0.2, 0.36],
      ],
      0.05,
      gray,
    );
    fin.position.set(-0.1, 0.32, 0);
    this.body.add(fin);
    const ant = prism(0.01, 0.015, 0.4, 4, paper(0x222222));
    ant.position.set(-0.25, 0.5, 0.12);
    ant.rotation.z = 0.4;
    this.body.add(ant);
    this.body.add(this.ring);
    this.ring.position.y = -0.05;
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 4, 10), metalPaper(gray, 0.5, 0.4));
    ringMesh.rotation.x = Math.PI / 2;
    this.ring.add(ringMesh);
    for (let i = 0; i < 3; i++) {
      const blade = card(
        [
          [0, -0.05],
          [0.62, -0.08],
          [0.62, 0.06],
          [0, 0.05],
        ],
        0.02,
        white,
      );
      blade.rotation.x = Math.PI / 2;
      blade.rotation.z = (i / 3) * Math.PI * 2;
      this.ring.add(blade);
    }
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(0.05, -0.18, side * 0.42);
      this.body.add(g);
      const barrel = prism(0.04, 0.05, 0.42, 6, metalPaper(0x30353c));
      barrel.rotation.z = Math.PI / 2;
      barrel.position.x = 0.15;
      g.add(barrel);
      const housing = chamfer(0.18, 0.14, 0.12, gray, 0.3);
      g.add(housing);
      this.guns.push(g);
    }
    const thruster = gem(0.12, glow(0x7fd0ff, 2.2), 0, 'oct');
    thruster.position.set(-0.05, -0.38, 0);
    thruster.scale.set(1, 0.6, 1);
    this.body.add(thruster);
    this.meshes = collectMeshes(this.root);
  }

  parts(): THREE.Mesh[] {
    return this.meshes;
  }

  update(e: Enemy, dt: number): void {
    const d = e as Drone;
    this.t += dt;
    this.flip = damp(this.flip, e.facing, 10, dt);
    this.root.scale.x = Math.abs(this.flip) < 0.1 ? 0.1 * Math.sign(this.flip || 1) : this.flip;
    this.root.rotation.y = this.flip >= 0 ? -0.35 : 0.35;
    this.ring.rotation.y = d.rotorSpin;
    const bank = clamp(-e.vx * 0.06 * e.facing, -0.4, 0.4);
    this.body.rotation.z = damp(this.body.rotation.z, bank + (e.stunT > 0 ? Math.sin(this.t * 20) * 0.3 : 0) + (e.dead ? this.t * 6 : 0), 6, dt);
    this.body.position.y = 0.5 + Math.sin(this.t * 3) * 0.05;
    const aimA = aimToLocal(e.aimAngle, e.facing);
    for (const g of this.guns) g.rotation.z = damp(g.rotation.z, clamp(aimA, -0.9, 0.9), 10, dt);
    const tel = e.telegraphT > 0 ? 1 : 0;
    this.telegraph = damp(this.telegraph, tel, 20, dt);
    const stun = e.stunT > 0 ? (Math.sin(this.t * 25) > 0 ? 0.2 : 1) : 1;
    this.eyeMat.color.setHex(e.stunT > 0 ? 0x7fd0ff : 0xff2a2a).multiplyScalar((2.4 + this.telegraph * 4 + (e.hitFlash > 0 ? 3 : 0)) * stun);
    this.eye.scale.setScalar(1 + this.telegraph * 0.8);
  }

  dispose(): void {
    this.eyeMat.dispose();
  }
}

export function shadeColor(c: number, f: number): number {
  return shade(c, f);
}
