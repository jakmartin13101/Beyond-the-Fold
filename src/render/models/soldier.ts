// The Warden-Commando: a folded-paper armored supersoldier with fully procedural animation
// (run/sprint/jump/fall/land, crouch, dodge roll, aiming, recoil, reload, weapon switch,
// melee, grenade throw, hurt flinch, death and victory), secondary motion on armor plates,
// a paper-flip turnaround and an energy shield shell.
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../../core/math';
import { box, card, chamfer, gem, glow, outline, paper, prism, shade } from '../paper';
import { buildWeaponModel } from './weapons';
import { compactModel } from '../batch';

export interface SoldierColors {
  primary: number;
  secondary: number;
  accent: number;
  visor: number;
}

export interface SoldierPose {
  anim: string;
  vx: number;
  onGround: boolean;
  facing: number;
  aimAngle: number;
  crouching: boolean;
  rollT: number;
  meleeT: number;
  throwT: number;
  switchT: number;
  switchDur: number;
  weaponId: string | null;
  reloadProgress: number;
  reloading: boolean;
  recoil: number;
  landImpact: number;
  hurtT: number;
  dead: boolean;
  deadTime: number;
  shieldFrac: number;
  lastShieldHit: number;
  shieldRecharging: boolean;
  victory: boolean;
  runPhase: number;
  sprinting: boolean;
  lastFire: number;
  charge: number;
  laneT: number;
  /** Lying on the ground (intro wake-up): 1 = prone, 0 = standing. */
  prone?: number;
}

const ROLL_TIME = 0.46;
const MELEE_TIME = 0.44;
const THROW_TIME = 0.42;
const VIEW_TURN = 0.5;
const FORESHORTEN = Math.cos(VIEW_TURN);

interface Leg {
  thigh: THREE.Group;
  shin: THREE.Group;
  foot: THREE.Group;
}

export class SoldierModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private aim = new THREE.Group();
  private weaponMount = new THREE.Group();
  private supportArm = new THREE.Group();
  private legs: Leg[] = [];
  private pauldrons: THREE.Group[] = [];
  private antenna = new THREE.Group();
  private shieldShell: THREE.Mesh;
  private shieldMat: THREE.MeshBasicMaterial;
  private visorMat: THREE.MeshBasicMaterial;
  private grenadeProp: THREE.Mesh;
  private weapon: THREE.Group | null = null;
  private weaponId: string | null = null;
  private flip = 1;
  private turnScale = 1;
  private aimLocal = 0;
  private t = 0;
  private plateLag = 0;
  private prevVx = 0;
  private antennaV = 0;
  private antennaA = 0;
  private hurtTilt = 0;
  private recoilOffset = 0;
  private rollSpin = 0;
  private colors: SoldierColors;
  private materialsToTint: THREE.Mesh[] = [];

  constructor(colors: SoldierColors) {
    this.colors = colors;
    this.build();
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x7fe8ff).multiplyScalar(1.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      wireframe: true,
    });
    this.shieldShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.shieldMat);
    this.shieldShell.scale.set(0.62, 1.12, 0.62);
    this.shieldShell.position.y = 1.0;
    this.root.add(this.shieldShell);
    this.visorMat = glow(colors.visor, 3.2).clone();
    this.applyVisor();
    this.grenadeProp = gem(0.09, paper(0x5a6a48), 0, 'ico');
    this.grenadeProp.visible = false;
    this.torso.add(this.grenadeProp);
  }

  private applyVisor(): void {
    this.root.traverse((o) => {
      if (o.name === 'visor') (o as THREE.Mesh).material = this.visorMat;
    });
  }

  private build(): void {
    const c = this.colors;
    const P = c.primary;
    const S = c.secondary;
    const A = c.accent;
    const SUIT = 0x24262c;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.98;

    // Pelvis & belt.
    const pelvis = chamfer(0.34, 0.24, 0.44, SUIT, 0.25);
    this.hips.add(pelvis);
    const belt = chamfer(0.38, 0.09, 0.48, S, 0.3);
    belt.position.y = 0.08;
    this.hips.add(belt);
    const codplate = card(
      [
        [-0.06, 0.05],
        [0.16, 0.05],
        [0.12, -0.16],
        [0.0, -0.2],
      ],
      0.05,
      P,
    );
    codplate.position.set(0.12, -0.02, 0);
    codplate.rotation.y = Math.PI / 2;
    this.hips.add(codplate);
    outline(belt);

    // Legs.
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(0, -0.06, side * 0.13);
      this.hips.add(thigh);
      const tm = chamfer(0.2, 0.46, 0.19, SUIT, 0.3);
      tm.position.y = -0.22;
      thigh.add(tm);
      const tplate = chamfer(0.13, 0.3, 0.21, P, 0.35);
      tplate.position.set(0.07, -0.18, 0);
      thigh.add(tplate);
      outline(tplate);
      const shin = new THREE.Group();
      shin.position.y = -0.46;
      thigh.add(shin);
      const knee = gem(0.085, paper(S), 0, 'oct');
      knee.position.set(0.06, 0, 0);
      shin.add(knee);
      const sm = chamfer(0.18, 0.44, 0.17, SUIT, 0.3);
      sm.position.y = -0.22;
      shin.add(sm);
      const splate = chamfer(0.12, 0.34, 0.2, P, 0.3);
      splate.position.set(0.06, -0.2, 0);
      shin.add(splate);
      outline(splate);
      const stripe = box(0.13, 0.04, 0.205, paper(A));
      stripe.position.set(0.065, -0.1, 0);
      shin.add(stripe);
      const foot = new THREE.Group();
      foot.position.y = -0.44;
      shin.add(foot);
      const boot = chamfer(0.34, 0.13, 0.19, S, 0.3);
      boot.position.set(0.06, -0.035, 0);
      foot.add(boot);
      outline(boot);
      this.legs.push({ thigh, shin, foot });
    }

    // Torso.
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    const abdomen = chamfer(0.3, 0.28, 0.4, SUIT, 0.25);
    abdomen.position.y = 0.12;
    this.torso.add(abdomen);
    const chest = chamfer(0.46, 0.44, 0.58, P, 0.22);
    chest.position.set(0.02, 0.4, 0);
    this.torso.add(chest);
    outline(chest);
    // Folded chest plates: two angled cards like a creased breastplate.
    for (const side of [1, -1]) {
      const plate = card(
        [
          [0, 0],
          [0.26, 0.02],
          [0.24, 0.3],
          [0.02, 0.34],
        ],
        0.04,
        shade(P, 0.12),
      );
      plate.position.set(0.25, 0.24, side * 0.01);
      plate.rotation.y = side * 0.5 - Math.PI / 2;
      plate.rotation.z = 0;
      this.torso.add(plate);
    }
    const sternum = box(0.06, 0.26, 0.08, paper(A));
    sternum.position.set(0.26, 0.42, 0);
    this.torso.add(sternum);
    const collar = chamfer(0.34, 0.1, 0.44, S, 0.3);
    collar.position.set(0.0, 0.64, 0);
    this.torso.add(collar);
    // Backpack with capacitor & antenna.
    const pack = chamfer(0.22, 0.42, 0.44, S, 0.25);
    pack.position.set(-0.3, 0.38, 0);
    this.torso.add(pack);
    outline(pack);
    const cap = prism(0.06, 0.06, 0.3, 6, glow(0x5ff2ff, 1.6));
    cap.position.set(-0.42, 0.38, 0.12);
    this.torso.add(cap);
    this.antenna.position.set(-0.34, 0.6, -0.14);
    this.torso.add(this.antenna);
    const ant = prism(0.012, 0.018, 0.55, 4, paper(0x1a1c20));
    ant.position.y = 0.27;
    this.antenna.add(ant);
    const tip = gem(0.025, glow(0xff5a3a, 3), 0, 'oct');
    tip.position.y = 0.56;
    this.antenna.add(tip);

    // Pauldrons (secondary motion).
    for (const side of [1, -1]) {
      const pg = new THREE.Group();
      pg.position.set(0.0, 0.58, side * 0.33);
      this.torso.add(pg);
      const pm = card(
        [
          [-0.2, 0.06],
          [0.18, 0.08],
          [0.24, -0.06],
          [0.16, -0.2],
          [-0.18, -0.2],
          [-0.24, -0.05],
        ],
        0.16,
        P,
      );
      pm.rotation.x = side * 0.2;
      pg.add(pm);
      outline(pm);
      const trim = box(0.4, 0.035, 0.17, paper(A));
      trim.position.set(0, -0.17, 0);
      pg.add(trim);
      this.pauldrons.push(pg);
    }

    // Head / helmet.
    this.head.position.set(0.03, 0.72, 0);
    this.torso.add(this.head);
    const neck = prism(0.08, 0.1, 0.12, 6, paper(SUIT));
    neck.position.y = 0.02;
    this.head.add(neck);
    const helm = chamfer(0.36, 0.34, 0.32, P, 0.3);
    helm.position.set(0.0, 0.2, 0);
    this.head.add(helm);
    outline(helm);
    const crest = card(
      [
        [-0.18, 0],
        [0.14, 0],
        [0.1, 0.07],
        [-0.16, 0.05],
      ],
      0.08,
      S,
    );
    crest.position.set(0, 0.36, 0);
    this.head.add(crest);
    const jaw = card(
      [
        [0.0, 0.0],
        [0.22, 0.02],
        [0.2, 0.12],
        [0.02, 0.16],
      ],
      0.3,
      S,
    );
    jaw.position.set(0.02, 0.03, 0);
    this.head.add(jaw);
    const visor = card(
      [
        [-0.02, -0.01],
        [0.11, -0.03],
        [0.14, 0.1],
        [0.0, 0.13],
      ],
      0.34,
      c.visor,
    );
    visor.name = 'visor';
    visor.position.set(0.12, 0.16, 0);
    this.head.add(visor);
    for (const side of [1, -1]) {
      const ear = prism(0.07, 0.07, 0.05, 6, paper(S));
      ear.rotation.x = Math.PI / 2;
      ear.position.set(-0.03, 0.2, side * 0.17);
      this.head.add(ear);
    }
    const lamp = box(0.03, 0.03, 0.03, glow(A, 2.5));
    lamp.position.set(0.08, 0.3, 0.17);
    this.head.add(lamp);

    // Aiming arms + weapon (rotate together about the shoulder line).
    this.aim.position.set(0, 0.36, 0);
    this.torso.add(this.aim);
    // Near (right) arm: upper arm + forearm to the grip.
    const upper = chamfer(0.3, 0.14, 0.15, SUIT, 0.3);
    upper.position.set(0.08, -0.12, 0.27);
    upper.rotation.z = -0.9;
    this.aim.add(upper);
    const upperPlate = chamfer(0.22, 0.1, 0.17, P, 0.3);
    upperPlate.position.set(0.06, -0.08, 0.28);
    upperPlate.rotation.z = -0.9;
    this.aim.add(upperPlate);
    const fore = chamfer(0.3, 0.13, 0.14, S, 0.3);
    fore.position.set(0.22, -0.16, 0.22);
    fore.rotation.z = 0.35;
    this.aim.add(fore);
    const glove = chamfer(0.1, 0.1, 0.12, SUIT, 0.3);
    glove.position.set(0.32, -0.12, 0.16);
    this.aim.add(glove);
    // Far (left) support arm reaching the foregrip.
    this.supportArm.position.set(0, 0, -0.26);
    this.aim.add(this.supportArm);
    const supUpper = chamfer(0.34, 0.13, 0.14, SUIT, 0.3);
    supUpper.position.set(0.14, -0.14, 0);
    supUpper.rotation.z = -0.55;
    this.supportArm.add(supUpper);
    const supFore = chamfer(0.36, 0.12, 0.13, S, 0.3);
    supFore.position.set(0.44, -0.16, 0.08);
    supFore.rotation.z = 0.25;
    this.supportArm.add(supFore);
    this.weaponMount.position.set(0.32, -0.1, 0.12);
    this.aim.add(this.weaponMount);

    compactModel(this.root);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.materialsToTint.push(o as THREE.Mesh);
    });
  }

  setVisor(color: number): void {
    this.visorMat.color.set(color).multiplyScalar(3.2);
  }

  private setWeapon(id: string | null): void {
    if (id === this.weaponId) return;
    if (this.weapon) this.weaponMount.remove(this.weapon);
    this.weapon = id ? buildWeaponModel(id) : null;
    this.weaponId = id;
    if (this.weapon) {
      this.weaponMount.add(this.weapon);
      // Rocket launchers ride on the shoulder.
      this.weaponMount.position.set(id === 'rocket' ? 0.1 : 0.32, id === 'rocket' ? 0.02 : -0.1, 0.12);
    }
  }

  update(p: SoldierPose, dt: number): void {
    this.t += dt;
    const t = this.t;

    // --- facing: paper-flip turnaround
    this.flip = damp(this.flip, p.facing, 22, dt);
    if (Math.abs(this.flip - p.facing) < 0.01) this.flip = p.facing;
    this.turnScale = this.flip;
    const facing = p.facing;
    this.root.scale.x = Math.abs(this.turnScale) < 0.08 ? 0.08 * Math.sign(this.turnScale || 1) : this.turnScale;
    this.root.rotation.y = this.turnScale >= 0 ? -VIEW_TURN : VIEW_TURN;

    // --- weapon model (swap at the midpoint of a switch)
    this.setWeapon(p.weaponId);

    // --- aim angle in model space
    const a = p.aimAngle;
    const local = facing > 0 ? a : Math.PI - a;
    const wrapped = Math.atan2(Math.sin(local), Math.cos(local));
    const corrected = Math.atan2(Math.sin(wrapped) * FORESHORTEN, Math.cos(wrapped));
    this.aimLocal = dampAngle(this.aimLocal, corrected, 30, dt);
    this.recoilOffset = damp(this.recoilOffset, p.recoil, 20, dt);

    // --- base pose targets
    let hipY = 0.98;
    let torsoLean = 0;
    let bodyRot = 0;
    let headTilt = clamp(this.aimLocal * 0.45, -0.45, 0.55);
    let aimAngle = this.aimLocal;
    let supportRot = 0;
    const thighs = [0, 0];
    const shins = [0, 0];
    const feet = [0, 0];

    const speed = Math.abs(p.vx);
    const backpedal = Math.sign(p.vx) !== 0 && Math.sign(p.vx) !== facing;
    const phase = backpedal ? -p.runPhase : p.runPhase;

    if (p.dead) {
      const k = clamp(p.deadTime / 0.6, 0, 1);
      bodyRot = lerp(0, 1.45, easeOut(k));
      hipY = lerp(0.98, 0.32, easeOut(k));
      thighs[0] = lerp(0, 0.9, k);
      thighs[1] = lerp(0, 0.4, k);
      shins[0] = lerp(0, -1.2, k);
      shins[1] = lerp(0, -0.5, k);
      aimAngle = lerp(this.aimLocal, -1.1, k);
      headTilt = lerp(0, 0.4, k);
    } else if (p.prone && p.prone > 0) {
      const k = p.prone;
      bodyRot = lerp(0, 1.5, k);
      hipY = lerp(0.98, 0.3, k);
      thighs[0] = 0.3 * k;
      thighs[1] = 0.1 * k;
      shins[0] = -0.4 * k;
      shins[1] = -0.2 * k;
      aimAngle = lerp(this.aimLocal, -1.3, k);
      headTilt = lerp(headTilt, 0.3, k);
    } else if (p.rollT > 0) {
      const k = 1 - p.rollT / ROLL_TIME;
      this.rollSpin = -Math.PI * 2 * easeInOut(k);
      hipY = 0.98 - Math.sin(k * Math.PI) * 0.45;
      thighs[0] = thighs[1] = 1.7 * Math.sin(k * Math.PI);
      shins[0] = shins[1] = -2.3 * Math.sin(k * Math.PI);
      aimAngle = -0.9;
      torsoLean = -0.5 * Math.sin(k * Math.PI);
    } else {
      this.rollSpin = 0;
      switch (p.anim) {
        case 'run':
        case 'sprint': {
          const sprint = p.anim === 'sprint';
          const amp = sprint ? 0.95 : 0.7;
          for (let i = 0; i < 2; i++) {
            const ph = phase + (i === 0 ? 0 : Math.PI);
            thighs[i] = Math.sin(ph) * amp;
            shins[i] = -(0.15 + 1.2 * Math.pow(Math.max(0, Math.cos(ph)), 1.4)) * (sprint ? 1.2 : 1);
            feet[i] = Math.max(0, -Math.sin(ph)) * 0.4;
          }
          hipY = 0.98 - 0.04 + Math.abs(Math.cos(phase)) * 0.06;
          torsoLean = sprint ? -0.32 : -0.1;
          if (backpedal) torsoLean = 0.06;
          if (sprint) {
            aimAngle = -0.75 + Math.sin(phase) * 0.12;
            headTilt = 0.05;
          }
          break;
        }
        case 'jump':
          thighs[0] = 0.75;
          thighs[1] = -0.25;
          shins[0] = -1.1;
          shins[1] = -0.5;
          torsoLean = -0.08;
          break;
        case 'fall':
          thighs[0] = 0.35 + Math.sin(t * 9) * 0.06;
          thighs[1] = -0.15;
          shins[0] = -0.45;
          shins[1] = -0.6;
          torsoLean = 0.04;
          break;
        case 'crouch':
          hipY = 0.5;
          thighs[0] = 1.35;
          shins[0] = -1.45;
          feet[0] = 0.1;
          thighs[1] = -0.05;
          shins[1] = -1.55;
          feet[1] = 0.9;
          torsoLean = -0.18;
          break;
        case 'victory':
          aimAngle = 1.0;
          headTilt = 0.35;
          thighs[0] = 0.15;
          thighs[1] = -0.12;
          break;
        default: {
          // Idle: breathing and a relaxed, wide stance.
          const br = Math.sin(t * 1.7);
          hipY = 0.97 + br * 0.008;
          thighs[0] = 0.12;
          thighs[1] = -0.1;
          shins[0] = -0.08;
          shins[1] = -0.05;
          aimAngle += br * 0.02;
        }
      }
    }

    // Landing squash (heavy armor).
    hipY -= p.landImpact * 0.2;
    torsoLean -= p.landImpact * 0.15;
    if (p.landImpact > 0) {
      thighs[0] += p.landImpact * 0.4;
      shins[0] -= p.landImpact * 0.7;
      thighs[1] += p.landImpact * 0.25;
      shins[1] -= p.landImpact * 0.5;
    }

    // Aiming leans the torso slightly into the shot.
    if (!p.dead && p.rollT <= 0 && p.anim !== 'sprint') torsoLean += clamp(this.aimLocal, -1, 1) * 0.12;

    // Melee: wind up then butt-stroke forward.
    if (p.meleeT > 0) {
      const k = 1 - p.meleeT / MELEE_TIME;
      if (k < 0.25) aimAngle = lerp(aimAngle, 0.9, k / 0.25);
      else if (k < 0.5) aimAngle = lerp(0.9, -0.8, (k - 0.25) / 0.25);
      else aimAngle = lerp(-0.8, this.aimLocal, (k - 0.5) / 0.5);
      torsoLean += -Math.sin(k * Math.PI) * 0.35;
    }
    // Grenade throw: lower weapon, overhand arc with the grenade visible.
    if (p.throwT > 0) {
      const k = 1 - p.throwT / THROW_TIME;
      aimAngle = lerp(aimAngle, -1.0, Math.sin(k * Math.PI));
      torsoLean += Math.sin(k * Math.PI * 2) * 0.2;
      this.grenadeProp.visible = k < 0.32;
      const arc = k / 0.32;
      this.grenadeProp.position.set(-0.25 + arc * 0.6, 0.7 + Math.sin(arc * Math.PI) * 0.35, -0.3);
    } else {
      this.grenadeProp.visible = false;
    }
    // Weapon switch: drop out of frame then raise.
    if (p.switchT > 0 && p.switchDur > 0) {
      const k = 1 - p.switchT / p.switchDur;
      aimAngle = lerp(aimAngle, -1.3, Math.sin(k * Math.PI));
    }
    // Reload: tilt weapon up, support hand to the magazine.
    if (p.reloading) {
      const k = p.reloadProgress;
      const s = Math.sin(clamp(k, 0, 1) * Math.PI);
      aimAngle = lerp(aimAngle, 0.35, s * 0.8);
      supportRot = -0.7 * s;
      this.animateMag(k, true);
    } else {
      this.animateMag(0, false);
    }
    // Pump-action cycling after each shot.
    const pump = this.weapon?.getObjectByName('pump');
    if (pump) pump.position.x = 0.55 - Math.max(0, Math.sin(clamp(p.lastFire / 0.5, 0, 1) * Math.PI)) * 0.14 * (p.lastFire < 0.5 ? 1 : 0);
    // Charge glow on energy weapons.
    const core = this.weapon?.getObjectByName('core');
    if (core) {
      const s = 1 + p.charge * 0.9 + Math.sin(t * 30) * p.charge * 0.15;
      core.scale.setScalar(s);
      core.rotation.y += dt * (2 + p.charge * 14);
    }

    // Hurt flinch.
    this.hurtTilt = damp(this.hurtTilt, p.hurtT > 0 ? 0.22 : 0, 18, dt);
    torsoLean += this.hurtTilt;
    headTilt += this.hurtTilt * 0.8;

    // Lane-switch hop.
    if (p.laneT < 1) {
      hipY += Math.sin(p.laneT * Math.PI) * 0.12;
      torsoLean -= Math.sin(p.laneT * Math.PI) * 0.1;
    }

    // --- apply with smoothing
    const L = 22;
    this.hips.position.y = damp(this.hips.position.y, hipY, L, dt);
    this.torso.rotation.z = damp(this.torso.rotation.z, torsoLean, 14, dt);
    this.body.rotation.z = p.rollT > 0 ? this.rollSpin : damp(this.body.rotation.z, bodyRot, 8, dt);
    if (p.rollT > 0) this.body.position.y = 0;
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const ls = p.anim === 'run' || p.anim === 'sprint' ? 40 : 16;
      leg.thigh.rotation.z = damp(leg.thigh.rotation.z, thighs[i], ls, dt);
      leg.shin.rotation.z = damp(leg.shin.rotation.z, shins[i], ls, dt);
      leg.foot.rotation.z = damp(leg.foot.rotation.z, feet[i] - (thighs[i] + shins[i]) * 0.5, ls, dt);
    }
    this.head.rotation.z = damp(this.head.rotation.z, headTilt - torsoLean * 0.5, 14, dt);
    // The aim pivot is in torso space; compensate torso lean so the weapon points true.
    const aimTarget = aimAngle - this.torso.rotation.z + this.recoilOffset * 0.12;
    this.aim.rotation.z = dampAngle(this.aim.rotation.z, aimTarget, p.meleeT > 0 || p.switchT > 0 ? 30 : 40, dt);
    this.weaponMount.position.x = (this.weaponId === 'rocket' ? 0.1 : 0.32) - this.recoilOffset * 0.08;
    this.supportArm.rotation.z = damp(this.supportArm.rotation.z, supportRot, 14, dt);

    // Secondary motion: pauldrons lag behind acceleration, antenna springs.
    const accel = (p.vx - this.prevVx) / Math.max(dt, 1e-3);
    this.prevVx = p.vx;
    this.plateLag = damp(this.plateLag, clamp(-accel * 0.004 * facing, -0.25, 0.25) + (p.onGround ? 0 : 0.12), 10, dt);
    for (const pg of this.pauldrons) pg.rotation.z = this.plateLag + Math.sin(phase * 2) * 0.03 * (speed > 1 ? 1 : 0);
    const force = -accel * 0.002 * facing - this.antennaA * 60 - this.antennaV * 5;
    this.antennaV += force * dt;
    this.antennaA += this.antennaV * dt;
    this.antennaA = clamp(this.antennaA, -0.5, 0.5);
    this.antenna.rotation.z = this.antennaA - 0.1;

    // Shield shell: flashes on hits, shimmers while recharging.
    let op = 0;
    if (p.lastShieldHit < 0.35 && p.shieldFrac > 0) op = (1 - p.lastShieldHit / 0.35) * 0.55;
    if (p.shieldRecharging) op = Math.max(op, 0.12 + Math.sin(t * 20) * 0.06);
    this.shieldMat.opacity = op;
    this.shieldShell.visible = op > 0.01;
    this.shieldShell.position.y = p.crouching ? 0.7 : 1.0;
    this.shieldShell.scale.y = p.crouching ? 0.8 : 1.12;
    this.shieldShell.rotation.y += dt * 1.5;
  }

  private animateMag(k: number, active: boolean): void {
    const mag = this.weapon?.getObjectByName('mag');
    if (!mag) return;
    const base = (mag.userData.baseY ??= mag.position.y) as number;
    if (!active) {
      mag.position.y = base;
      mag.visible = true;
      return;
    }
    if (k < 0.25) {
      mag.position.y = base;
      mag.visible = true;
    } else if (k < 0.45) {
      mag.position.y = base - ((k - 0.25) / 0.2) * 0.45;
      mag.visible = k < 0.42;
    } else if (k < 0.72) {
      mag.visible = true;
      mag.position.y = base - 0.45 + ((k - 0.45) / 0.27) * 0.45;
    } else {
      mag.position.y = base;
    }
  }

  /** World-space positions of a few parts for death debris. */
  partMeshes(): THREE.Mesh[] {
    return this.materialsToTint;
  }

  dispose(): void {
    this.shieldShell.geometry.dispose();
    this.shieldMat.dispose();
    this.visorMat.dispose();
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
