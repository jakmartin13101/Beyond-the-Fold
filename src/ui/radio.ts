// Radio/subtitle system: queues squad transmissions and plays them with a typewriter effect,
// a speaker portrait and a garbled radio voice texture.
import { RADIO, SPEAKERS } from '../data/story';
import { SFX } from '../audio/sfx';
import { audio } from '../audio/engine';

const PORTRAIT: Record<string, { face: string; visor: string; bg: string }> = {
  kestrel: { face: '#5d6f7c', visor: '#5ff2ff', bg: '#2a1f3c' },
  overwatch: { face: '#c9a88a', visor: '#7fd4ff', bg: '#1a2a3c' },
  heron: { face: '#8a5a3a', visor: '#ffe07a', bg: '#3c2a1a' },
  wren: { face: '#2f8f86', visor: '#9dffd8', bg: '#122a2a' },
};

export class Radio {
  readonly el: HTMLDivElement;
  private queue: string[] = [];
  private current: { id: string; text: string; t: number; dur: number } | null = null;
  private textEl: HTMLElement;
  private whoEl: HTMLElement;
  private portraitEl: HTMLElement;
  private gap = 0;
  subtitles = true;
  cinematic = false;
  /** Emitted when a line starts (used by cutscenes to wait). */
  onLine: ((id: string) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'radio';
    this.el.innerHTML = `
      <div class="portrait"><div class="face"></div><div class="visor"></div><div class="scan"></div></div>
      <div class="radio-body"><div class="radio-who"></div><div class="radio-text"></div></div>`;
    parent.appendChild(this.el);
    this.textEl = this.el.querySelector('.radio-text')!;
    this.whoEl = this.el.querySelector('.radio-who')!;
    this.portraitEl = this.el.querySelector('.portrait')!;
  }

  push(id: string): void {
    if (!RADIO[id]) return;
    // Avoid stacking duplicates.
    if (this.current?.id === id || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  clear(): void {
    this.queue = [];
    this.current = null;
    this.el.classList.remove('show');
  }

  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  setCinematic(on: boolean): void {
    this.cinematic = on;
    this.el.classList.toggle('cine', on);
  }

  update(dt: number): void {
    if (this.current) {
      const c = this.current;
      c.t += dt;
      const chars = Math.min(c.text.length, Math.floor(c.t * 48));
      this.textEl.textContent = c.text.slice(0, chars);
      if (c.t >= c.dur) {
        this.current = null;
        this.gap = 0.35;
        if (!this.queue.length) this.el.classList.remove('show');
      }
      return;
    }
    if (this.gap > 0) {
      this.gap -= dt;
      return;
    }
    const next = this.queue.shift();
    if (!next) return;
    const line = RADIO[next];
    const sp = SPEAKERS[line.speaker];
    const dur = 1.6 + line.text.length * 0.052;
    this.current = { id: next, text: line.text, t: 0, dur };
    this.whoEl.innerHTML = `<span style="color:${sp.color}">${sp.name}</span><small>${sp.role}</small>`;
    this.el.querySelector<HTMLElement>('.radio-body')!.style.borderLeftColor = sp.color;
    const pc = PORTRAIT[line.speaker] ?? PORTRAIT.kestrel;
    this.portraitEl.style.background = pc.bg;
    this.portraitEl.querySelector<HTMLElement>('.face')!.style.background = pc.face;
    const visor = this.portraitEl.querySelector<HTMLElement>('.visor')!;
    visor.style.background = pc.visor;
    visor.style.color = pc.visor;
    this.textEl.textContent = '';
    if (this.subtitles || this.cinematic) this.el.classList.add('show');
    if (audio.ready) {
      SFX.radioBlip();
      const pitch = line.speaker === 'kestrel' ? 110 : line.speaker === 'wren' ? 260 : line.speaker === 'heron' ? 190 : 170;
      SFX.radioVoice(Math.min(dur - 0.6, 5), pitch);
    }
    this.onLine?.(next);
  }
}
