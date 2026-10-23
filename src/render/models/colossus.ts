// CX-90 Colossus siege walker: a towering folded-metal-paper machine with reverse-jointed legs,
// a spinning autocannon, a shoulder missile pod, destructible chest armor over a reactor core,
// and a red sensor eye.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../../core/math';
import type { Colossus } from '../../game/boss/colossus';
import { box, card, chamfer, gem, glow, metalPaper, outline, paper, prism, stripes } from '../paper';

const HULL = 0x56604f;
const DARK = 0x2c312c;
const STEEL = 0x6f7a80;

interface WalkerLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

export class ColossusModel {
  readonly root = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private hull = new THREE.Group();
  private legs: WalkerLeg[] = [];
  private plate: THREE.Group;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private eyeMat: THREE.MeshBasicMaterial;
  private eye: THREE.Mesh;
  private cannonPivot = new THREE.Group();
  private barrels = new THREE.Group();
  private pod: THREE.Group;
  private podStub: THREE.Mesh;
  private podHatch = new THREE.Group();
  private tubeMats: THREE.MeshBasicMaterial[] = [];
  private t = 0;
  private flip = -1;
  private spin = 0;
  private spinV = 0;
  /** Cinematic entrance offset (applied by the boss view). */
  entranceZ = 0;
  private meshes: THREE.Mesh[] = [];
  private collapse = 0;

  constructor() {
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.hull);
    this.hull.position.y = 4.65;

    // Hull core block.
    const main = chamfer(3.8, 2.4, 3.0, metalPaper(HULL, 0.6, 0.35), 0.22);
    this.hull.add(main);
    outline(main, 0x0e100e, 0.5, 25);
    const top = card(
      [
        [-1.9, 0],
        [1.6, 0],
        [1.2, 0.5],
        [-1.6, 0.55],
      ],
      2.6,
      HULL,
      { metal: true },
    );
    top.position.y = 1.15;
    this.hull.add(top);
    const belly = card(
      [
        [-1.6, 0],
        [1.8, 0],
        [1.4, -0.6],
        [-1.2, -0.7],
      ],
      2.4,
      DARK,
    );
    belly.position.y = -1.15;
    this.hull.add(belly);
    for (const side of [1, -1]) {
      const st = box(3.2, 0.25, 0.04, stripes());
      st.position.set(0, -0.7, side * 1.52);
      this.hull.add(st);
      const panel = chamfer(1.4, 1.0, 0.1, metalPaper(STEEL, 0.5, 0.4), 0.25);
      panel.position.set(-0.6, 0.2, side * 1.53);
      this.hull.add(panel);
      const num = box(0.5, 0.35, 0.02, glow(0xffb340, 1.2));
      num.position.set(0.9, 0.5, side * 1.52);
      this.hull.add(num);
    }

    // Reactor core + chest plate.
    this.coreMat = glow(0xff7a2a, 3).clone();
    this.core = gem(0.62, this.coreMat, 1, 'ico');
    this.core.position.set(1.75, -0.05, 0);
    this.hull.add(this.core);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, wireframe: true }));
    cage.position.copy(this.core.position);
    this.hull.add(cage);
    this.plate = new THREE.Group();
    this.plate.position.set(2.05, 0, 0);
    this.hull.add(this.plate);
    const pl = chamfer(0.5, 2.0, 2.2, metalPaper(0x7d8270, 0.55, 0.4), 0.3);
    this.plate.add(pl);
    outline(pl, 0x0e100e, 0.5);
    const plStripe = box(0.52, 0.3, 2.22, stripes());
    plStripe.position.y = -0.7;
    this.plate.add(plStripe);
    for (const yy of [0.5, 0.1]) {
      const rivet = box(0.52, 0.06, 1.8, paper(DARK));
      rivet.position.y = yy;
      this.plate.add(rivet);
    }

    // Sensor head.
    const head = chamfer(1.2, 0.8, 1.2, metalPaper(DARK, 0.5, 0.4), 0.3);
    head.position.set(1.4, 1.45, 0);
    this.hull.add(head);
    this.eyeMat = glow(0xff2020, 3.2).clone();
    this.eye = gem(0.26, this.eyeMat, 0, 'oct');
    this.eye.position.set(2.0, 1.4, 0);
    this.eye.scale.set(0.6, 1, 1.4);
    this.hull.add(this.eye);
    const visorHood = card(
      [
        [0, 0],
        [0.6, -0.1],
        [0.5, 0.25],
        [0, 0.3],
      ],
      1.3,
      HULL,
    );
    visorHood.position.set(1.5, 1.6, 0);
    this.hull.add(visorHood);
    const ant = prism(0.03, 0.05, 1.6, 4, paper(0x111111));
    ant.position.set(0.6, 2.4, 0.9);
    this.hull.add(ant);
    const beacon = gem(0.08, glow(0xff3020, 3), 0, 'oct');
    beacon.position.set(0.6, 3.2, 0.9);
    this.hull.add(beacon);

    // Autocannon arm (on the camera-facing side).
    this.cannonPivot.position.set(1.4, -0.75, 1.75);
    this.hull.add(this.cannonPivot);
    const housing = chamfer(1.4, 0.7, 0.7, metalPaper(STEEL, 0.5, 0.4), 0.3);
    housing.position.x = 0.4;
    this.cannonPivot.add(housing);
    this.barrels.position.x = 1.1;
    this.cannonPivot.add(this.barrels);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = prism(0.07, 0.07, 1.3, 6, metalPaper(DARK, 0.4, 0.5));
      b.rotation.z = Math.PI / 2;
      b.position.set(0.55, Math.cos(a) * 0.2, Math.sin(a) * 0.2);
      this.barrels.add(b);
    }
    const ringF = prism(0.32, 0.32, 0.12, 8, metalPaper(STEEL, 0.5, 0.4));
    ringF.rotation.z = Math.PI / 2;
    ringF.position.x = 1.05;
    this.barrels.add(ringF);

    // Missile pod.
    this.pod = new THREE.Group();
    this.pod.position.set(-0.7, 1.7, -0.4);
    this.hull.add(this.pod);
    const podBox = chamfer(1.5, 1.0, 1.4, metalPaper(HULL, 0.6, 0.35), 0.25);
    this.pod.add(podBox);
    outline(podBox, 0x0e100e, 0.5);
    this.pod.add(this.podHatch);
    this.podHatch.position.set(0, 0.5, 0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const m = glow(0xff6020, 0.8).clone();
        this.tubeMats.push(m);
        const tube = box(0.24, 0.05, 0.24, m);
        tube.position.set(-0.4 + c * 0.4, 0.02, -0.4 + r * 0.4);
        this.podHatch.add(tube);
      }
    }
    const podStripe = box(1.52, 0.18, 1.42, stripes());
    podStripe.position.y = -0.3;
    this.pod.add(podStripe);
    this.podStub = chamfer(0.8, 0.4, 0.8, paper(0x1a1a1a), 0.3);
    this.podStub.position.copy(this.pod.position).add(new THREE.Vector3(0, -0.3, 0));
    this.podStub.visible = false;
    this.hull.add(this.podStub);

    // Reverse-jointed legs.
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(0, 3.5, side * 1.35);
      this.bodyPivot.add(hip);
      const hipJoint = prism(0.45, 0.45, 0.6, 8, metalPaper(STEEL, 0.5, 0.4));
      hipJoint.rotation.x = Math.PI / 2;
      hip.add(hipJoint);
      const thigh = chamfer(0.7, 1.9, 0.6, metalPaper(HULL, 0.6, 0.35), 0.3);
      thigh.position.set(0.35, -0.85, 0);
      thigh.rotation.z = 0.35;
      hip.add(thigh);
      outline(thigh, 0x0e100e, 0.45);
      const knee = new THREE.Group();
      knee.position.set(0.72, -1.75, 0);
      hip.add(knee);
      const kj = prism(0.32, 0.32, 0.7, 8, metalPaper(DARK, 0.5, 0.4));
      kj.rotation.x = Math.PI / 2;
      knee.add(kj);
      const shin = chamfer(0.5, 1.8, 0.5, metalPaper(STEEL, 0.55, 0.4), 0.3);
      shin.position.set(-0.3, -0.8, 0);
      shin.rotation.z = -0.35;
      knee.add(shin);
      const shinStripe = box(0.52, 0.3, 0.52, stripes());
      shinStripe.position.set(-0.2, -0.45, 0);
      shinStripe.rotation.z = -0.35;
      knee.add(shinStripe);
      const ankle = new THREE.Group();
      ankle.position.set(-0.6, -1.65, 0);
      knee.add(ankle);
      const foot = card(
        [
          [-0.7, 0],
          [0.9, 0],
          [0.7, 0.35],
          [-0.5, 0.4],
        ],
        0.9,
        DARK,
        { metal: true },
      );
      foot.position.y = -0.1;
      ankle.add(foot);
      for (const k of [-1, 1]) {
        const toe = card(
          [
            [0, 0],
            [0.4, 0],
            [0.3, 0.18],
          ],
          0.2,
          STEEL,
        );
        toe.position.set(0.8, -0.1, k * 0.3);
        ankle.add(toe);
      }
      this.legs.push({ hip, knee, ankle });
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        this.meshes.push(m);
      }
    });
  }

  parts(): THREE.Mesh[] {
    return this.meshes;
  }

  /** World position of the sensor eye (for beam effects). */
  eyeWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.eye.getWorldPosition(out);
  }

  barrelWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.barrels.localToWorld(out.set(1.15, 0, 0));
  }

  coreWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.core.getWorldPosition(out);
  }

  update(b: Colossus, dt: number): void {
    this.t += dt;
    const t = this.t;
    this.flip = damp(this.flip, b.facing, 6, dt);
    if (Math.abs(this.flip - b.facing) < 0.01) this.flip = b.facing;
    this.root.scale.x = Math.abs(this.flip) < 0.1 ? 0.1 * Math.sign(this.flip || 1) : this.flip;
    this.root.rotation.y = this.flip >= 0 ? -0.28 : 0.28;

    // Walk cycle.
    const ph = b.walkPhase;
    const walking = Math.abs(b.vx) > 0.1;
    let hullY = 4.65;
    let hullRoll = 0;
    let hullPitch = 0;
    const lift = [0, 0];
    const swing = [0, 0];
    if (walking) {
      for (let i = 0; i < 2; i++) {
        const p = ph + (i ? Math.PI : 0);
        swing[i] = Math.sin(p) * 0.28;
        lift[i] = Math.max(0, Math.cos(p)) * 0.35;
      }
      hullY += Math.abs(Math.sin(ph)) * 0.15 - 0.1;
      hullRoll = Math.sin(ph) * 0.03;
    } else {
      hullY += Math.sin(t * 1.3) * 0.04;
    }
    // Attack poses.
    const a = b.attack;
    const inTele = b.attackT < b.telegraph;
    if (a === 'stomp') {
      const k = inTele ? b.attackT / b.telegraph : 1 - clamp((b.attackT - b.telegraph) / 0.25, 0, 1);
      const legIdx = b.stompLeg * b.facing > 0 ? 0 : 1;
      lift[legIdx] = k * 1.1;
      swing[legIdx] = k * 0.4;
      hullPitch = -k * 0.08;
    }
    if (a === 'missiles') {
      const k = clamp(b.attackT / Math.max(0.01, b.telegraph), 0, 1);
      hullPitch = 0.08 * k;
      this.podHatch.position.y = 0.5 + k * 0.15;
    } else {
      this.podHatch.position.y = damp(this.podHatch.position.y, 0.5, 6, dt);
    }
    if (a === 'beam') hullPitch = inTele ? -0.04 : -0.06;
    if (b.staggerT > 0) {
      hullRoll += Math.sin(t * 22) * 0.04;
      hullPitch += 0.1;
      hullY -= 0.3;
    }
    if (b.dying) {
      this.collapse = clamp(b.dyingT / 3.4, 0, 1);
      hullRoll += Math.sin(t * 35) * 0.05 * (1 - this.collapse);
    }
    if (b.dead) this.collapse = 1;
    const c = this.collapse;
    hullY = lerp(hullY, 2.0, c * c);
    hullPitch = lerp(hullPitch, 0.35, c * c);

    this.hull.position.y = damp(this.hull.position.y, hullY, 8, dt);
    this.hull.rotation.x = damp(this.hull.rotation.x, hullRoll, 6, dt);
    this.hull.rotation.z = damp(this.hull.rotation.z, hullPitch, 6, dt);
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const hipTarget = swing[i] + lift[i] * 0.5 + c * 0.9;
      leg.hip.rotation.z = damp(leg.hip.rotation.z, hipTarget, 10, dt);
      leg.knee.rotation.z = damp(leg.knee.rotation.z, -lift[i] * 0.9 - c * 1.4, 10, dt);
      leg.ankle.rotation.z = damp(leg.ankle.rotation.z, -leg.hip.rotation.z - leg.knee.rotation.z, 12, dt);
      leg.hip.position.y = damp(leg.hip.position.y, 3.5 - (4.65 - this.hull.position.y), 10, dt);
    }

    // Cannon aim & spin.
    const aimLocal = b.facing > 0 ? b.aimAngle : Math.PI - b.aimAngle;
    const wrapped = Math.atan2(Math.sin(aimLocal), Math.cos(aimLocal));
    const cannonTarget = a === 'cannon' ? clamp(wrapped, -0.9, 0.7) : -0.25;
    this.cannonPivot.rotation.z = damp(this.cannonPivot.rotation.z, cannonTarget - this.hull.rotation.z, 8, dt);
    const spinTarget = a === 'cannon' ? (inTele ? 8 + (b.attackT / b.telegraph) * 20 : 30) : 0;
    this.spinV = damp(this.spinV, spinTarget, 3, dt);
    this.spin += this.spinV * dt;
    this.barrels.rotation.x = this.spin;

    // Armor & pod state.
    this.plate.visible = !b.plateBroken;
    this.pod.visible = !b.podBroken;
    this.podStub.visible = b.podBroken;
    const podGlow = a === 'missiles' && inTele ? 2 + Math.sin(t * 30) * 1 : 0.6;
    for (const m of this.tubeMats) m.color.setHex(0xff6020).multiplyScalar(podGlow);

    // Core & eye glow.
    const heat = b.coreHeat + (b.ventT > 0 ? 0.6 + Math.sin(t * 20) * 0.3 : 0);
    this.coreMat.color.setHex(b.ventT > 0 ? 0xffd080 : 0xff7a2a).multiplyScalar(2.2 + heat * 2.5 + Math.sin(t * 6) * 0.3);
    this.core.rotation.y += dt * (1 + heat * 3);
    this.core.scale.setScalar(1 + Math.sin(t * 8) * 0.04 * heat);
    const beamCharge = a === 'beam' ? (inTele ? b.beamCharge : 1) : 0;
    const flash = b.hitFlash > 0 && b.hitPart === 'eye' ? 3 : 0;
    this.eyeMat.color.setHex(0xff2020).multiplyScalar(3 + beamCharge * 6 + flash + (b.dying ? Math.random() * 4 : 0));
    this.eye.scale.set(0.6 + beamCharge * 0.4, 1 + beamCharge * 0.5, 1.4 + beamCharge * 0.5);
    if (b.dead) this.eyeMat.color.setHex(0x200000);
  }

  dispose(): void {
    this.coreMat.dispose();
    this.eyeMat.dispose();
    for (const m of this.tubeMats) m.dispose();
  }
}
