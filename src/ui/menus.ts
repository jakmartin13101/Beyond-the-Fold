// Menu screens: title, difficulty, pause, settings, controls, armory, intel archive,
// intel reader, death and mission results. Keyboard, mouse and gamepad navigable.
import { SFX } from '../audio/sfx';
import { ACTIONS, ACTION_LABELS, Action, DEFAULT_BINDINGS, Input, PAD_LABELS, cloneBindings, keyLabel } from '../core/input';
import type { SaveData } from '../core/save';
import type { Settings } from '../core/settings';
import { DIFFICULTIES } from '../data/enemies';
import { ARMOR_SCHEMES, CHALLENGES, UPGRADES, VISORS } from '../data/progression';
import { INTEL, MISSION_TEXT } from '../data/story';
import { WEAPONS } from '../data/weapons';

export interface ResultsData {
  rank: string;
  score: number;
  time: number;
  kills: number;
  headshots: number;
  accuracy: number;
  deaths: number;
  intel: number;
  intelTotal: number;
  caches: number;
  rpEarned: number;
  challenges: Array<{ id: string; done: boolean; newly: boolean }>;
  unlocks: string[];
  difficulty: string;
}

type Screen = { el: HTMLElement; onBack?: () => void; focus: number };

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Menus {
  readonly root: HTMLDivElement;
  private stack: Screen[] = [];
  private padPrev: boolean[] = [];
  private padAxisPrev = 0;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(
    parent: HTMLElement,
    private input: Input,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'menus';
    parent.appendChild(this.root);
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  closeAll(): void {
    for (const s of this.stack) s.el.remove();
    this.stack = [];
  }

  pop(): void {
    const s = this.stack.pop();
    s?.el.remove();
    const t = this.top;
    if (t) {
      t.el.style.display = '';
      this.applyFocus();
    }
  }

  private push(el: HTMLElement, onBack?: () => void): Screen {
    const prev = this.top;
    if (prev) prev.el.style.display = 'none';
    const s: Screen = { el, onBack, focus: 0 };
    this.stack.push(s);
    this.root.appendChild(el);
    el.querySelectorAll<HTMLElement>('[data-nav]').forEach((n, i) => {
      n.addEventListener('mouseenter', () => {
        if (s.focus !== i) {
          s.focus = i;
          this.applyFocus();
          SFX.uiMove();
        }
      });
    });
    // Focus the first enabled item.
    const navs = this.navs();
    const first = navs.findIndex((n) => !(n as HTMLButtonElement).disabled);
    s.focus = Math.max(0, first);
    this.applyFocus();
    return s;
  }

  private navs(): HTMLElement[] {
    const t = this.top;
    if (!t) return [];
    return Array.from(t.el.querySelectorAll<HTMLElement>('[data-nav]')).filter((n) => n.offsetParent !== null || n.closest('.screen') === t.el);
  }

  private applyFocus(): void {
    const t = this.top;
    if (!t) return;
    const navs = this.navs();
    navs.forEach((n, i) => n.classList.toggle('focus', i === t.focus));
    navs[t.focus]?.scrollIntoView?.({ block: 'nearest' });
  }

  private move(d: number): void {
    const t = this.top;
    if (!t) return;
    const navs = this.navs();
    if (!navs.length) return;
    let i = t.focus;
    for (let k = 0; k < navs.length; k++) {
      i = (i + d + navs.length) % navs.length;
      if (!(navs[i] as HTMLButtonElement).disabled) break;
    }
    t.focus = i;
    this.applyFocus();
    SFX.uiMove();
  }

  private activate(): void {
    const t = this.top;
    if (!t) return;
    const n = this.navs()[t.focus];
    if (n && !(n as HTMLButtonElement).disabled) n.click();
  }

  private adjust(d: number): void {
    const t = this.top;
    if (!t) return;
    const n = this.navs()[t.focus];
    if (!n) return;
    const range = n.querySelector<HTMLInputElement>('input[type=range]') ?? (n.matches('input[type=range]') ? (n as HTMLInputElement) : null);
    if (range) {
      const step = Number(range.step || 0.05);
      range.value = String(Math.min(Number(range.max), Math.max(Number(range.min), Number(range.value) + d * step)));
      range.dispatchEvent(new Event('input'));
      SFX.uiMove();
      return;
    }
    const sel = n.querySelector<HTMLSelectElement>('select');
    if (sel) {
      sel.selectedIndex = Math.min(sel.options.length - 1, Math.max(0, sel.selectedIndex + d));
      sel.dispatchEvent(new Event('change'));
      SFX.uiMove();
    }
  }

  back(): void {
    const t = this.top;
    if (t?.onBack) {
      SFX.uiBack();
      t.onBack();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open || this.input.captureNext) return;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.move(1);
        e.preventDefault();
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.adjust(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.adjust(1);
        break;
      case 'Enter':
      case 'Space':
        this.activate();
        e.preventDefault();
        break;
      case 'Escape':
      case 'Backspace':
        this.back();
        e.preventDefault();
        break;
    }
  }

  /** Gamepad navigation (call every frame while menus are open). */
  pollGamepad(): void {
    if (!this.open) return;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const pressed = (i: number) => {
      const d = !!pad.buttons[i]?.pressed;
      const was = this.padPrev[i];
      this.padPrev[i] = d;
      return d && !was;
    };
    if (pressed(12)) this.move(-1);
    if (pressed(13)) this.move(1);
    if (pressed(14)) this.adjust(-1);
    if (pressed(15)) this.adjust(1);
    if (pressed(0)) this.activate();
    if (pressed(1)) this.back();
    const ay = pad.axes[1] ?? 0;
    const dir = ay < -0.6 ? -1 : ay > 0.6 ? 1 : 0;
    if (dir !== 0 && dir !== this.padAxisPrev) this.move(dir);
    this.padAxisPrev = dir;
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  private screen(cls: string, html: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'screen ' + cls;
    el.innerHTML = html;
    return el;
  }

  private bind(el: HTMLElement, sel: string, fn: () => void, sound = true): void {
    el.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        if (sound) SFX.uiSelect();
        fn();
      }),
    );
  }

  title(opts: { canContinue: boolean; onContinue: () => void; onNew: () => void; onArmory: () => void; onIntel: () => void; onSettings: () => void; onControls: () => void; onCredits: () => void }): void {
    const el = this.screen(
      'title-screen',
      `
      <div class="logo"><span class="l1">CONCORD EXPEDITIONARY FORCE</span><span class="l2">BEYOND<br/>THE FOLD</span><span class="crease"></span></div>
      <div class="tagline">A PAPERCRAFT WAR STORY</div>
      <div class="menu">
        <button data-nav data-a="continue" ${opts.canContinue ? '' : 'disabled'}>CONTINUE</button>
        <button data-nav data-a="new">NEW MISSION</button>
        <button data-nav data-a="armory">ARMORY</button>
        <button data-nav data-a="intel">INTEL ARCHIVE</button>
        <button data-nav data-a="settings">SETTINGS</button>
        <button data-nav data-a="controls">CONTROLS</button>
        <button data-nav data-a="credits">CREDITS</button>
      </div>
      <div class="footer-note">Keyboard &amp; mouse or controller · Built with folded paper and plasma</div>`,
    );
    this.bind(el, '[data-a=continue]', opts.onContinue);
    this.bind(el, '[data-a=new]', opts.onNew);
    this.bind(el, '[data-a=armory]', opts.onArmory);
    this.bind(el, '[data-a=intel]', opts.onIntel);
    this.bind(el, '[data-a=settings]', opts.onSettings);
    this.bind(el, '[data-a=controls]', opts.onControls);
    this.bind(el, '[data-a=credits]', opts.onCredits);
    this.closeAll();
    this.push(el);
  }

  difficulty(current: string, onPick: (id: string) => void): void {
    const m = MISSION_TEXT.m01;
    const cards = Object.values(DIFFICULTIES)
      .map(
        (d) => `<div class="card ${d.id === current ? 'selected' : ''}" data-nav data-d="${d.id}">
          <h3>${d.name.toUpperCase()}</h3><p>${d.description}</p><div class="meta">SCORE ×${d.scoreMult}</div></div>`,
      )
      .join('');
    const el = this.screen(
      'dim',
      `<div class="panel">
        <h2>${m.number} · ${m.name}</h2>
        <div class="sub">${m.location}</div>
        <p style="font-size:18px;line-height:1.4;margin:0 0 18px;opacity:.9">${m.briefing}</p>
        <div class="sub" style="margin-bottom:10px">SELECT DIFFICULTY</div>
        <div class="cards">${cards}</div>
        <div class="actions"><button class="btn" data-nav data-a="back">BACK</button></div>
      </div>`,
    );
    el.querySelectorAll<HTMLElement>('[data-d]').forEach((c) =>
      c.addEventListener('click', () => {
        SFX.uiSelect();
        onPick(c.dataset.d!);
      }),
    );
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
    // Focus the current difficulty.
    const idx = Object.keys(DIFFICULTIES).indexOf(current);
    if (this.top && idx >= 0) {
      this.top.focus = idx;
      this.applyFocus();
    }
  }

  pause(opts: { objective: string; intel: string; onResume: () => void; onRestart: () => void; onSettings: () => void; onControls: () => void; onQuit: () => void }): void {
    const el = this.screen(
      'dim',
      `<div class="center-col">
        <div class="big-title" style="font-size:54px;text-shadow:4px 4px 0 #4a2a6e,8px 8px 0 rgba(0,0,0,.4)">PAUSED</div>
        <div style="letter-spacing:.2em;color:var(--orange);font-family:var(--font-head)">${esc(opts.objective)}</div>
        <div style="letter-spacing:.2em;opacity:.7;margin-bottom:18px">${opts.intel}</div>
        <div class="menu">
          <button data-nav data-a="resume">RESUME</button>
          <button data-nav data-a="restart">RESTART FROM CHECKPOINT</button>
          <button data-nav data-a="settings">SETTINGS</button>
          <button data-nav data-a="controls">CONTROLS</button>
          <button data-nav data-a="quit">QUIT TO TITLE</button>
        </div>
      </div>`,
    );
    this.bind(el, '[data-a=resume]', opts.onResume);
    this.bind(el, '[data-a=restart]', opts.onRestart);
    this.bind(el, '[data-a=settings]', opts.onSettings);
    this.bind(el, '[data-a=controls]', opts.onControls);
    this.bind(el, '[data-a=quit]', opts.onQuit);
    this.closeAll();
    this.push(el, opts.onResume);
  }

  settings(s: Settings, onChange: (s: Settings) => void): void {
    let tab = 'audio';
    const el = this.screen('dim', `<div class="panel"><h2>SETTINGS</h2><div class="sub">AUDIO · GRAPHICS · GAMEPLAY</div><div class="tabs"></div><div class="scroll"></div><div class="actions"><button class="btn" data-nav data-a="back">DONE</button></div></div>`);
    const tabsEl = el.querySelector('.tabs')!;
    const body = el.querySelector('.scroll')!;
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
      `<div class="row" data-nav><label>${label}</label><div class="ctrl"><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key] as number}" data-k="${key}"/><span data-v="${key}" style="width:50px;text-align:right">${fmt(s[key] as number)}</span></div></div>`;
    const toggle = (key: keyof Settings, label: string) =>
      `<div class="row" data-nav data-t="${key}"><label>${label}</label><div class="ctrl"><button class="toggle ${s[key] ? 'on' : ''}" data-tk="${key}"></button></div></div>`;
    const pct = (v: number) => Math.round(v * 100) + '%';
    const render = () => {
      tabsEl.innerHTML = ['audio', 'graphics', 'gameplay'].map((t) => `<button class="${t === tab ? 'active' : ''}" data-tab="${t}">${t.toUpperCase()}</button>`).join('');
      let html = '';
      if (tab === 'audio') {
        html += slider('masterVolume', 'Master Volume', 0, 1, 0.05, pct);
        html += slider('musicVolume', 'Music', 0, 1, 0.05, pct);
        html += slider('sfxVolume', 'Effects', 0, 1, 0.05, pct);
        html += slider('voiceVolume', 'Radio Chatter', 0, 1, 0.05, pct);
        html += toggle('subtitles', 'Radio Subtitles');
      } else if (tab === 'graphics') {
        html += `<div class="row" data-nav><label>Quality Preset</label><div class="ctrl"><select data-sel="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q.toUpperCase()}</option>`).join('')}</select></div></div>`;
        html += toggle('shadows', 'Dynamic Shadows');
        html += toggle('bloom', 'Bloom & Glow');
        html += slider('particles', 'Particle Density', 0.3, 1, 0.1, pct);
        html += slider('resolutionScale', 'Resolution Scale', 0.5, 1, 0.05, pct);
        html += toggle('showFps', 'Show FPS');
      } else {
        html += `<div class="row" data-nav><label>Default Difficulty</label><div class="ctrl"><select data-sel="difficulty">${Object.values(DIFFICULTIES).map((d) => `<option value="${d.id}" ${s.difficulty === d.id ? 'selected' : ''}>${d.name.toUpperCase()}</option>`).join('')}</select></div></div>`;
        html += slider('screenShake', 'Screen Shake', 0, 1, 0.1, pct);
        html += toggle('aimAssist', 'Controller Aim Assist');
      }
      body.innerHTML = html;
      tabsEl.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          tab = b.dataset.tab!;
          SFX.uiSelect();
          render();
          refreshNav();
        }),
      );
      body.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((r) =>
        r.addEventListener('input', () => {
          const k = r.dataset.k as keyof Settings;
          (s as unknown as Record<string, number>)[k] = Number(r.value);
          const v = body.querySelector(`[data-v=${k}]`);
          if (v) v.textContent = pct(Number(r.value));
          onChange(s);
        }),
      );
      body.querySelectorAll<HTMLElement>('[data-t]').forEach((row) =>
        row.addEventListener('click', () => {
          const k = row.dataset.t as keyof Settings;
          (s as unknown as Record<string, boolean>)[k] = !s[k];
          row.querySelector('.toggle')!.classList.toggle('on', !!s[k]);
          SFX.uiSelect();
          onChange(s);
        }),
      );
      body.querySelectorAll<HTMLSelectElement>('select').forEach((sel) =>
        sel.addEventListener('change', () => {
          const k = sel.dataset.sel as keyof Settings;
          (s as unknown as Record<string, string>)[k] = sel.value;
          if (k === 'quality') {
            s.shadows = sel.value !== 'low';
            s.bloom = sel.value !== 'low';
            s.particles = sel.value === 'low' ? 0.5 : sel.value === 'medium' ? 0.8 : 1;
            render();
            refreshNav();
          }
          onChange(s);
        }),
      );
    };
    const refreshNav = () => {
      const t = this.top;
      if (!t) return;
      t.el.querySelectorAll<HTMLElement>('[data-nav]').forEach((n, i) =>
        n.addEventListener('mouseenter', () => {
          t.focus = i;
          this.applyFocus();
        }),
      );
      t.focus = Math.min(t.focus, this.navs().length - 1);
      this.applyFocus();
    };
    render();
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
    // Cycle tabs with Q/E.
    const tabKeys = (e: KeyboardEvent) => {
      if (this.top?.el !== el) return;
      const tabs = ['audio', 'graphics', 'gameplay'];
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        tab = tabs[(tabs.indexOf(tab) + (e.code === 'KeyE' ? 1 : 2)) % 3];
        render();
        refreshNav();
      }
    };
    window.addEventListener('keydown', tabKeys);
    const obs = new MutationObserver(() => {
      if (!el.isConnected) {
        window.removeEventListener('keydown', tabKeys);
        obs.disconnect();
      }
    });
    obs.observe(this.root, { childList: true });
  }

  controls(s: Settings, onChange: (s: Settings) => void): void {
    const el = this.screen('dim', `<div class="panel"><h2>CONTROLS</h2><div class="sub">CLICK A BINDING TO REMAP · ESC CANCELS</div><div class="scroll"></div><div class="actions"><button class="btn" data-nav data-a="reset">RESET DEFAULTS</button><button class="btn" data-nav data-a="back">DONE</button></div></div>`);
    const body = el.querySelector('.scroll')!;
    const render = () => {
      body.innerHTML =
        ACTIONS.map(
          (a) => `<div class="row"><label>${ACTION_LABELS[a]}</label><div class="ctrl">
            <button class="bind" data-nav data-b="${a}" data-i="0">${s.bindings[a][0] ? keyLabel(s.bindings[a][0]) : '—'}</button>
            <button class="bind" data-nav data-b="${a}" data-i="1">${s.bindings[a][1] ? keyLabel(s.bindings[a][1]) : '—'}</button>
            <span style="width:80px;opacity:.6;font-family:var(--font-head);font-size:13px">${PAD_LABELS[a] ?? ''}</span></div></div>`,
        ).join('') +
        `<div class="row"><label>Aim</label><div class="ctrl"><span>Mouse · Right Stick</span></div></div>
         <div class="row"><label>Move / Lanes (controller)</label><div class="ctrl"><span>Left Stick · flick up/down</span></div></div>`;
      body.querySelectorAll<HTMLElement>('.bind').forEach((b) =>
        b.addEventListener('click', () => {
          b.classList.add('listening');
          b.textContent = 'PRESS…';
          this.input.captureNext = (code) => {
            b.classList.remove('listening');
            if (code !== 'Escape') {
              const a = b.dataset.b as Action;
              const i = Number(b.dataset.i);
              // Remove the code from any other action to avoid conflicts.
              for (const other of ACTIONS) s.bindings[other] = s.bindings[other].filter((c) => c !== code);
              const list = [...s.bindings[a]];
              list[i] = code;
              s.bindings[a] = list.filter(Boolean);
              onChange(s);
            }
            const focus = this.top?.focus ?? 0;
            render();
            if (this.top) {
              this.top.focus = focus;
              this.applyFocus();
            }
          };
        }),
      );
    };
    render();
    this.bind(el, '[data-a=reset]', () => {
      s.bindings = cloneBindings(DEFAULT_BINDINGS);
      onChange(s);
      render();
    });
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
  }

  armory(save: SaveData, onChange: () => void): void {
    let tab = 'upgrades';
    const el = this.screen('dim', `<div class="panel"><h2>ARMORY</h2><div class="sub">REQUISITION · <span class="rp" data-rp></span></div><div class="tabs"></div><div class="scroll"></div><div class="actions"><button class="btn" data-nav data-a="back">DONE</button></div></div>`);
    const tabsEl = el.querySelector('.tabs')!;
    const body = el.querySelector('.scroll')!;
    const render = () => {
      el.querySelector('[data-rp]')!.textContent = `${save.requisition} RP`;
      tabsEl.innerHTML = ['upgrades', 'loadout', 'armor'].map((t) => `<button class="${t === tab ? 'active' : ''}" data-tab="${t}">${t.toUpperCase()}</button>`).join('');
      let html = '';
      if (tab === 'upgrades') {
        html = '<div class="cards">';
        for (const u of UPGRADES) {
          const lvl = save.upgrades[u.id] ?? 0;
          const maxed = lvl >= u.costs.length;
          const cost = maxed ? 0 : u.costs[lvl];
          const pips = u.costs.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
          html += `<div class="card ${maxed ? 'selected' : ''} ${!maxed && save.requisition < cost ? 'locked' : ''}" data-nav data-u="${u.id}">
            <h3>${u.name.toUpperCase()}<span class="pips">${pips}</span></h3><p>${u.description}</p>
            <div class="meta">${maxed ? 'MAXED' : `UPGRADE · ${cost} RP`}</div></div>`;
        }
        html += '</div>';
      } else if (tab === 'loadout') {
        html = `<p style="opacity:.8;margin-top:0">Choose a secondary weapon to deploy with. Weapons unlock when first recovered in the field.</p><div class="cards">`;
        const options: Array<string | null> = [null, ...Object.keys(WEAPONS).filter((id) => id !== 'ar')];
        for (const id of options) {
          const unlocked = id === null || save.unlockedWeapons.includes(id);
          const w = id ? WEAPONS[id] : null;
          html += `<div class="card ${save.loadoutSecondary === id ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-nav data-w="${id ?? ''}">
            <h3>${w ? w.short : 'NONE'}</h3><p>${w ? (unlocked ? w.description : 'Recover this weapon in the field to unlock.') : 'Deploy with only the AR-41 Vanguard.'}</p>
            <div class="meta">${w ? w.name : 'STANDARD ISSUE'}</div></div>`;
        }
        html += '</div>';
      } else {
        html = '<div class="sub">ARMOR SCHEME</div><div class="cards">';
        for (const a of ARMOR_SCHEMES) {
          const unlocked = save.unlockedCosmetics.includes(a.id);
          const sw = [a.primary, a.secondary, a.accent].map((c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`).join('');
          html += `<div class="card ${save.armor === a.id ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-nav data-ar="${a.id}"><h3>${a.name.toUpperCase()}</h3><p>${sw}</p><div class="meta">${unlocked ? 'AVAILABLE' : '🔒 ' + a.unlock}</div></div>`;
        }
        html += '</div><div class="sub" style="margin-top:18px">VISOR</div><div class="cards">';
        for (const v of VISORS) {
          const unlocked = save.unlockedCosmetics.includes(v.id);
          html += `<div class="card ${save.visor === v.id ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-nav data-vi="${v.id}"><h3>${v.name.toUpperCase()}</h3><p><span class="swatch" style="background:#${v.color.toString(16).padStart(6, '0')};box-shadow:0 0 8px #${v.color.toString(16).padStart(6, '0')}"></span></p><div class="meta">${unlocked ? 'AVAILABLE' : '🔒 ' + v.unlock}</div></div>`;
        }
        html += '</div>';
      }
      body.innerHTML = html;
      tabsEl.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          tab = b.dataset.tab!;
          SFX.uiSelect();
          render();
          rebindNav();
        }),
      );
      body.querySelectorAll<HTMLElement>('[data-u]').forEach((c) =>
        c.addEventListener('click', () => {
          const u = UPGRADES.find((x) => x.id === c.dataset.u)!;
          const lvl = save.upgrades[u.id] ?? 0;
          if (lvl >= u.costs.length || save.requisition < u.costs[lvl]) {
            SFX.uiBack();
            return;
          }
          save.requisition -= u.costs[lvl];
          save.upgrades[u.id] = lvl + 1;
          SFX.uiSelect();
          onChange();
          render();
          rebindNav();
        }),
      );
      body.querySelectorAll<HTMLElement>('[data-w]').forEach((c) =>
        c.addEventListener('click', () => {
          const id = c.dataset.w || null;
          if (id && !save.unlockedWeapons.includes(id)) return SFX.uiBack();
          save.loadoutSecondary = id;
          SFX.uiSelect();
          onChange();
          render();
          rebindNav();
        }),
      );
      body.querySelectorAll<HTMLElement>('[data-ar]').forEach((c) =>
        c.addEventListener('click', () => {
          if (!save.unlockedCosmetics.includes(c.dataset.ar!)) return SFX.uiBack();
          save.armor = c.dataset.ar!;
          SFX.uiSelect();
          onChange();
          render();
          rebindNav();
        }),
      );
      body.querySelectorAll<HTMLElement>('[data-vi]').forEach((c) =>
        c.addEventListener('click', () => {
          if (!save.unlockedCosmetics.includes(c.dataset.vi!)) return SFX.uiBack();
          save.visor = c.dataset.vi!;
          SFX.uiSelect();
          onChange();
          render();
          rebindNav();
        }),
      );
    };
    const rebindNav = () => {
      const t = this.top;
      if (!t) return;
      t.el.querySelectorAll<HTMLElement>('[data-nav]').forEach((n, i) =>
        n.addEventListener('mouseenter', () => {
          t.focus = i;
          this.applyFocus();
        }),
      );
      t.focus = Math.min(t.focus, this.navs().length - 1);
      this.applyFocus();
    };
    render();
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
    const tabKeys = (e: KeyboardEvent) => {
      if (this.top?.el !== el) return;
      const tabs = ['upgrades', 'loadout', 'armor'];
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        tab = tabs[(tabs.indexOf(tab) + (e.code === 'KeyE' ? 1 : 2)) % 3];
        render();
        rebindNav();
      }
    };
    window.addEventListener('keydown', tabKeys);
    const obs = new MutationObserver(() => {
      if (!el.isConnected) {
        window.removeEventListener('keydown', tabKeys);
        obs.disconnect();
      }
    });
    obs.observe(this.root, { childList: true });
  }

  intelArchive(found: string[]): void {
    const items = Object.values(INTEL)
      .map((i) =>
        found.includes(i.id)
          ? `<div class="card" data-nav data-i="${i.id}"><h3>${i.title}</h3><p>${i.author}</p><div class="meta">RECOVERED</div></div>`
          : `<div class="card locked" data-nav><h3>[ENCRYPTED]</h3><p>Recover this log in the field.</p><div class="meta">MISSING</div></div>`,
      )
      .join('');
    const el = this.screen('dim', `<div class="panel"><h2>INTEL ARCHIVE</h2><div class="sub">${found.length} / ${Object.keys(INTEL).length} RECOVERED</div><div class="scroll"><div class="cards">${items}</div></div><div class="actions"><button class="btn" data-nav data-a="back">BACK</button></div></div>`);
    el.querySelectorAll<HTMLElement>('[data-i]').forEach((c) =>
      c.addEventListener('click', () => {
        SFX.uiSelect();
        this.intelReader(c.dataset.i!, () => this.pop());
      }),
    );
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
  }

  intelReader(id: string, onClose: () => void): void {
    const i = INTEL[id];
    if (!i) return onClose();
    const el = this.screen(
      'dim',
      `<div class="intel-doc"><div class="stamp">CLASSIFIED</div><h3>${i.title}</h3><div class="by">${i.author}</div><p>${i.body}</p>
       <div style="text-align:right"><button class="btn primary" data-nav data-a="close">CONTINUE</button></div></div>`,
    );
    this.bind(el, '[data-a=close]', onClose);
    this.push(el, onClose);
  }

  death(onRetry: () => void, onQuit: () => void): void {
    const el = this.screen(
      'dim',
      `<div class="center-col">
        <div class="big-title" style="color:#ff6a5a">SIGNAL LOST</div>
        <div style="letter-spacing:.3em;opacity:.75;margin-bottom:20px">WREN: RESTORING FROM LAST CHECKPOINT</div>
        <div class="menu"><button data-nav data-a="retry">RETRY FROM CHECKPOINT</button><button data-nav data-a="quit">QUIT TO TITLE</button></div>
      </div>`,
    );
    this.bind(el, '[data-a=retry]', onRetry);
    this.bind(el, '[data-a=quit]', onQuit);
    this.closeAll();
    this.push(el);
  }

  results(d: ResultsData, onContinue: () => void, onReplay: () => void): void {
    const mm = Math.floor(d.time / 60);
    const ss = Math.floor(d.time % 60)
      .toString()
      .padStart(2, '0');
    const ch = d.challenges
      .map((c) => {
        const def = CHALLENGES.find((x) => x.id === c.id)!;
        return `<div class="challenge ${c.done ? 'done' : ''}"><span>${c.done ? '✔' : '○'} ${def.name} — ${def.description}</span><span>${c.newly ? '+' + def.reward + ' RP' : ''}</span></div>`;
      })
      .join('');
    const el = this.screen(
      'dim',
      `<div class="panel">
        <h2>MISSION COMPLETE</h2><div class="sub">${MISSION_TEXT.m01.number} · ${MISSION_TEXT.m01.name} · ${DIFFICULTIES[d.difficulty]?.name.toUpperCase() ?? ''}</div>
        <div class="scroll"><div class="results">
          <div><div class="rank">${d.rank}</div><div class="rank-label">MISSION RANK</div></div>
          <div>
            <div class="stat"><span>Score</span><b>${d.score.toLocaleString()}</b></div>
            <div class="stat"><span>Time</span><b>${mm}:${ss}</b></div>
            <div class="stat"><span>Hostiles neutralised</span><b>${d.kills}</b></div>
            <div class="stat"><span>Headshots</span><b>${d.headshots}</b></div>
            <div class="stat"><span>Accuracy</span><b>${Math.round(d.accuracy * 100)}%</b></div>
            <div class="stat"><span>Deaths</span><b>${d.deaths}</b></div>
            <div class="stat"><span>Intel recovered</span><b>${d.intel} / ${d.intelTotal}</b></div>
            <div class="stat"><span>Supply caches</span><b>${d.caches}</b></div>
            <div class="stat"><span>Requisition earned</span><b class="rp">+${d.rpEarned} RP</b></div>
            <div class="sub" style="margin:16px 0 6px">COMBAT CHALLENGES</div>${ch}
            ${d.unlocks.length ? `<div class="sub" style="margin:16px 0 6px">UNLOCKED</div>${d.unlocks.map((u) => `<div class="challenge done"><span>★ ${u}</span></div>`).join('')}` : ''}
          </div>
        </div></div>
        <div class="actions"><button class="btn" data-nav data-a="replay">REPLAY MISSION</button><button class="btn primary" data-nav data-a="continue">CONTINUE</button></div>
      </div>`,
    );
    this.bind(el, '[data-a=continue]', onContinue);
    this.bind(el, '[data-a=replay]', onReplay);
    this.closeAll();
    this.push(el);
    if (this.top) {
      this.top.focus = 1;
      this.applyFocus();
    }
  }

  credits(): void {
    const el = this.screen(
      'dim',
      `<div class="panel" style="width:min(640px,92vw)"><h2>CREDITS</h2><div class="sub">BEYOND THE FOLD · VERTICAL SLICE</div>
       <div class="scroll" style="font-size:18px;line-height:1.6">
        <p>An original 2.5D science-fiction shooter set in a world built from folded paper.</p>
        <p>All models, environments, effects, music and sound are generated procedurally at runtime with Three.js and the Web Audio API.</p>
        <p>Fonts: Chakra Petch and Rajdhani (SIL Open Font License).</p>
        <p style="opacity:.6">The Concord, the Thren, Teskaris and every character in this game are original creations.</p>
       </div><div class="actions"><button class="btn" data-nav data-a="back">BACK</button></div></div>`,
    );
    this.bind(el, '[data-a=back]', () => this.pop());
    this.push(el, () => this.pop());
  }

  pressStart(onStart: () => void): void {
    const el = this.screen(
      'title-screen',
      `<div class="logo"><span class="l1">CONCORD EXPEDITIONARY FORCE</span><span class="l2">BEYOND<br/>THE FOLD</span><span class="crease"></span></div>
       <div class="tagline">A PAPERCRAFT WAR STORY</div>
       <div class="press-start">PRESS ANY KEY</div>`,
    );
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', go);
      window.removeEventListener('mousedown', go);
      window.clearInterval(padTimer);
      onStart();
    };
    window.addEventListener('keydown', go);
    window.addEventListener('mousedown', go);
    const padTimer = window.setInterval(() => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.buttons.some((b) => b.pressed)) go();
    }, 100);
    this.closeAll();
    this.push(el);
  }
}
