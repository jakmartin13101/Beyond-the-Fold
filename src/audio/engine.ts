// Web Audio engine: buses (music / sfx / voice / ambience), procedural reverb, stereo
// positioning relative to the camera, and shared noise buffers. All sound in the game is
// synthesised at runtime — there are no audio files.

export type Bus = 'sfx' | 'music' | 'voice' | 'ambience' | 'ui';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses = {} as Record<Bus, GainNode>;
  reverbSend!: GainNode;
  private compressor!: DynamicsCompressorNode;
  noise!: AudioBuffer;
  pink!: AudioBuffer;
  listenerX = 0;
  listenerY = 0;
  private volumes = { master: 0.8, music: 0.6, sfx: 0.85, voice: 0.8 };
  private recent = new Map<string, number[]>();
  muted = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);
    for (const b of ['sfx', 'music', 'voice', 'ambience', 'ui'] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    // Reverb.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(conv);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    conv.connect(wet);
    wet.connect(this.master);
    this.noise = this.makeNoise(2, false);
    this.pink = this.makeNoise(2, true);
    this.applyVolumes();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setVolumes(v: { master: number; music: number; sfx: number; voice: number }): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.volumes;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v.master, t, 0.05);
    this.buses.music.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(v.sfx * 0.9, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(v.sfx * 0.5, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(v.voice, t, 0.05);
    this.buses.ui.gain.setTargetAtTime(v.sfx * 0.7, t, 0.05);
  }

  /** Duck everything except UI (pause menu). */
  duck(on: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.volumes;
    this.buses.sfx.gain.setTargetAtTime(on ? v.sfx * 0.15 : v.sfx * 0.9, t, 0.1);
    this.buses.ambience.gain.setTargetAtTime(on ? v.sfx * 0.1 : v.sfx * 0.5, t, 0.1);
    this.buses.music.gain.setTargetAtTime(on ? v.music * 0.3 : v.music * 0.55, t, 0.1);
  }

  private makeNoise(seconds: number, pink: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  /** Throttle identical sounds (e.g. 10 pellets hitting at once). */
  allow(key: string, max: number, windowSec: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    let list = this.recent.get(key);
    if (!list) {
      list = [];
      this.recent.set(key, list);
    }
    while (list.length && now - list[0] > windowSec) list.shift();
    if (list.length >= max) return false;
    list.push(now);
    return true;
  }

  /**
   * Create an output chain for one sound: gain -> panner -> bus (+ reverb send).
   * Returns the input node to connect sources to.
   */
  out(bus: Bus, opts: { x?: number; y?: number; volume?: number; reverb?: number } = {}): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let vol = opts.volume ?? 1;
    let pan = 0;
    if (opts.x !== undefined) {
      const dx = opts.x - this.listenerX;
      const dy = (opts.y ?? this.listenerY) - this.listenerY;
      const d = Math.hypot(dx, dy * 0.6);
      vol *= 1 / (1 + Math.max(0, d - 4) / 14);
      pan = Math.max(-0.85, Math.min(0.85, dx / 20));
    }
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.buses[bus]);
    const rv = opts.reverb ?? 0.2;
    if (rv > 0) {
      const s = ctx.createGain();
      s.gain.value = rv;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return g;
  }

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------

  osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, dest: AudioNode, gain: number, attack = 0.002, curve: 'exp' | 'lin' = 'exp'): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(
    t: number,
    dur: number,
    dest: AudioNode,
    gain: number,
    filter: { type: BiquadFilterType; f0: number; f1?: number; q?: number },
    pink = false,
    attack = 0.002,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const off = Math.random() * 1.5;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.f0, t);
    if (filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.f1), t + dur);
    f.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, off, dur + 0.1);
  }
}

export const audio = new AudioEngine();
