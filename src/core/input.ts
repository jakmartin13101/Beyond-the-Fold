// Unified input: keyboard, mouse and gamepad mapped onto named actions.
// Edge-triggered "pressed" states are latched until a simulation step consumes them,
// so taps are never lost when the render rate and the fixed simulation rate differ.

export type Action =
  | 'left'
  | 'right'
  | 'laneIn'
  | 'laneOut'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'fire'
  | 'grenade'
  | 'melee'
  | 'reload'
  | 'interact'
  | 'switchWeapon'
  | 'cycleGrenade'
  | 'pause';

export const ACTIONS: Action[] = [
  'left',
  'right',
  'laneIn',
  'laneOut',
  'jump',
  'sprint',
  'crouch',
  'fire',
  'grenade',
  'melee',
  'reload',
  'interact',
  'switchWeapon',
  'cycleGrenade',
  'pause',
];

export const ACTION_LABELS: Record<Action, string> = {
  left: 'Move Left',
  right: 'Move Right',
  laneIn: 'Step Into Background',
  laneOut: 'Step Into Foreground',
  jump: 'Jump',
  sprint: 'Sprint',
  crouch: 'Crouch / Dodge Roll',
  fire: 'Fire',
  grenade: 'Throw Grenade',
  melee: 'Melee',
  reload: 'Reload',
  interact: 'Interact / Swap Weapon',
  switchWeapon: 'Switch Weapon',
  cycleGrenade: 'Cycle Grenade Type',
  pause: 'Pause',
};

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  laneIn: ['KeyW', 'ArrowUp'],
  laneOut: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC'],
  fire: ['Mouse0'],
  grenade: ['Mouse2', 'KeyG'],
  melee: ['KeyF', 'KeyV'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  switchWeapon: ['KeyQ', 'WheelUp', 'WheelDown', 'Digit1', 'Digit2'],
  cycleGrenade: ['KeyT', 'KeyX'],
  pause: ['Escape', 'KeyP'],
};

// Standard gamepad mapping indices.
const PAD: Record<Action, number[]> = {
  left: [14],
  right: [15],
  laneIn: [12],
  laneOut: [13],
  jump: [0],
  sprint: [10],
  crouch: [1],
  fire: [7],
  grenade: [6],
  melee: [5],
  reload: [2],
  interact: [2],
  switchWeapon: [3],
  cycleGrenade: [4],
  pause: [9],
};

export const PAD_LABELS: Partial<Record<Action, string>> = {
  jump: 'A',
  crouch: 'B',
  reload: 'X',
  interact: 'Hold X',
  switchWeapon: 'Y',
  fire: 'RT',
  grenade: 'LT',
  melee: 'RB',
  cycleGrenade: 'LB',
  sprint: 'L3',
  laneIn: 'D-Pad Up',
  laneOut: 'D-Pad Down',
  pause: 'Start',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Mouse0: 'LMB',
    Mouse1: 'MMB',
    Mouse2: 'RMB',
    WheelUp: 'Wheel',
    WheelDown: 'Wheel',
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
  };
  return map[code] ?? code;
}

interface ActionState {
  down: boolean;
  pressed: boolean;
  released: boolean;
  /** time the action has been held, seconds */
  held: number;
}

export type Device = 'kbm' | 'pad';

export class Input {
  bindings: Bindings;
  private keys = new Set<string>();
  private latchedPress = new Set<string>();
  private latchedRelease = new Set<string>();
  private state = new Map<Action, ActionState>();
  private padPrev: boolean[] = [];
  private padDown: boolean[] = [];
  private padLatchedPress = new Set<number>();
  /** Mouse position in CSS pixels relative to the canvas. */
  mouseX = 0;
  mouseY = 0;
  mouseInside = false;
  /** Right stick aim vector (gamepad). */
  aimX = 0;
  aimY = 0;
  /** Left stick. */
  moveX = 0;
  moveY = 0;
  device: Device = 'kbm';
  enabled = true;
  /** When set, the next key/button press is captured for rebinding instead of gameplay. */
  captureNext: ((code: string) => void) | null = null;
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private lastPadLaneY = 0;
  private padConnected = false;
  anyPressedThisFrame = false;

  constructor(private element: HTMLElement, bindings?: Bindings) {
    this.bindings = bindings ? cloneBindings(bindings) : cloneBindings(DEFAULT_BINDINGS);
    for (const a of ACTIONS) this.state.set(a, { down: false, pressed: false, released: false, held: 0 });
    this.attach();
  }

  private listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.listeners.push([target, type, fn]);
  }

  private attach(): void {
    this.listen(window, 'keydown', (e) => {
      const ev = e as KeyboardEvent;
      if (this.captureNext) {
        ev.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(ev.code);
        return;
      }
      if (shouldPrevent(ev.code)) ev.preventDefault();
      if (ev.repeat) return;
      this.device = 'kbm';
      this.anyPressedThisFrame = true;
      this.keys.add(ev.code);
      this.latchedPress.add(ev.code);
    });
    this.listen(window, 'keyup', (e) => {
      const ev = e as KeyboardEvent;
      this.keys.delete(ev.code);
      this.latchedRelease.add(ev.code);
    });
    this.listen(window, 'blur', () => {
      for (const k of this.keys) this.latchedRelease.add(k);
      this.keys.clear();
    });
    this.listen(this.element, 'mousedown', (e) => {
      const ev = e as MouseEvent;
      const code = 'Mouse' + ev.button;
      if (this.captureNext) {
        ev.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(code);
        return;
      }
      this.device = 'kbm';
      this.anyPressedThisFrame = true;
      this.keys.add(code);
      this.latchedPress.add(code);
    });
    this.listen(window, 'mouseup', (e) => {
      const code = 'Mouse' + (e as MouseEvent).button;
      this.keys.delete(code);
      this.latchedRelease.add(code);
    });
    this.listen(window, 'mousemove', (e) => {
      const ev = e as MouseEvent;
      const r = this.element.getBoundingClientRect();
      this.mouseX = ev.clientX - r.left;
      this.mouseY = ev.clientY - r.top;
      this.mouseInside = true;
      if (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2) this.device = 'kbm';
    });
    this.listen(this.element, 'contextmenu', (e) => e.preventDefault());
    this.listen(
      this.element,
      'wheel',
      (e) => {
        const ev = e as WheelEvent;
        const code = ev.deltaY < 0 ? 'WheelUp' : 'WheelDown';
        if (this.captureNext) {
          const cb = this.captureNext;
          this.captureNext = null;
          cb(code);
          return;
        }
        this.latchedPress.add(code);
        this.latchedRelease.add(code);
      },
      { passive: true },
    );
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners = [];
  }

  /** Poll gamepads; call once per rendered frame. */
  pollGamepad(): void {
    const pads = readGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.padConnected = !!pad;
    if (!pad) {
      this.moveX = 0;
      this.moveY = 0;
      this.aimX = 0;
      this.aimY = 0;
      return;
    }
    const dz = (v: number, d = 0.2): number => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = pad.axes[2] ?? 0;
    const ry = pad.axes[3] ?? 0;
    this.moveX = lx;
    this.moveY = ly;
    const rmag = Math.hypot(rx, ry);
    if (rmag > 0.3) {
      this.aimX = rx / rmag;
      this.aimY = -ry / rmag;
      this.device = 'pad';
    } else {
      this.aimX = 0;
      this.aimY = 0;
    }
    if (Math.abs(lx) > 0.3) this.device = 'pad';
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i];
      const down = b.pressed || b.value > 0.5;
      if (down && !this.padPrev[i]) {
        this.padLatchedPress.add(i);
        this.device = 'pad';
        this.anyPressedThisFrame = true;
      }
      this.padDown[i] = down;
      this.padPrev[i] = down;
    }
    // Left stick flick up/down acts as lane switch.
    if (ly < -0.75 && this.lastPadLaneY >= -0.75) this.padLatchedPress.add(12);
    if (ly > 0.75 && this.lastPadLaneY <= 0.75) this.padLatchedPress.add(13);
    this.lastPadLaneY = ly;
  }

  get hasGamepad(): boolean {
    return this.padConnected;
  }

  /** Resolve latched raw events into action states. Call once per simulation step. */
  beginStep(dt: number): void {
    for (const a of ACTIONS) {
      const st = this.state.get(a)!;
      const codes = this.bindings[a];
      let down = false;
      let pressed = false;
      let released = false;
      for (const c of codes) {
        if (this.keys.has(c)) down = true;
        if (this.latchedPress.has(c)) pressed = true;
        if (this.latchedRelease.has(c)) released = true;
      }
      for (const b of PAD[a]) {
        if (this.padDown[b]) down = true;
        if (this.padLatchedPress.has(b)) pressed = true;
      }
      if (a === 'left' && this.moveX < -0.25) down = true;
      if (a === 'right' && this.moveX > 0.25) down = true;
      // A tap that was pressed and released between steps still registers as down for one step.
      if (pressed) down = true;
      st.released = (st.down && !down) || (released && !down);
      st.pressed = pressed;
      st.held = down ? st.held + dt : 0;
      st.down = down;
    }
  }

  endStep(): void {
    this.latchedPress.clear();
    this.latchedRelease.clear();
    this.padLatchedPress.clear();
  }

  down(a: Action): boolean {
    return this.enabled && this.state.get(a)!.down;
  }
  pressed(a: Action): boolean {
    return this.enabled && this.state.get(a)!.pressed;
  }
  released(a: Action): boolean {
    return this.enabled && this.state.get(a)!.released;
  }
  heldTime(a: Action): number {
    return this.enabled ? this.state.get(a)!.held : 0;
  }

  /** Horizontal movement axis in [-1, 1] combining keys and stick. */
  axisX(): number {
    if (!this.enabled) return 0;
    if (Math.abs(this.moveX) > 0.25) return Math.sign(this.moveX) * Math.min(1, Math.abs(this.moveX) * 1.15);
    let v = 0;
    if (this.state.get('left')!.down) v -= 1;
    if (this.state.get('right')!.down) v += 1;
    return v;
  }

  /** Raw (non-latched) check used by menus each frame. */
  menuPressed(codes: string[], padButtons: number[] = []): boolean {
    for (const c of codes) if (this.latchedPress.has(c)) return true;
    for (const b of padButtons) if (this.padLatchedPress.has(b)) return true;
    return false;
  }

  /** Clears latched input; used by menus after consuming a frame of input. */
  flushFrame(): void {
    this.anyPressedThisFrame = false;
  }

  resetAll(): void {
    this.keys.clear();
    this.latchedPress.clear();
    this.latchedRelease.clear();
    this.padLatchedPress.clear();
    for (const st of this.state.values()) {
      st.down = st.pressed = st.released = false;
      st.held = 0;
    }
  }

  labelFor(a: Action): string {
    if (this.device === 'pad') return PAD_LABELS[a] ?? '?';
    const codes = this.bindings[a];
    return codes.length ? keyLabel(codes[0]) : '—';
  }
}

/** Gamepads, or none when the API is missing or blocked (e.g. inside a sandboxed frame). */
export function readGamepads(): (Gamepad | null)[] {
  try {
    return typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [];
  } catch {
    return [];
  }
}

export function cloneBindings(b: Bindings): Bindings {
  const out = {} as Bindings;
  for (const a of ACTIONS) out[a] = [...(b[a] ?? DEFAULT_BINDINGS[a])];
  return out;
}

function shouldPrevent(code: string): boolean {
  return (
    code === 'Space' ||
    code === 'Tab' ||
    code.startsWith('Arrow') ||
    code === 'KeyF' ||
    code === 'KeyS' ||
    code === 'KeyP'
  );
}
