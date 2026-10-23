// Adaptive procedural score in D minor: string pads, low drones, a formant choir,
// celesta motifs for exploration, spiccato ostinato and war drums for combat, and brass
// stabs for the boss. Layers cross-fade with the director's intensity (0 menu → 3 boss).
import { rand } from '../core/math';
import { audio } from './engine';

const BPM = 92;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// Chord progression (root MIDI + chord tones as semitone offsets).
const PROGRESSION: Array<{ root: number; tones: number[] }> = [
  { root: 50, tones: [0, 3, 7] }, // Dm
  { root: 46, tones: [0, 4, 7] }, // Bb
  { root: 53, tones: [0, 4, 7] }, // F
  { root: 48, tones: [0, 4, 7] }, // C
  { root: 50, tones: [0, 3, 7] }, // Dm
  { root: 46, tones: [0, 4, 7] }, // Bb
  { root: 43, tones: [0, 3, 7] }, // Gm
  { root: 45, tones: [0, 4, 7] }, // A
];
const SCALE = [0, 2, 3, 5, 7, 8, 10];

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type Layer = 'pad' | 'drone' | 'choir' | 'bells' | 'ostinato' | 'drums' | 'brass';

const LAYER_LEVELS: Record<Layer, number[]> = {
  //          int0  int1  int2  int3
  pad: [0.7, 0.8, 0.85, 0.9],
  drone: [0.4, 0.6, 0.8, 1.0],
  choir: [0.6, 0.35, 0.3, 0.8],
  bells: [0.6, 0.7, 0.0, 0.0],
  ostinato: [0, 0, 0.8, 1.0],
  drums: [0, 0, 0.85, 1.0],
  brass: [0, 0, 0.25, 0.9],
};

export class Music {
  private gains = new Map<Layer, GainNode>();
  private nextBar = 0;
  private barIndex = 0;
  private intensity = 0;
  private playing = false;
  private timer: number | null = null;
  private output: GainNode | null = null;

  start(intensity = 0): void {
    if (!audio.ctx) return;
    const ctx = audio.ctx;
    if (!this.output) {
      this.output = audio.out('music', { volume: 1, reverb: 0.55 });
      for (const l of Object.keys(LAYER_LEVELS) as Layer[]) {
        const g = ctx.createGain();
        g.gain.value = 0;
        g.connect(this.output);
        this.gains.set(l, g);
      }
    }
    this.intensity = intensity;
    this.applyLevels(0.5);
    if (this.playing) return;
    this.playing = true;
    this.nextBar = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  stop(fade = 1.5): void {
    if (!audio.ctx || !this.playing) return;
    const t = audio.ctx.currentTime;
    for (const g of this.gains.values()) g.gain.setTargetAtTime(0, t, fade / 3);
    window.setTimeout(() => {
      this.playing = false;
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
    }, fade * 1000);
  }

  setIntensity(i: number): void {
    if (i === this.intensity) return;
    this.intensity = i;
    this.applyLevels(i > 1 ? 0.6 : 2.5);
  }

  private applyLevels(time: number): void {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const idx = Math.max(0, Math.min(3, Math.round(this.intensity)));
    for (const [l, g] of this.gains) g.gain.setTargetAtTime(LAYER_LEVELS[l][idx], t, time / 3);
  }

  private level(l: Layer): number {
    const idx = Math.max(0, Math.min(3, Math.round(this.intensity)));
    return LAYER_LEVELS[l][idx];
  }

  private schedule(): void {
    const ctx = audio.ctx;
    if (!ctx || !this.playing) return;
    while (this.nextBar < ctx.currentTime + 0.3) {
      this.scheduleBar(this.nextBar, this.barIndex);
      this.nextBar += BAR;
      this.barIndex++;
    }
  }

  private scheduleBar(t: number, bar: number): void {
    const chord = PROGRESSION[Math.floor(bar / 2) % PROGRESSION.length];
    const newChord = bar % 2 === 0;
    const a = audio;
    const g = (l: Layer) => this.gains.get(l)!;

    // String pad (on chord change, sustained 2 bars).
    if (newChord && this.level('pad') > 0) {
      const lp = a.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700 + this.intensity * 500;
      lp.Q.value = 0.6;
      lp.connect(g('pad'));
      for (const tone of chord.tones) {
        const f = mtof(chord.root + tone + 12);
        this.sustain('sawtooth', f, t, BAR * 2, lp, 0.035, 1.0);
        this.sustain('sawtooth', f * 1.006, t, BAR * 2, lp, 0.03, 1.0);
      }
    }
    // Drone / bass.
    if (newChord && this.level('drone') > 0) {
      const lp = a.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      lp.connect(g('drone'));
      const f = mtof(chord.root - 12);
      this.sustain('sawtooth', f, t, BAR * 2, lp, 0.12, 0.4);
      this.sustain('sine', f / 2, t, BAR * 2, g('drone'), 0.18, 0.4);
    }
    // Choir "aah" on alternate chords.
    if (newChord && this.level('choir') > 0 && (bar / 2) % 2 === 0) {
      const ctx = a.ctx!;
      const formants = [700, 1150, 2600];
      const bus = ctx.createGain();
      bus.gain.value = 0.9;
      for (const ff of formants) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = 8;
        bus.connect(bp);
        bp.connect(g('choir'));
      }
      for (const tone of chord.tones) {
        const f = mtof(chord.root + tone + 12);
        this.sustain('sawtooth', f, t, BAR * 2, bus, 0.09, 1.5, 5);
        this.sustain('sawtooth', f * 0.997, t + 0.05, BAR * 2, bus, 0.07, 1.5, 4.5);
      }
    }
    // Exploration celesta: sparse notes from the scale.
    if (this.level('bells') > 0) {
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.38) {
          const deg = SCALE[Math.floor(Math.random() * SCALE.length)];
          const f = mtof(62 + deg + (Math.random() < 0.3 ? 12 : 0));
          const st = t + i * BEAT + (Math.random() < 0.3 ? BEAT / 2 : 0);
          a.osc('sine', f, f, st, 1.6, g('bells'), 0.07, 0.005);
          a.osc('sine', f * 3, f * 3, st, 0.5, g('bells'), 0.015, 0.005);
        }
      }
    }
    // Spiccato ostinato: chord-tone 8ths.
    if (this.level('ostinato') > 0) {
      const lp = a.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.connect(g('ostinato'));
      const pattern = [0, 2, 1, 2, 0, 2, 1, 2];
      for (let i = 0; i < 8; i++) {
        const tone = chord.tones[pattern[i] % chord.tones.length];
        const f = mtof(chord.root + tone + (i % 4 === 3 ? 12 : 0));
        a.osc('sawtooth', f, f, t + (i * BEAT) / 2, 0.16, lp, 0.05, 0.004);
      }
    }
    // War drums.
    if (this.level('drums') > 0) {
      const boss = this.intensity >= 3;
      const kicks = boss ? [0, 1.5, 2, 3, 3.5] : [0, 2, 2.75];
      for (const k of kicks) this.taiko(t + k * BEAT, g('drums'), k === 0 ? 1 : 0.7);
      for (const s of boss ? [1, 3] : [3]) this.snare(t + s * BEAT, g('drums'), boss ? 0.5 : 0.3);
      if (bar % 4 === 3) for (let i = 0; i < 4; i++) this.taiko(t + (3 + i * 0.25) * BEAT, g('drums'), 0.4 + i * 0.12, 1.4);
    }
    // Brass stabs on chord changes.
    if (newChord && this.level('brass') > 0) {
      const ctx = a.ctx!;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.linearRampToValueAtTime(2200, t + 0.15);
      lp.frequency.exponentialRampToValueAtTime(500, t + 1.2);
      lp.connect(g('brass'));
      for (const tone of chord.tones) {
        const f = mtof(chord.root + tone);
        a.osc('sawtooth', f, f, t, 1.4, lp, 0.06, 0.03);
        a.osc('sawtooth', f * 1.005, f * 1.005, t, 1.4, lp, 0.05, 0.03);
      }
    }
  }

  private sustain(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, gain: number, attack: number, vibrato = 0): void {
    const ctx = audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(4.5, 5.5);
      const lg = ctx.createGain();
      lg.gain.value = vibrato;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 1.6);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 1.6);
  }

  private taiko(t: number, dest: AudioNode, vel: number, pitch = 1): void {
    const a = audio;
    a.osc('sine', 95 * pitch, 42 * pitch, t, 0.45, dest, 0.7 * vel);
    a.noiseBurst(t, 0.06, dest, 0.25 * vel, { type: 'lowpass', f0: 1200 });
  }

  private snare(t: number, dest: AudioNode, vel: number): void {
    const a = audio;
    a.noiseBurst(t, 0.18, dest, 0.35 * vel, { type: 'bandpass', f0: 1800, q: 0.8 });
    a.osc('triangle', 220, 160, t, 0.08, dest, 0.2 * vel);
  }
}

export const music = new Music();
