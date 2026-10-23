// Synthesised sound effects. Each recipe layers oscillators and filtered noise to build
// weapon reports, explosions, armour foley, shields, alien voices and machinery.
import type { Surface, VocalKind } from '../core/events';
import { rand } from '../core/math';
import { AudioEngine, Bus, audio } from './engine';

type P = { x?: number; y?: number; volume?: number; pitch?: number; size?: number; charged?: boolean; surface?: Surface; kind?: string };

function o(bus: Bus, p: P, reverb = 0.2): GainNode {
  return audio.out(bus, { x: p.x, y: p.y, volume: p.volume ?? 1, reverb });
}

const A = (): AudioEngine => audio;

export const SFX = {
  // --- Weapons -------------------------------------------------------------
  ar(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.18);
    const pt = p.pitch ?? rand(0.94, 1.06);
    a.noiseBurst(t, 0.07, out, 0.55, { type: 'bandpass', f0: 1800 * pt, f1: 700, q: 0.7 });
    a.osc('sine', 150 * pt, 55, t, 0.09, out, 0.6);
    a.osc('square', 2400 * pt, 1200, t, 0.012, out, 0.08);
    a.noiseBurst(t + 0.01, 0.18, out, 0.18, { type: 'lowpass', f0: 900, f1: 200 });
  },
  br(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.22);
    const pt = p.pitch ?? rand(0.95, 1.05);
    a.noiseBurst(t, 0.08, out, 0.6, { type: 'bandpass', f0: 2300 * pt, f1: 800, q: 0.8 });
    a.osc('sine', 170 * pt, 50, t, 0.11, out, 0.7);
    a.osc('sawtooth', 900 * pt, 300, t, 0.03, out, 0.06);
    a.noiseBurst(t + 0.01, 0.22, out, 0.2, { type: 'lowpass', f0: 1100, f1: 200 });
  },
  shotgun(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.noiseBurst(t, 0.3, out, 0.9, { type: 'lowpass', f0: 5000, f1: 260 });
    a.osc('sine', 110, 38, t, 0.28, out, 0.9);
    a.osc('triangle', 260, 90, t, 0.06, out, 0.3);
    // Pump cycle.
    a.noiseBurst(t + 0.36, 0.05, out, 0.25, { type: 'bandpass', f0: 2600, q: 2 });
    a.noiseBurst(t + 0.47, 0.06, out, 0.3, { type: 'bandpass', f0: 1700, q: 2 });
    a.osc('square', 300, 200, t + 0.47, 0.03, out, 0.05);
  },
  sniper(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.5);
    a.noiseBurst(t, 0.03, out, 0.8, { type: 'highpass', f0: 3000 });
    a.osc('sine', 130, 35, t, 0.45, out, 0.9);
    a.noiseBurst(t, 0.9, out, 0.25, { type: 'lowpass', f0: 1400, f1: 120 });
    a.noiseBurst(t + 0.6, 0.08, out, 0.15, { type: 'bandpass', f0: 2000, q: 3 });
  },
  rocket(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.35);
    a.noiseBurst(t, 0.55, out, 0.7, { type: 'bandpass', f0: 400, f1: 1600, q: 0.9 }, false, 0.02);
    a.osc('sine', 90, 40, t, 0.3, out, 0.7);
    a.noiseBurst(t, 0.12, out, 0.4, { type: 'highpass', f0: 2000 });
  },
  plasma(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.25);
    const pt = p.pitch ?? rand(0.95, 1.08);
    if (p.charged) {
      a.osc('sawtooth', 1200 * pt, 120, t, 0.45, out, 0.35);
      a.osc('sine', 300, 60, t, 0.5, out, 0.6);
      a.noiseBurst(t, 0.4, out, 0.3, { type: 'bandpass', f0: 3000, f1: 600, q: 1.5 });
      return;
    }
    a.osc('square', 950 * pt, 210, t, 0.13, out, 0.14);
    a.osc('sine', 600 * pt, 140, t, 0.16, out, 0.35);
    a.noiseBurst(t, 0.1, out, 0.15, { type: 'bandpass', f0: 4000, f1: 1500, q: 2 });
  },
  prism(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    const pt = rand(0.9, 1.15);
    a.osc('sine', 1800 * pt, 1600, t, 0.25, out, 0.18);
    a.osc('sine', 2700 * pt, 2500, t, 0.18, out, 0.1);
    a.osc('triangle', 1100 * pt, 300, t, 0.08, out, 0.2);
  },
  threnShot(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.25);
    const pt = rand(0.9, 1.1);
    a.osc('triangle', 640 * pt, 170, t, 0.16, out, 0.3);
    a.osc('square', 320 * pt, 120, t, 0.1, out, 0.06);
    a.noiseBurst(t, 0.12, out, 0.12, { type: 'bandpass', f0: 2500, f1: 900, q: 3 });
  },
  droneShot(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.2);
    a.osc('square', 1500, 380, t, 0.09, out, 0.1);
    a.osc('sawtooth', 700, 200, t, 0.08, out, 0.08);
    a.noiseBurst(t, 0.05, out, 0.1, { type: 'highpass', f0: 3500 });
  },
  cannon(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.osc('sawtooth', 240, 70, t, 0.14, out, 0.25);
    a.osc('sine', 110, 40, t, 0.16, out, 0.5);
    a.noiseBurst(t, 0.12, out, 0.25, { type: 'lowpass', f0: 2500, f1: 300 });
  },
  missileLaunch(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.4);
    for (let i = 0; i < 4; i++) {
      a.noiseBurst(t + i * 0.12, 0.5, out, 0.5, { type: 'bandpass', f0: 500, f1: 2400, q: 1 }, false, 0.03);
      a.osc('sine', 160, 60, t + i * 0.12, 0.2, out, 0.4);
    }
  },
  missileWhistle(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.2);
    a.osc('sine', 2200, 700, t, 0.75, out, 0.07, 0.3, 'lin');
  },
  dryFire(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.05);
    a.noiseBurst(t, 0.03, out, 0.4, { type: 'bandpass', f0: 3500, q: 4 });
  },
  reload(phase: string, weaponId: string, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.1);
    const heavy = weaponId === 'rocket' || weaponId === 'sniper';
    switch (phase) {
      case 'start':
        a.noiseBurst(t, 0.12, out, 0.18, { type: 'bandpass', f0: 1200, q: 1 });
        break;
      case 'mag-out':
        a.noiseBurst(t, 0.04, out, 0.45, { type: 'bandpass', f0: 2600, q: 3 });
        a.noiseBurst(t + 0.06, 0.05, out, 0.35, { type: 'bandpass', f0: 1800, q: 3 });
        a.osc('triangle', 500, 300, t, 0.05, out, 0.1);
        break;
      case 'mag-in':
        a.noiseBurst(t, 0.05, out, 0.55, { type: 'bandpass', f0: heavy ? 1100 : 1900, q: 2 });
        a.osc('sine', heavy ? 140 : 220, 90, t, 0.08, out, 0.35);
        break;
      case 'done':
        a.noiseBurst(t, 0.04, out, 0.5, { type: 'bandpass', f0: 3000, q: 4 });
        a.noiseBurst(t + 0.07, 0.05, out, 0.5, { type: 'bandpass', f0: 2200, q: 4 });
        break;
    }
  },
  overheat(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.2);
    a.noiseBurst(t, 0.9, out, 0.35, { type: 'highpass', f0: 3000, f1: 6000 }, false, 0.02);
    a.osc('sine', 900, 200, t, 0.5, out, 0.12);
  },
  chargeUp(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.1);
    a.osc('sine', 260, 1400, t, 0.9, out, 0.12, 0.2);
    a.osc('square', 130, 700, t, 0.9, out, 0.03, 0.2);
  },
  switchWeapon(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.05);
    a.noiseBurst(t, 0.12, out, 0.2, { type: 'bandpass', f0: 1500, q: 0.8 });
    a.noiseBurst(t + 0.15, 0.04, out, 0.35, { type: 'bandpass', f0: 2800, q: 4 });
  },

  // --- Explosions & impacts ------------------------------------------------
  explosion(p: P = {}) {
    const a = A();
    const t = a.now;
    const size = p.size ?? 1;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * Math.min(1.4, 0.6 + size * 0.15) }, 0.55);
    a.osc('sine', 85, 26, t, 0.9 + size * 0.15, out, 1.0);
    a.noiseBurst(t, 1.2 + size * 0.2, out, 0.9, { type: 'lowpass', f0: 2600, f1: 120 }, true, 0.004);
    a.noiseBurst(t, 0.12, out, 0.6, { type: 'highpass', f0: 1500 });
    // Crackle tail and settling paper debris.
    for (let i = 0; i < 6; i++) {
      a.noiseBurst(t + 0.15 + Math.random() * 0.7, 0.03, out, 0.12, { type: 'bandpass', f0: rand(1500, 4000), q: 3 });
    }
    for (let i = 0; i < 4; i++) {
      a.noiseBurst(t + 0.5 + Math.random() * 0.8, 0.12, out, 0.04, { type: 'bandpass', f0: 3500, q: 1.2 });
    }
    if (p.kind === 'plasma') a.osc('sawtooth', 800, 60, t, 0.5, out, 0.15);
  },
  impact(p: P = {}) {
    const a = A();
    if (!a.allow('impact', 6, 0.05)) return;
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.6 }, 0.1);
    switch (p.surface) {
      case 'metal':
      case 'armor':
        a.osc('sine', rand(2200, 2800), 2000, t, 0.09, out, 0.12);
        a.osc('sine', rand(3800, 4400), 3600, t, 0.06, out, 0.06);
        a.noiseBurst(t, 0.03, out, 0.25, { type: 'highpass', f0: 2500 });
        break;
      case 'flesh':
        a.noiseBurst(t, 0.07, out, 0.4, { type: 'lowpass', f0: 900 });
        a.osc('sine', 220, 90, t, 0.06, out, 0.25);
        break;
      case 'shield':
        a.osc('sawtooth', 900, 1500, t, 0.08, out, 0.05);
        a.noiseBurst(t, 0.1, out, 0.25, { type: 'bandpass', f0: 3500, f1: 1800, q: 4 });
        break;
      case 'energy':
        a.osc('sine', 700, 200, t, 0.1, out, 0.15);
        break;
      default:
        a.noiseBurst(t, 0.05, out, 0.45, { type: 'lowpass', f0: 700 });
        a.noiseBurst(t, 0.03, out, 0.08, { type: 'bandpass', f0: 3200, q: 1.5 });
    }
  },

  // --- Shields & player foley ---------------------------------------------
  shieldHit(p: P = {}) {
    const a = A();
    if (!a.allow('shieldHit', 3, 0.08)) return;
    const t = a.now;
    const out = o('sfx', p, 0.15);
    a.noiseBurst(t, 0.12, out, 0.3, { type: 'bandpass', f0: 2500, f1: 4500, q: 5 });
    a.osc('sine', 820, 760, t, 0.15, out, 0.12);
  },
  shieldBreak(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.4);
    for (let i = 0; i < 7; i++) a.osc('sine', rand(2000, 5200), rand(1500, 3000), t + i * 0.012, rand(0.15, 0.4), out, 0.08);
    a.noiseBurst(t, 0.25, out, 0.5, { type: 'highpass', f0: 2800 });
    a.osc('sawtooth', 600, 120, t, 0.5, out, 0.12);
  },
  shieldRecharge(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.6 }, 0.2);
    a.osc('sine', 300, 1300, t, 1.3, out, 0.14, 0.3);
    a.osc('triangle', 150, 650, t, 1.3, out, 0.05, 0.3);
  },
  shieldFull(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.5 }, 0.3);
    a.osc('sine', 1046, 1046, t, 0.35, out, 0.12);
    a.osc('sine', 1568, 1568, t + 0.08, 0.4, out, 0.1);
  },
  heartbeat() {
    const a = A();
    const t = a.now;
    const out = a.out('ui', { volume: 0.7, reverb: 0 });
    a.osc('sine', 70, 40, t, 0.15, out, 0.8);
    a.osc('sine', 60, 35, t + 0.22, 0.15, out, 0.6);
  },
  footstep(p: P = {}) {
    const a = A();
    if (!a.allow('step' + (p.kind ?? ''), 4, 0.06)) return;
    const t = a.now;
    const heavy = p.size ?? 0.7;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * (0.3 + heavy * 0.35) }, 0.08);
    a.osc('sine', 95 * rand(0.9, 1.1), 45, t, 0.07, out, 0.6);
    a.noiseBurst(t, 0.05, out, 0.3, { type: 'lowpass', f0: 500 });
    if (p.surface === 'metal') {
      a.osc('sine', rand(380, 460), 300, t, 0.06, out, 0.12);
      a.osc('sine', rand(700, 800), 600, t, 0.04, out, 0.06);
    } else if (Math.random() < 0.3) {
      a.noiseBurst(t + 0.01, 0.04, out, 0.04, { type: 'bandpass', f0: 3200, q: 1.5 });
    }
  },
  jump(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.5 }, 0.05);
    a.noiseBurst(t, 0.09, out, 0.3, { type: 'bandpass', f0: 1200, q: 1 });
    a.osc('sawtooth', 280, 520, t, 0.07, out, 0.04);
  },
  land(p: P = {}) {
    const a = A();
    const t = a.now;
    const h = p.size ?? 0.5;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * (0.4 + h * 0.7) }, 0.15);
    a.osc('sine', 110, 35, t, 0.14 + h * 0.1, out, 0.9);
    a.noiseBurst(t, 0.1, out, 0.4, { type: 'lowpass', f0: 600 });
    a.noiseBurst(t + 0.02, 0.08, out, 0.1, { type: 'bandpass', f0: 2400, q: 1.2 });
  },
  whoosh(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.5 }, 0.05);
    a.noiseBurst(t, 0.25, out, 0.35, { type: 'bandpass', f0: 500, f1: 1800, q: 1.2 }, false, 0.05);
  },
  servo(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.4 }, 0.05);
    a.osc('sawtooth', 320, 640, t, 0.12, out, 0.05);
    a.noiseBurst(t, 0.18, out, 0.2, { type: 'bandpass', f0: 900, f1: 1800, q: 1 }, false, 0.04);
  },
  melee(hit: boolean, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.15);
    a.noiseBurst(t, 0.16, out, 0.35, { type: 'bandpass', f0: 600, f1: 2200, q: 1 }, false, 0.03);
    if (hit) {
      a.osc('sine', 140, 50, t + 0.03, 0.14, out, 0.9);
      a.noiseBurst(t + 0.03, 0.08, out, 0.6, { type: 'lowpass', f0: 1500 });
    }
  },
  grenadeThrow(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.05);
    a.noiseBurst(t, 0.03, out, 0.3, { type: 'bandpass', f0: 4000, q: 4 });
    a.noiseBurst(t + 0.08, 0.2, out, 0.25, { type: 'bandpass', f0: 700, f1: 1600, q: 1 }, false, 0.04);
  },
  grenadeBounce(p: P = {}) {
    const a = A();
    if (!a.allow('gb', 3, 0.1)) return;
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.6 }, 0.1);
    a.osc('sine', rand(900, 1200), 700, t, 0.07, out, 0.2);
    a.noiseBurst(t, 0.03, out, 0.15, { type: 'highpass', f0: 2000 });
  },
  grenadeStick(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.15);
    a.noiseBurst(t, 0.5, out, 0.25, { type: 'bandpass', f0: 3500, q: 2 });
    a.osc('square', 200, 400, t, 0.3, out, 0.05);
  },

  // --- Pickups, UI and world ------------------------------------------------
  pickup(kind: string, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = a.out('ui', { volume: 0.7, reverb: 0.15 });
    a.noiseBurst(t, 0.06, out, 0.15, { type: 'bandpass', f0: 2500, q: 1.2 });
    const notes = kind === 'health' ? [523, 659, 784] : kind === 'weapon' ? [392, 523] : kind === 'grenade' ? [440, 660] : [660, 880];
    notes.forEach((f, i) => a.osc('sine', f, f, t + i * 0.06, 0.25, out, 0.12));
    if (kind === 'weapon') {
      a.noiseBurst(t + 0.05, 0.04, out, 0.4, { type: 'bandpass', f0: 2600, q: 3 });
      a.noiseBurst(t + 0.14, 0.05, out, 0.4, { type: 'bandpass', f0: 1800, q: 3 });
    }
    void p;
  },
  intel() {
    const a = A();
    const t = a.now;
    const out = a.out('ui', { volume: 0.7, reverb: 0.3 });
    [880, 1175, 1318, 1760].forEach((f, i) => a.osc('sine', f, f, t + i * 0.07, 0.3, out, 0.1));
    for (let i = 0; i < 8; i++) a.osc('square', rand(1500, 3000), rand(1500, 3000), t + i * 0.025, 0.02, out, 0.02);
  },
  checkpoint() {
    const a = A();
    const t = a.now;
    const out = a.out('ui', { volume: 0.7, reverb: 0.4 });
    [587, 740, 880].forEach((f, i) => {
      a.osc('triangle', f, f, t + i * 0.12, 0.5, out, 0.12);
      a.osc('sine', f * 2, f * 2, t + i * 0.12, 0.4, out, 0.04);
    });
  },
  uiMove() {
    const a = A();
    if (!a.ctx) return;
    const t = a.now;
    const out = a.out('ui', { volume: 0.5, reverb: 0 });
    a.noiseBurst(t, 0.03, out, 0.15, { type: 'bandpass', f0: 3000, q: 2 });
    a.osc('sine', 1400, 1400, t, 0.04, out, 0.04);
  },
  uiSelect() {
    const a = A();
    if (!a.ctx) return;
    const t = a.now;
    const out = a.out('ui', { volume: 0.6, reverb: 0.1 });
    a.noiseBurst(t, 0.08, out, 0.25, { type: 'bandpass', f0: 1200, f1: 3000, q: 1.2 });
    a.osc('sine', 880, 1320, t, 0.1, out, 0.08);
  },
  uiBack() {
    const a = A();
    if (!a.ctx) return;
    const t = a.now;
    const out = a.out('ui', { volume: 0.6, reverb: 0.1 });
    a.osc('sine', 880, 520, t, 0.1, out, 0.08);
  },
  radioBlip() {
    const a = A();
    const t = a.now;
    const out = a.out('voice', { volume: 0.6, reverb: 0 });
    a.noiseBurst(t, 0.08, out, 0.25, { type: 'bandpass', f0: 2200, q: 2 });
    a.osc('sine', 1250, 1250, t + 0.02, 0.06, out, 0.08);
  },
  /** Garbled "radio voice" texture under a subtitle line (not literal speech). */
  radioVoice(duration: number, pitch: number) {
    const a = A();
    const t = a.now + 0.1;
    const out = a.out('voice', { volume: 0.25, reverb: 0.05 });
    const ctx = a.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.4;
    bp.connect(out);
    const syll = Math.floor(duration * 5.5);
    for (let i = 0; i < syll; i++) {
      const st = t + i / 5.5 + rand(-0.03, 0.03);
      const f = pitch * rand(0.85, 1.2);
      a.osc('sawtooth', f, f * rand(0.85, 1.1), st, rand(0.08, 0.16), bp, 0.08, 0.02);
    }
    a.noiseBurst(t, duration, out, 0.03, { type: 'bandpass', f0: 2500, q: 0.6 }, false, 0.1);
  },
  hazard(phase: string, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('ambience', p, 0.2);
    if (phase === 'warn') a.noiseBurst(t, 0.9, out, 0.25, { type: 'bandpass', f0: 600, f1: 2400, q: 2 }, false, 0.5);
    else if (phase === 'erupt') {
      a.noiseBurst(t, 1.3, out, 0.6, { type: 'bandpass', f0: 900, q: 0.7 }, true, 0.05);
      a.osc('sawtooth', 70, 60, t, 1.3, out, 0.08, 0.05);
    }
  },
  crumble(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.2);
    for (let i = 0; i < 6; i++) a.noiseBurst(t + i * 0.1, 0.05, out, 0.2, { type: 'bandpass', f0: rand(400, 1200), q: 2 });
  },
  rumble(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.noiseBurst(t, 1.0, out, 0.5, { type: 'lowpass', f0: 300 }, true, 0.05);
  },
  barrier(on: boolean, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.osc('sawtooth', on ? 60 : 240, on ? 240 : 50, t, 0.6, out, 0.12, 0.1);
    a.osc('sine', on ? 400 : 1200, on ? 1200 : 300, t, 0.6, out, 0.06, 0.1);
  },
  propBreak(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.2);
    a.noiseBurst(t, 0.25, out, 0.6, { type: 'bandpass', f0: 1500, q: 0.7 });
    a.osc('sine', 160, 60, t, 0.15, out, 0.4);
    for (let i = 0; i < 5; i++) a.noiseBurst(t + 0.1 + i * 0.05, 0.05, out, 0.08, { type: 'bandpass', f0: 3500, q: 2 });
  },

  // --- Voices ----------------------------------------------------------------
  vocal(type: string, kind: VocalKind, p: P = {}) {
    const a = A();
    if (!a.allow('vocal', 3, 0.3)) return;
    const t = a.now;
    const ctx = a.ctx!;
    const out = o('sfx', p, 0.3);
    if (type === 'drone') {
      const seq = kind === 'death' ? [880, 440, 220] : kind === 'alert' ? [1320, 990, 1320, 990] : [1200, 1600];
      seq.forEach((f, i) => a.osc('square', f, kind === 'death' ? f * 0.5 : f, t + i * 0.09, 0.08, out, 0.05));
      if (kind === 'death') a.noiseBurst(t, 0.6, out, 0.2, { type: 'bandpass', f0: 3000, q: 0.8 });
      return;
    }
    const big = type === 'ravager';
    const base = big ? rand(55, 75) : rand(130, 180);
    // Two formant filters over a buzzy source make an alien vocal tract.
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 6;
    const mix = ctx.createGain();
    mix.gain.value = big ? 2.2 : 1.6;
    f1.connect(mix);
    f2.connect(mix);
    let shaper: WaveShaperNode | null = null;
    if (big) {
      shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      shaper.curve = curve;
      mix.connect(shaper);
      shaper.connect(out);
    } else {
      mix.connect(out);
    }
    const syllables =
      kind === 'callout' ? 3 : kind === 'grenade' ? 4 : kind === 'taunt' ? 5 : kind === 'alert' ? 2 : kind === 'charge' ? 1 : kind === 'flee' ? 2 : 1;
    const dur = kind === 'death' ? 0.7 : kind === 'charge' ? 0.8 : big ? 0.5 : 0.18;
    for (let i = 0; i < syllables; i++) {
      const st = t + i * (dur * 0.9 + 0.03);
      const fStart = base * (kind === 'alert' || kind === 'grenade' ? 1.4 : 1) * rand(0.9, 1.15);
      const fEnd = kind === 'death' ? base * 0.5 : kind === 'pain' ? base * 1.6 : fStart * rand(0.8, 1.2);
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(fStart, st);
      src.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd), st + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.25, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      src.connect(g);
      g.connect(f1);
      g.connect(f2);
      const v1 = rand(400, 900);
      const v2 = rand(1100, 2200);
      f1.frequency.setValueAtTime(v1, st);
      f1.frequency.linearRampToValueAtTime(v1 * rand(0.6, 1.4), st + dur);
      f2.frequency.setValueAtTime(v2, st);
      f2.frequency.linearRampToValueAtTime(v2 * rand(0.6, 1.4), st + dur);
      src.start(st);
      src.stop(st + dur + 0.05);
    }
    if (big) a.noiseBurst(t, dur * syllables, out, 0.25, { type: 'lowpass', f0: 600 }, true, 0.05);
  },

  // --- Boss ------------------------------------------------------------------
  bossHorn(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 1.2 }, 0.7);
    const ctx = a.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.6);
    lp.frequency.linearRampToValueAtTime(300, t + 2.2);
    lp.connect(out);
    for (const f of [55, 82.4, 110, 55.4]) a.osc('sawtooth', f, f * 0.97, t, 2.4, lp, 0.18, 0.25);
  },
  bossStep(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.osc('sine', 60, 25, t, 0.4, out, 1);
    a.noiseBurst(t, 0.2, out, 0.4, { type: 'lowpass', f0: 400 });
    a.osc('sawtooth', 180, 260, t + 0.05, 0.25, out, 0.04, 0.05);
    a.osc('sine', rand(420, 500), 380, t, 0.12, out, 0.1);
  },
  bossCharge(dur: number, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.osc('sawtooth', 80, 900, t, dur, out, 0.08, dur * 0.8, 'exp');
    a.osc('sine', 200, 2000, t, dur, out, 0.06, dur * 0.8, 'exp');
  },
  bossBeam(dur: number, p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', p, 0.3);
    a.osc('sawtooth', 110, 105, t, dur, out, 0.15, 0.05);
    a.osc('square', 220, 215, t, dur, out, 0.05, 0.05);
    a.noiseBurst(t, dur, out, 0.3, { type: 'bandpass', f0: 1500, q: 1 }, false, 0.05);
  },
  alarm(p: P = {}) {
    const a = A();
    const t = a.now;
    const out = o('sfx', { ...p, volume: (p.volume ?? 1) * 0.5 }, 0.5);
    for (let i = 0; i < 3; i++) {
      a.osc('square', 660, 880, t + i * 0.5, 0.25, out, 0.05, 0.02, 'lin');
      a.osc('square', 880, 660, t + i * 0.5 + 0.25, 0.25, out, 0.05, 0.02, 'lin');
    }
  },
  sting(kind: 'victory' | 'death' | 'boss' | 'reveal') {
    const a = A();
    if (!a.ctx) return;
    const t = a.now;
    const out = a.out('music', { volume: 1, reverb: 0.6 });
    const chord = kind === 'victory' ? [146.8, 220, 293.7, 370, 440] : kind === 'death' ? [73.4, 110, 116.5, 146.8] : kind === 'reveal' ? [73.4, 110, 138.6, 164.8, 220] : [73.4, 77.8, 110, 146.8];
    const ctx = a.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(kind === 'death' ? 600 : 2400, t + 1.2);
    lp.connect(out);
    for (const f of chord) {
      a.osc('sawtooth', f, f, t, kind === 'reveal' ? 6 : 3.5, lp, 0.06, 0.6);
      a.osc('sawtooth', f * 1.004, f * 1.004, t, kind === 'reveal' ? 6 : 3.5, lp, 0.05, 0.6);
    }
    a.osc('sine', 55, 30, t, 1.4, out, 0.8);
    a.noiseBurst(t, 1.5, out, 0.3, { type: 'lowpass', f0: 500, f1: 80 }, true, 0.01);
  },
};
