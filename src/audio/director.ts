// Routes simulation events to sound effects and runs ambience beds (wind, alien wildlife,
// fire crackle, outpost machinery) plus the low-health heartbeat.
import { rand } from '../core/math';
import type { World } from '../game/world';
import { audio } from './engine';
import { music } from './music';
import { SFX } from './sfx';

export class AudioDirector {
  private unsub: Array<() => void> = [];
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private wildlifeT = 2;
  private heartT = 0;
  private lowHealth = false;
  private crackleT = 0;

  constructor(private world: World) {
    this.bind();
    this.startBeds();
  }

  private bind(): void {
    const ev = this.world.events;
    const w = this.world;
    const P = (x: number, y: number) => ({ x, y });
    this.unsub.push(
      ev.on('shot', (s) => {
        const p = { ...P(s.x, s.y), volume: s.byPlayer ? 1 : 0.75, charged: s.charged };
        switch (s.weaponId) {
          case 'ar':
            SFX.ar(p);
            break;
          case 'br':
            SFX.br(p);
            break;
          case 'shotgun':
            SFX.shotgun(p);
            break;
          case 'sniper':
            SFX.sniper(p);
            break;
          case 'rocket':
            SFX.rocket(p);
            break;
          case 'ember':
            SFX.plasma(p);
            break;
          case 'prism':
            SFX.prism(p);
            break;
          case 'threnCarbine':
          case 'threnPistol':
            SFX.threnShot(p);
            break;
          case 'droneBlaster':
            SFX.droneShot(p);
            break;
          case 'colossusCannon':
            if (audio.allow('cannon', 1, 0.07)) SFX.cannon(p);
            break;
          case 'colossusMissile':
            SFX.missileLaunch(p);
            break;
        }
      }),
      ev.on('impact', (i) => SFX.impact({ x: i.x, y: i.y, surface: i.surface, volume: i.size > 1 ? 1 : 0.7 })),
      ev.on('explosion', (x) => SFX.explosion({ x: x.x, y: x.y, size: x.radius, kind: x.kind, volume: x.kind === 'small' ? 0.6 : 1 })),
      ev.on('playerHurt', (h) => {
        if (h.shield) SFX.shieldHit({ x: w.player.x, y: w.player.y });
        else SFX.impact({ x: w.player.x, y: w.player.y, surface: 'flesh', volume: 1 });
      }),
      ev.on('shieldBroken', (s) => SFX.shieldBreak({ x: s.x, y: s.y, volume: s.isPlayer ? 1 : 0.6 })),
      ev.on('shieldRecharge', () => SFX.shieldRecharge({})),
      ev.on('shieldFull', () => SFX.shieldFull({})),
      ev.on('lowHealth', (l) => {
        this.lowHealth = l.on;
      }),
      ev.on('footstep', (f) => {
        if (f.heavy >= 3) SFX.bossStep({ x: f.x, y: f.y });
        else SFX.footstep({ x: f.x, y: f.y, size: f.heavy, surface: f.surface, volume: f.isPlayer ? 0.8 : 0.45, kind: f.isPlayer ? 'p' : 'e' });
      }),
      ev.on('jump', (j) => {
        if (j.isPlayer) SFX.jump(P(j.x, j.y));
      }),
      ev.on('land', (l) => SFX.land({ x: l.x, y: l.y, size: l.heavy, volume: l.isPlayer ? 1 : 0.6 })),
      ev.on('roll', (r) => {
        SFX.whoosh(P(r.x, r.y));
        SFX.servo(P(r.x, r.y));
      }),
      ev.on('laneShift', (l) => {
        if (l.isPlayer) {
          SFX.whoosh({ ...P(l.x, l.y), volume: 0.6 });
          SFX.servo({ ...P(l.x, l.y), volume: 0.7 });
        }
      }),
      ev.on('reload', (r) => {
        if (r.byPlayer) SFX.reload(r.phase, r.weaponId, P(r.x, r.y));
      }),
      ev.on('dryFire', () => SFX.dryFire({ x: w.player.x })),
      ev.on('overheat', (o) => SFX.overheat(P(o.x, o.y))),
      ev.on('chargeStart', (c) => SFX.chargeUp(P(c.x, c.y))),
      ev.on('weaponSwitch', () => SFX.switchWeapon({ x: w.player.x })),
      ev.on('melee', (m) => SFX.melee(m.hit, { x: m.x, y: m.y, volume: m.byPlayer ? 1 : 0.8 })),
      ev.on('grenadeThrow', (g) => SFX.grenadeThrow(P(g.x, g.y))),
      ev.on('grenadeBounce', (g) => SFX.grenadeBounce(P(g.x, g.y))),
      ev.on('grenadeStick', (g) => SFX.grenadeStick(P(g.x, g.y))),
      ev.on('pickup', (p) => SFX.pickup(p.kind, P(p.x, p.y))),
      ev.on('intel', () => SFX.intel()),
      ev.on('cache', () => SFX.intel()),
      ev.on('checkpoint', () => SFX.checkpoint()),
      ev.on('vocal', (v) => {
        if (v.type === 'player') return;
        SFX.vocal(v.type, v.kind, { x: v.x, y: v.y, volume: v.type === 'ravager' ? 1 : 0.75 });
      }),
      ev.on('hazard', (h) => SFX.hazard(h.phase, P(h.x, h.y))),
      ev.on('platform', (p) => {
        if (p.kind === 'crumble') SFX.crumble(P(p.x, p.y));
        if (p.kind === 'fall') SFX.rumble(P(p.x, p.y));
      }),
      ev.on('barrier', (b) => SFX.barrier(b.on, { x: b.x })),
      ev.on('propDestroyed', (p) => SFX.propBreak(P(p.x, p.y))),
      ev.on('telegraph', (t) => {
        if (t.kind === 'bossCannon') SFX.bossCharge(t.duration, P(t.x, t.y));
        else if (t.kind === 'bossBeam') {
          SFX.bossCharge(t.duration, P(t.x, t.y));
          window.setTimeout(() => SFX.bossBeam(1.7, P(t.x, t.y)), t.duration * 1000);
        } else if (t.kind === 'bossPod') SFX.alarm({ ...P(t.x, t.y), volume: 0.6 });
        else if (t.kind === 'missileTarget' && audio.allow('whistle', 1, 0.3)) window.setTimeout(() => SFX.missileWhistle(P(t.x, t.y)), Math.max(0, t.duration - 0.8) * 1000);
        else if (t.kind === 'bossStomp') SFX.servo({ ...P(t.x, t.y), volume: 1.4 });
      }),
      ev.on('music', (m) => music.setIntensity(m.intensity)),
      ev.on('boss', (b) => {
        if (b.phase === 'start' || b.phase === 'phase2' || b.phase === 'phase3') SFX.bossHorn({ x: w.boss?.x ?? w.player.x });
        if (b.phase === 'defeated') SFX.sting('victory');
        if (b.phase === 'vent') SFX.overheat({ x: w.boss?.x, volume: 1.5 });
      }),
      ev.on('playerDied', () => SFX.sting('death')),
      ev.on('enemyKilled', (k) => {
        if (k.type === 'colossus') SFX.explosion({ x: k.x, y: k.y, size: 8, volume: 1.4 });
      }),
    );
  }

  private startBeds(): void {
    const ctx = audio.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = audio.pink;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.35, ctx.currentTime, 2);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.buses.ambience);
    src.start();
    this.wind = { src, filter, gain };
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 50;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    osc.connect(lp);
    lp.connect(hg);
    hg.connect(audio.buses.ambience);
    osc.start();
    this.hum = { osc, gain: hg };
  }

  update(dt: number, camX: number, camY: number): void {
    audio.listenerX = camX;
    audio.listenerY = camY;
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.wind) {
      this.wind.filter.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 150 + Math.sin(t * 0.07) * 100, t, 0.5);
      const chasm = this.world.level.chasms.some((c) => camX > c.x0 - 5 && camX < c.x1 + 5);
      this.wind.gain.gain.setTargetAtTime(chasm ? 0.6 : 0.3, t, 1);
    }
    if (this.hum) {
      const industrial = camX > 180 ? Math.min(1, (camX - 180) / 30) : 0;
      this.hum.gain.gain.setTargetAtTime(industrial * 0.12, t, 1);
    }
    // Alien wildlife: chirps and distant calls in the wilds.
    this.wildlifeT -= dt;
    if (this.wildlifeT <= 0) {
      this.wildlifeT = rand(1.5, 5);
      if (camX < 175) this.wildlifeCall(camX + rand(-25, 25));
    }
    // Crackle near the crash fires.
    this.crackleT -= dt;
    if (this.crackleT <= 0) {
      this.crackleT = rand(0.05, 0.25);
      if (Math.abs(camX - 2) < 18) {
        const out = audio.out('ambience', { x: rand(-2, 6), volume: 0.5, reverb: 0.05 });
        audio.noiseBurst(t, 0.02, out, rand(0.1, 0.35), { type: 'bandpass', f0: rand(1500, 4000), q: 2 });
      }
    }
    // Heartbeat at low health.
    if (this.lowHealth && !this.world.player.dead) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.95;
        SFX.heartbeat();
      }
    }
  }

  private wildlifeCall(x: number): void {
    const out = audio.out('ambience', { x, volume: rand(0.3, 0.7), reverb: 0.6 });
    const t = audio.now;
    const kind = Math.random();
    if (kind < 0.5) {
      const base = rand(1800, 3400);
      const n = Math.floor(rand(2, 6));
      for (let i = 0; i < n; i++) audio.osc('sine', base, base * rand(1.1, 1.4), t + i * 0.09, 0.06, out, 0.05);
    } else if (kind < 0.8) {
      const f = rand(300, 600);
      audio.osc('triangle', f, f * rand(1.4, 2), t, 0.6, out, 0.05, 0.2);
      audio.osc('triangle', f * 2, f * 1.5, t + 0.5, 0.5, out, 0.03, 0.1);
    } else {
      for (let i = 0; i < 10; i++) audio.noiseBurst(t + i * 0.035, 0.015, out, 0.08, { type: 'bandpass', f0: 6000, q: 6 });
    }
  }

  dispose(): void {
    for (const u of this.unsub) u();
    if (this.wind && audio.ctx) {
      const t = audio.ctx.currentTime;
      this.wind.gain.gain.setTargetAtTime(0, t, 0.3);
      const src = this.wind.src;
      window.setTimeout(() => src.stop(), 1200);
    }
    if (this.hum && audio.ctx) {
      this.hum.gain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.3);
      const osc = this.hum.osc;
      window.setTimeout(() => osc.stop(), 1200);
    }
  }
}
