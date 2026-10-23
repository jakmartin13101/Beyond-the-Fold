// Holographic military HUD: shields/health, weapon & ammo, grenades, objective with
// off-screen marker, interaction prompts, tutorial hints, boss health, pickup toasts,
// plus a canvas overlay for the reticle, hit markers and damage direction indicators.
import { Action, Input } from '../core/input';
import { clamp } from '../core/math';
import { WEAPONS } from '../data/weapons';
import { LANE_Z } from '../game/types';
import type { World } from '../game/world';
import type { Renderer } from '../render/renderer';

const ICONS: Record<string, string> = {
  ar: '4,20 20,16 22,12 70,12 74,8 92,8 92,14 112,14 112,19 92,19 88,24 64,24 60,34 50,34 52,24 30,24 24,30 6,28',
  br: '2,22 22,16 26,10 52,10 54,4 82,4 84,10 116,10 116,16 92,16 86,24 66,24 62,34 52,34 54,24 30,24 22,30 4,30',
  shotgun: '2,24 26,16 30,12 108,12 108,18 84,18 84,23 54,23 50,32 40,32 42,23 30,23 22,30 4,32',
  ember: '10,22 30,12 70,10 98,16 108,22 90,26 60,26 46,36 34,36 38,26 18,28',
  sniper: '2,24 22,18 26,12 56,12 58,6 80,6 82,12 118,12 118,16 84,16 80,22 58,22 54,32 46,32 48,22 30,22 22,30 4,30',
  rocket: '4,14 112,14 118,10 118,30 112,26 70,26 66,36 56,36 58,26 36,26 32,36 22,36 24,26 4,26',
  prism: '8,24 30,14 64,12 84,6 100,10 114,18 100,24 82,22 60,26 46,36 36,36 38,26 16,28',
};

function weaponIcon(id: string, color: string): string {
  const pts = ICONS[id] ?? ICONS.ar;
  return `<svg viewBox="0 0 120 40" class="weapon-icon"><polygon points="${pts}" fill="${color}" fill-opacity="0.9" stroke="rgba(0,0,0,0.6)" stroke-width="1"/></svg>`;
}

interface DamageArc {
  angle: number;
  t: number;
}

interface HitMark {
  t: number;
  kill: boolean;
  headshot: boolean;
  shield: boolean;
}

export class Hud {
  readonly root: HTMLDivElement;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private els: Record<string, HTMLElement> = {};
  private last: Record<string, string | number> = {};
  private damageArcs: DamageArc[] = [];
  private hits: HitMark[] = [];
  private hintT = 0;
  private bannerT = 0;
  private unsub: Array<() => void> = [];
  private fpsAcc = 0;
  private fpsFrames = 0;
  showFps = false;
  aimScreen = { x: 0, y: 0 };
  private proj = { x: 0, y: 0, visible: false };
  private shieldFlashT = 0;
  private world: World | null = null;

  constructor(
    parent: HTMLElement,
    overlay: HTMLCanvasElement,
    private input: Input,
    private r: Renderer,
  ) {
    this.overlay = overlay;
    this.ctx = overlay.getContext('2d')!;
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-panel vitals">
        <div class="callsign"><span>KESTREL</span><span data-k="lane">FRONT</span></div>
        <div class="bar-label">SHIELD</div>
        <div class="bar shield" data-k="shieldBar"><div class="ghost" data-k="shieldGhost"></div><div class="fill" data-k="shieldFill"></div><div class="segs"></div></div>
        <div class="bar-label">VITALS</div>
        <div class="bar health" data-k="healthBar"><div class="ghost" data-k="healthGhost"></div><div class="fill" data-k="healthFill"></div><div class="segs"></div></div>
      </div>
      <div class="hud-panel objective" data-k="objective"><small>OBJECTIVE</small><span data-k="objText"></span></div>
      <div class="hud-panel boss-bar" data-k="boss">
        <div class="boss-name" data-k="bossName"></div>
        <div class="bar" style="margin-top:6px"><div class="ghost" data-k="bossGhost"></div><div class="fill" data-k="bossFill"></div></div>
        <div class="boss-parts" data-k="bossParts"></div>
      </div>
      <div class="hud-panel weapon-panel">
        <div class="weapon-name" data-k="wName"></div>
        <div class="weapon-row"><span data-k="wIcon"></span><span class="ammo" data-k="ammo"></span><span class="reserve" data-k="reserve"></span></div>
        <div class="mini-bar" data-k="reloadBar" style="display:none"><div class="fill" data-k="reloadFill"></div></div>
        <div class="mini-bar heat" data-k="heatBar" style="display:none"><div class="fill" data-k="heatFill"></div></div>
        <div class="secondary" data-k="secondary"></div>
        <div class="grenades">
          <span class="gren" data-k="gFrag"><i style="background:#a8b88a"></i><b data-k="gFragN">0</b></span>
          <span class="gren" data-k="gPlasma"><i style="background:#9dff4a"></i><b data-k="gPlasmaN">0</b></span>
        </div>
      </div>
      <div class="prompt" data-k="prompt"></div>
      <div class="hint" data-k="hint"></div>
      <div class="toasts" data-k="toasts"></div>
      <div class="banner" data-k="banner"><div class="t1" data-k="b1"></div><div class="t2" data-k="b2"></div><div class="t3" data-k="b3"></div></div>
      <div class="fps" data-k="fps"></div>
    `;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => (this.els[el.dataset.k!] = el));
  }

  attach(world: World): void {
    this.detach();
    this.world = world;
    const ev = world.events;
    this.unsub.push(
      ev.on('playerHurt', (h) => {
        const p = world.player;
        // Direction toward the source (opposite of the push direction).
        const ang = Math.atan2(-h.dirY, -h.dirX);
        this.damageArcs.push({ angle: ang, t: 1 });
        if (h.shield) this.shieldFlashT = 0.25;
        void p;
      }),
      ev.on('hitmarker', (h) => this.hits.push({ t: 0, kill: h.kill, headshot: h.headshot, shield: h.shield })),
      ev.on('objective', (o) => {
        this.set('objText', o.text);
        this.els.objective.classList.remove('flash');
        void this.els.objective.offsetWidth;
        this.els.objective.classList.add('flash');
      }),
      ev.on('hint', (h) => this.showHint(h.text, h.duration)),
      ev.on('pickup', (p) => this.toast('+ ' + p.label.toUpperCase())),
      ev.on('checkpoint', () => this.toast('CHECKPOINT REACHED', true)),
      ev.on('intel', () => this.toast('INTEL RECOVERED', true)),
      ev.on('cache', () => this.toast('SUPPLY CACHE · REQUISITION +', true)),
      ev.on('encounter', (e) => {
        if (e.phase === 'clear') this.toast('AREA SECURED', true);
      }),
      ev.on('boss', (b) => {
        if (b.phase === 'start') this.els.boss.classList.add('show');
        if (b.phase === 'defeated') this.els.boss.classList.remove('show');
      }),
    );
    if (world.objective) this.set('objText', world.objective.text);
    this.els.boss.classList.remove('show');
  }

  detach(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.world = null;
    this.damageArcs = [];
    this.hits = [];
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  private set(k: string, v: string): void {
    if (this.last[k] === v) return;
    this.last[k] = v;
    this.els[k].innerHTML = v;
  }

  private setScale(k: string, f: number): void {
    const v = clamp(f, 0, 1).toFixed(3);
    if (this.last[k] === v) return;
    this.last[k] = v;
    this.els[k].style.transform = `scaleX(${v})`;
  }

  /** Replace [action] tokens with key caps for the current input device. */
  formatKeys(text: string): string {
    return text.replace(/\[(\w+)\]/g, (_m, a: string) => `<kbd>${this.input.labelFor(a as Action)}</kbd>`);
  }

  showHint(text: string, duration: number): void {
    this.els.hint.innerHTML = this.formatKeys(text);
    this.els.hint.classList.add('show');
    this.hintT = duration;
  }

  toast(text: string, big = false): void {
    const t = document.createElement('div');
    t.className = 'toast' + (big ? ' big' : '');
    t.textContent = text;
    this.els.toasts.appendChild(t);
    window.setTimeout(() => t.remove(), 2700);
    while (this.els.toasts.children.length > 5) this.els.toasts.firstChild?.remove();
  }

  banner(a: string, b: string, c: string, duration = 3.5): void {
    this.els.b1.textContent = a;
    this.els.b2.textContent = b;
    this.els.b3.textContent = c;
    this.els.banner.classList.add('show');
    this.bannerT = duration;
  }

  update(dt: number, frameDt: number): void {
    // FPS counter.
    this.fpsAcc += frameDt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.set('fps', this.showFps ? `${Math.round(this.fpsFrames / this.fpsAcc)} FPS` : '');
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.els.hint.classList.remove('show');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.els.banner.classList.remove('show');
    }
    const w = this.world;
    if (!w) return;
    const p = w.player;

    // Vitals.
    this.setScale('shieldFill', p.shield / p.maxShield);
    this.setScale('shieldGhost', p.shield / p.maxShield);
    this.setScale('healthFill', p.health / p.maxHealth);
    this.setScale('healthGhost', p.health / p.maxHealth);
    const sb = this.els.shieldBar.classList;
    sb.toggle('recharging', p.shieldTimer <= 0 && p.shield < p.maxShield);
    sb.toggle('broken', p.shield <= 0.5);
    this.shieldFlashT -= dt;
    sb.toggle('flash', this.shieldFlashT > 0);
    this.els.healthBar.classList.toggle('low', p.health < 35);
    this.set('lane', p.lane === 0 ? 'FRONT LANE' : 'BACK LANE');

    // Weapon.
    const wpn = p.weapon;
    if (wpn) {
      const def = wpn.def;
      this.set('wName', def.short);
      this.set('wIcon', weaponIcon(def.id, def.hudColor));
      if (wpn.isBattery) {
        this.set('ammo', `${Math.ceil(wpn.mag)}<small style="font-size:18px">%</small>`);
        this.set('reserve', '');
        this.els.heatBar.style.display = '';
        this.setScale('heatFill', wpn.overheatT > 0 ? 1 : wpn.heat);
      } else {
        this.set('ammo', String(wpn.mag));
        this.set('reserve', `/ ${wpn.reserve}`);
        this.els.heatBar.style.display = 'none';
      }
      this.els.ammo.classList.toggle('low', !wpn.isBattery && wpn.mag <= Math.ceil(def.magSize * 0.2));
      this.els.reloadBar.style.display = wpn.reloading ? '' : 'none';
      if (wpn.reloading) this.setScale('reloadFill', wpn.reloadProgress);
    } else {
      this.set('wName', 'UNARMED');
      this.set('ammo', '—');
      this.set('reserve', '');
      this.set('wIcon', '');
    }
    const other = p.otherWeapon;
    this.set('secondary', other ? `${other.def.short} · ${other.isBattery ? Math.ceil(other.mag) + '%' : other.mag + ' / ' + other.reserve} · <kbd>${this.input.labelFor('switchWeapon')}</kbd>` : '');
    this.set('gFragN', String(p.grenades.frag ?? 0));
    this.set('gPlasmaN', String(p.grenades.plasma ?? 0));
    this.els.gFrag.classList.toggle('sel', p.grenadeType === 'frag');
    this.els.gPlasma.classList.toggle('sel', p.grenadeType === 'plasma');

    // Interaction prompt.
    const prompt = p.interactPrompt;
    if (prompt && !p.dead) {
      this.set('prompt', `<kbd>${this.input.labelFor('interact')}</kbd> ${prompt}`);
      this.els.prompt.classList.add('show');
    } else {
      this.els.prompt.classList.remove('show');
    }
    this.els.objective.style.opacity = w.objective && !w.cinematic ? '1' : '0';

    // Boss.
    const b = w.boss;
    if (b && b.active) {
      this.set('bossName', b.name);
      this.setScale('bossFill', b.health / b.maxHealth);
      this.setScale('bossGhost', b.health / b.maxHealth);
      this.set(
        'bossParts',
        `<span class="${b.plateBroken ? 'broken' : ''}">CHEST ARMOR</span><span class="${b.podBroken ? 'broken' : ''}">MISSILE POD</span><span>PHASE ${b.phase}</span>${b.ventT > 0 ? '<span style="color:#ffd080">CORE VENTING</span>' : ''}`,
      );
    }
  }

  /** Draw the reticle and world-space indicators. Called every frame after rendering. */
  drawOverlay(dt: number, mouseVisible: boolean, aimX: number, aimY: number, cinematic: boolean): void {
    const c = this.overlay;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const world = this.world;
    if (!world || cinematic) return;
    const p = world.player;

    // Objective marker (on-screen chevron or edge arrow).
    const obj = world.objective;
    if (obj && obj.x !== undefined && !p.dead) {
      this.r.project(obj.x, (obj.y ?? 0) + 2.5, 0, this.proj);
      const dist = Math.abs(obj.x - p.x);
      const margin = 50;
      const onScreen = this.proj.visible && this.proj.x > margin && this.proj.x < w - margin && this.proj.y > margin && this.proj.y < h - margin;
      ctx.save();
      ctx.font = '600 13px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      if (onScreen) {
        const bob = Math.sin(performance.now() / 300) * 4;
        drawChevron(ctx, this.proj.x, this.proj.y + bob, 0, '#ffb36b');
        ctx.fillStyle = '#ffb36b';
        ctx.fillText(`${Math.round(dist)} M`, this.proj.x, this.proj.y + bob - 18);
      } else {
        const dir = obj.x > p.x ? 1 : -1;
        const x = dir > 0 ? w - 34 : 34;
        const y = h * 0.42;
        drawChevron(ctx, x, y, dir > 0 ? -Math.PI / 2 : Math.PI / 2, '#ffb36b');
        ctx.fillStyle = '#ffb36b';
        ctx.fillText(`${Math.round(dist)} M`, x - dir * 4, y + 30);
      }
      ctx.restore();
    }

    // Damage direction arcs around the player.
    this.r.project(p.x, p.y + 1.1, p.z, this.proj);
    const px = this.proj.x;
    const py = this.proj.y;
    for (const a of this.damageArcs) {
      a.t -= dt * 1.3;
      if (a.t <= 0) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,50,${a.t * 0.9})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(px, py, 70, -a.angle - 0.35, -a.angle + 0.35);
      ctx.stroke();
      ctx.restore();
    }
    this.damageArcs = this.damageArcs.filter((a) => a.t > 0);

    if (p.dead) return;
    // Reticle.
    const wpn = p.weapon;
    let rx = aimX;
    let ry = aimY;
    if (!mouseVisible) {
      this.r.project(p.aimWorldX, p.aimWorldY, LANE_Z[p.lane], this.proj);
      rx = this.proj.x;
      ry = this.proj.y;
    }
    this.aimScreen.x = rx;
    this.aimScreen.y = ry;
    const def = wpn ? wpn.def : WEAPONS.ar;
    const spread = wpn ? def.spread + wpn.bloom : 2;
    const hot = this.reticleOverEnemy(world);
    const col = hot === 1 ? '#ff5a4a' : hot === 2 ? '#a0a0ff' : '#efe6d2';
    const gap = 8 + spread * 3.2;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    switch (def.id) {
      case 'shotgun':
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(-1.5, -1.5, 3, 3);
        break;
      case 'sniper':
        ctx.beginPath();
        ctx.moveTo(-26, 0);
        ctx.lineTo(-6, 0);
        ctx.moveTo(6, 0);
        ctx.lineTo(26, 0);
        ctx.moveTo(0, -26);
        ctx.lineTo(0, -6);
        ctx.moveTo(0, 6);
        ctx.lineTo(0, 26);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(-1, -1, 2, 2);
        break;
      case 'rocket':
        ctx.strokeRect(-14, -14, 28, 28);
        ctx.fillRect(-2, -2, 4, 4);
        break;
      case 'ember':
      case 'prism': {
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.stroke();
        if (wpn && wpn.charging && def.charge) {
          ctx.strokeStyle = '#9dff4a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * wpn.chargeT) / def.charge.time);
          ctx.stroke();
        }
        ctx.fillRect(-1.5, -1.5, 3, 3);
        break;
      }
      default:
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          ctx.beginPath();
          ctx.moveTo(dx * gap, dy * gap);
          ctx.lineTo(dx * (gap + 9), dy * (gap + 9));
          ctx.stroke();
        }
        ctx.fillRect(-1.5, -1.5, 3, 3);
    }
    if (hot === 2) {
      ctx.font = '600 11px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.lane === 0 ? '▲ BACK LANE' : '▼ FRONT LANE', 0, 36);
    }
    if (wpn && wpn.reloading) {
      ctx.strokeStyle = '#7fe8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * wpn.reloadProgress);
      ctx.stroke();
    }
    // Hit markers.
    for (const hm of this.hits) {
      hm.t += dt;
      const k = 1 - hm.t / (hm.kill ? 0.45 : 0.22);
      if (k <= 0) continue;
      ctx.strokeStyle = hm.kill ? `rgba(255,80,60,${k})` : hm.headshot ? `rgba(255,220,120,${k})` : hm.shield ? `rgba(127,232,255,${k})` : `rgba(255,255,255,${k})`;
      ctx.lineWidth = hm.kill ? 3 : 2;
      const s = hm.kill ? 16 : 11;
      const g2 = 5;
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        ctx.moveTo(dx * g2, dy * g2);
        ctx.lineTo(dx * s, dy * s);
      }
      ctx.stroke();
    }
    this.hits = this.hits.filter((hm) => hm.t < (hm.kill ? 0.45 : 0.22));
    ctx.restore();
  }

  /** 0 = nothing, 1 = enemy in our lane under the reticle, 2 = enemy in the other lane. */
  private reticleOverEnemy(world: World): number {
    const p = world.player;
    const ax = p.aimWorldX;
    const ay = p.aimWorldY;
    let res = 0;
    for (const e of world.enemies) {
      if (e.dead || e.entering) continue;
      if (Math.abs(e.x - ax) < e.w / 2 + 0.3 && ay > e.y - 0.2 && ay < e.y + e.h + 0.3) {
        if (e.lane === p.lane) return 1;
        res = 2;
      }
    }
    const b = world.boss;
    if (b && b.active && b.alive && Math.abs(b.x - ax) < 2.5 && ay > b.y && ay < b.y + 7) return 1;
    return res;
  }
}

function drawChevron(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.lineTo(0, 6);
  ctx.lineTo(10, -6);
  ctx.lineTo(10, -1);
  ctx.lineTo(0, 11);
  ctx.lineTo(-10, -1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
