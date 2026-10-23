// Mission 01 cinematics: the dropship insertion & crash, the Colossus entrance and the
// finale where the structure beneath Halden opens.
import * as THREE from 'three';
import { clamp, easeInCubic, easeInOutCubic, lerp, rand } from '../core/math';
import type { World } from '../game/world';
import type { LevelScene } from '../render/environment/levelScene';
import { buildDropship } from '../render/models/props';
import { Shape } from '../render/particles';
import type { Renderer } from '../render/renderer';
import type { GameView } from '../render/views';
import type { Radio } from '../ui/radio';
import { Cutscene } from './cutscene';

export interface CineHost {
  world: World;
  view: GameView;
  renderer: Renderer;
  level: LevelScene;
  radio: Radio;
  setLetterbox(on: boolean): void;
  fade(to: number, time: number): void;
  flash(strength: number): void;
  titleCard(a: string, b: string, c: string, duration: number): void;
  shake(amount: number): void;
  music(intensity: number): void;
  sting(kind: 'victory' | 'death' | 'boss' | 'reveal'): void;
  sound(name: string, x?: number): void;
}

export function introCutscene(h: CineHost): Cutscene {
  const cs = new Cutscene('intro');
  const w = h.world;
  const p = w.player;
  const pv = h.view.playerView!;
  const ship = buildDropship(false);
  ship.scale.setScalar(0.9);
  h.renderer.scene.add(ship);
  const start = new THREE.Vector3(-90, 22, -40);
  const mid = new THREE.Vector3(-6, 15, -34);
  const crash = new THREE.Vector3(2, 1.5, -6.6);
  let hitPos = mid.clone();
  ship.position.copy(start);
  w.cinematic = true;
  p.frozen = true;
  pv.prone = 1;
  pv.hidden = true;
  h.setLetterbox(true);
  h.fade(1, 0);

  const followShip = (offset: THREE.Vector3, k = 1) => {
    cs.shot.pos.copy(ship.position).add(offset);
    cs.shot.target.copy(ship.position).lerp(new THREE.Vector3(ship.position.x + 14, ship.position.y - 2, ship.position.z), 0.3 * k);
    cs.shot.fov = 42;
    cs.hasCamera = true;
  };

  cs.camera(0, 2, { pos: [-70, 9, 26], target: [-50, 19, -40], fov: 42 }, { pos: [-66, 10, 26], target: [-46, 19, -40], fov: 42 })
    .at(0.2, () => {
      h.fade(0, 2.5);
      h.music(0);
      h.titleCard('TESKARIS · OUTER RIM', 'HALDEN BASIN', '0347 LOCAL · 40 HOURS SINCE LAST CONTACT', 5);
    })
    // Dropship flight.
    .during(0, 13.5, (k) => {
      const e = k;
      ship.position.lerpVectors(start, mid, e);
      ship.position.y += Math.sin(e * 9) * 0.4;
      ship.rotation.z = -0.06 + Math.sin(e * 6) * 0.03;
      ship.rotation.y = 0.15;
      engineTrail(h, ship);
    })
    .during(2, 13.5, (k) => followShip(new THREE.Vector3(lerp(-12, 6, k), lerp(-3, -1, k), 30), k))
    .at(2.2, () => h.radio.push('intro_1'))
    .at(7.2, () => h.radio.push('intro_2'))
    .at(11.6, () => h.radio.push('intro_3'))
    // Plasma flak.
    .during(11.5, 15, (k) => {
      if (Math.random() < 0.35 + k * 0.4) flak(h, ship.position);
    })
    .at(12.6, () => h.radio.push('intro_4'))
    .at(13.2, () => {
      h.view.fx.explosion(ship.position.x + 3, ship.position.y + 2, ship.position.z, 2, 'plasma');
      h.shake(0.3);
    })
    .at(14.0, () => {
      hitPos = ship.position.clone();
      h.view.fx.explosion(ship.position.x, ship.position.y + 0.5, ship.position.z + 1, 3.2, 'plasma');
      h.shake(0.7);
      h.radio.push('intro_5');
    })
    // Spiral down behind the ridge.
    .during(14, 18, (k) => {
      const e = easeInCubic(k);
      ship.position.set(lerp(hitPos.x, crash.x, k), lerp(hitPos.y, crash.y, e), lerp(hitPos.z, crash.z, k));
      ship.rotation.z = -0.2 - e * 0.9;
      ship.rotation.x = Math.sin(k * 12) * 0.25;
      ship.rotation.y = 0.15 + k * 1.2;
      for (let i = 0; i < 2; i++) {
        h.renderer.alpha.spawn({ x: ship.position.x + rand(-1, 1), y: ship.position.y + rand(-0.5, 1), z: ship.position.z, vy: rand(1, 2), life: rand(1.5, 2.5), size0: 1, size1: 3.5, r: 0.12, g: 0.1, b: 0.12, a0: 0.7, a1: 0, rot: rand(0, 6), shape: Shape.Smoke });
      }
      h.renderer.additive.spawn({ x: ship.position.x - 2, y: ship.position.y + 0.5, z: ship.position.z + 1, vy: 2, life: 0.4, size0: 1.6, size1: 0.3, r: 2, g: 0.9, b: 0.3, a0: 1, a1: 0, shape: Shape.Glow });
      h.renderer.lightPool.push({ x: ship.position.x, y: ship.position.y, z: ship.position.z + 2, color: 0xff7a2a, intensity: 30, distance: 16 });
    })
    .camera(14, 18.2, { pos: [28, 12, 34], target: [-6, 8, -20], fov: 38 }, { pos: [20, 7, 30], target: [2, 2, -6], fov: 38 })
    .at(17.9, () => {
      h.view.fx.explosion(crash.x, crash.y + 1, crash.z + 1, 6, 'boss');
      h.shake(1.2);
      h.flash(0.9);
      h.sound('crash', crash.x);
      ship.visible = false;
    })
    .at(18.4, () => h.fade(1, 0.8))
    .at(19.6, () => h.radio.push('wake_1'))
    // Wake up at the crash site.
    .at(20.8, () => {
      pv.hidden = false;
      h.renderer.scene.remove(ship);
      h.fade(0, 2.2);
      h.music(1);
    })
    .camera(20.8, 25.5, { pos: [5.2, 1.4, 6.5], target: [1.4, 0.7, 0], fov: 30 }, { pos: [3.4, 2.2, 9.5], target: [2.2, 1.3, 0], fov: 34 })
    .during(22.2, 24.2, (k) => {
      pv.prone = 1 - easeInOutCubic(k);
    })
    .at(22.5, () => h.radio.push('wake_2'))
    .at(25.4, () => h.radio.push('wake_3'))
    .at(26, () => {})
    .onSkip(() => {
      h.renderer.scene.remove(ship);
      h.radio.clear();
      h.fade(0, 0.6);
      h.music(1);
      h.radio.push('wake_3');
    })
    .onEnd(() => {
      h.renderer.scene.remove(ship);
      pv.prone = 0;
      pv.hidden = false;
      p.frozen = false;
      w.cinematic = false;
      h.setLetterbox(false);
      h.titleCard('MISSION 01', 'LANDFALL', 'REACH HALDEN STATION', 4);
    });
  return cs;
}

function engineTrail(h: CineHost, ship: THREE.Object3D): void {
  ship.updateMatrixWorld(true);
  ship.traverse((o) => {
    if (o.name !== 'engine') return;
    const p = o.getWorldPosition(tmpV);
    h.renderer.additive.spawn({ x: p.x - 0.6, y: p.y, z: p.z, vx: -6, life: 0.3, size0: 0.9, size1: 0.1, r: 0.8, g: 1.8, b: 2.6, a0: 0.8, a1: 0, shape: Shape.Glow });
    h.renderer.lightPool.push({ x: p.x, y: p.y, z: p.z, color: 0x7fd0ff, intensity: 14, distance: 10 });
  });
}

function flak(h: CineHost, target: THREE.Vector3): void {
  const sx = target.x + rand(-25, 10);
  const sy = -2;
  const sz = target.z + rand(-6, 6);
  const tx = target.x + rand(-6, 10);
  const ty = target.y + rand(-3, 4);
  const d = Math.hypot(tx - sx, ty - sy);
  const sp = 38;
  h.renderer.additive.spawn({
    x: sx,
    y: sy,
    z: sz,
    vx: ((tx - sx) / d) * sp,
    vy: ((ty - sy) / d) * sp,
    vz: (target.z - sz) / (d / sp),
    life: d / sp,
    size0: 0.45,
    len: 3,
    stretch: true,
    r: 0.9,
    g: 2.6,
    b: 0.5,
    a0: 1,
    a1: 1,
    shape: Shape.Glow,
  });
  window.setTimeout(() => {
    h.renderer.additive.spawn({ x: tx, y: ty, z: target.z, life: 0.35, size0: 1.5, size1: 4, r: 1, g: 2.6, b: 0.6, a0: 0.9, a1: 0, shape: Shape.Glow });
    h.renderer.additive.spawn({ x: tx, y: ty, z: target.z, life: 0.3, size0: 0.8, size1: 5, r: 0.8, g: 2, b: 0.5, a0: 0.6, a1: 0, shape: Shape.Ring });
    h.renderer.lightPool.flash(tx, ty, target.z, 0x9dff4a, 25, 18, 0.3);
    h.sound('flak', tx);
  }, (d / sp) * 1000);
}

export function bossIntroCutscene(h: CineHost): Cutscene {
  const cs = new Cutscene('boss_intro');
  const w = h.world;
  const p = w.player;
  const lb = w.level.boss!;
  w.cinematic = true;
  p.frozen = true;
  const boss = w.spawnBoss()!;
  boss.facing = -1;
  const startX = lb.arena.right + 6;
  boss.x = boss.px = startX;
  const bv = h.view.bossView;
  if (bv) bv.model.entranceZ = -7;
  h.setLetterbox(true);
  const cx = lb.x - 4;

  cs.camera(0, 2.5, { pos: [p.x + 2, 4, 20], target: [p.x + 6, 3, 0], fov: 36 }, { pos: [cx - 4, 6, 32], target: [cx + 4, 5, -3], fov: 40 })
    .at(0.1, () => {
      h.sound('rumble', lb.x);
      h.shake(0.3);
      h.music(2);
    })
    .at(0.8, () => {
      h.sound('alarm', lb.x);
      h.shake(0.4);
    })
    .at(1.4, () => {
      h.view.fx.explosion(lb.arena.right + 1, lb.y + 4, -1.6, 4, 'tank');
      h.view.fx.explosion(lb.arena.right + 1, lb.y + 8, -2.5, 3, 'small');
      h.shake(0.8);
      h.radio.push('boss_1');
    })
    .during(1.6, 5.2, (k, dt) => {
      boss.px = boss.x;
      boss.x = lerp(startX, lb.x, easeInOutCubic(k));
      boss.walkPhase += dt * 2.6;
      boss.vx = -2;
      if (bv) bv.model.entranceZ = lerp(-7, 0, easeInOutCubic(k));
      if (Math.floor(boss.walkPhase / Math.PI) !== Math.floor((boss.walkPhase - dt * 2.6) / Math.PI)) {
        w.events.emit('footstep', { x: boss.x, y: boss.y, z: boss.z, heavy: 3, isPlayer: false, surface: 'metal' });
        h.shake(0.35);
      }
    })
    .camera(2.5, 5.5, { pos: [cx - 4, 6, 32], target: [cx + 4, 5, -3], fov: 40 }, { pos: [cx - 6, 3.5, 24], target: [lb.x, 5.5, -1], fov: 38 })
    .at(5.3, () => {
      boss.vx = 0;
      h.sound('horn', boss.x);
      h.titleCard('ROGUE SIEGE WALKER', 'CX-90 COLOSSUS', 'DESTROY THE ARMOR · STRIKE THE CORE', 3.5);
      h.shake(0.6);
      h.radio.push('boss_2');
    })
    .camera(5.5, 8, { pos: [cx - 6, 3.5, 24], target: [lb.x, 5.5, -1], fov: 38 }, { pos: [p.x + 6, 5, 28], target: [p.x + 8, 3, 0], fov: 36 })
    .at(8, () => {})
    .onSkip(() => {
      boss.x = boss.px = lb.x;
      boss.vx = 0;
      if (bv) bv.model.entranceZ = 0;
    })
    .onEnd(() => {
      if (bv) bv.model.entranceZ = 0;
      boss.vx = 0;
      p.frozen = false;
      w.cinematic = false;
      h.setLetterbox(false);
      w.activateBoss();
      w.objective = { text: 'Destroy the Colossus' };
      w.events.emit('objective', { text: 'Destroy the Colossus' });
      h.music(3);
    });
  return cs;
}

export function outroCutscene(h: CineHost, onDone: () => void): Cutscene {
  const cs = new Cutscene('outro');
  const w = h.world;
  const p = w.player;
  w.cinematic = true;
  p.frozen = true;
  p.victory = true;
  h.setLetterbox(true);
  const px = p.x;
  cs.camera(0, 4, { pos: [px + 3, 2.4, 10], target: [px, 1.6, 0], fov: 34 }, { pos: [px - 2, 3, 14], target: [px, 2.2, 0], fov: 36 })
    .at(0.3, () => {
      h.radio.clear();
      h.radio.push('end_1');
      h.music(1);
    })
    .at(3.4, () => {
      h.radio.push('end_2');
      h.sound('rumble', px);
      h.shake(0.5);
    })
    .during(3.4, 16, () => {
      if (Math.random() < 0.05) h.shake(0.25);
    })
    .camera(4, 9, { pos: [px - 2, 3, 14], target: [px, 2.2, 0], fov: 36 }, { pos: [px - 14, 6, 34], target: [px + 20, 40, -300], fov: 46 })
    .at(6, () => {
      h.radio.push('end_3');
      h.sting('reveal');
    })
    .during(6, 15, (k) => h.level.backdrop.awaken(clamp(k * 1.1, 0, 1)))
    .at(9, () => h.radio.push('end_4'))
    .at(9.5, () => {
      h.flash(0.5);
      h.shake(0.6);
    })
    .camera(9, 16, { pos: [px - 14, 6, 34], target: [px + 20, 40, -300], fov: 46 }, { pos: [px - 18, 4, 40], target: [px + 20, 55, -300], fov: 50 })
    .at(12.5, () => h.radio.push('end_5'))
    .at(17.5, () => h.radio.push('end_6'))
    .camera(16, 21, { pos: [px - 18, 4, 40], target: [px + 20, 55, -300], fov: 50 }, { pos: [px + 2, 2.2, 9], target: [px + 4, 2.6, -4], fov: 34 })
    .at(16.2, () => {
      p.victory = false;
      p.facing = 1;
    })
    .at(20.5, () => h.titleCard('', 'TO BE CONTINUED', 'THE CREASE HAS OPENED', 4))
    .at(23.5, () => h.fade(1, 1.6))
    .at(25.5, () => {})
    .onSkip(() => {
      h.level.backdrop.awaken(1);
      h.radio.clear();
    })
    .onEnd(() => {
      w.cinematic = false;
      onDone();
    });
  return cs;
}

const tmpV = new THREE.Vector3();
