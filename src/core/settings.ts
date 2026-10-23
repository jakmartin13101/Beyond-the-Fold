import { Bindings, DEFAULT_BINDINGS, cloneBindings } from './input';

export type Quality = 'low' | 'medium' | 'high';
export type DifficultyId = 'recruit' | 'regular' | 'veteran' | 'ironclad';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  quality: Quality;
  shadows: boolean;
  bloom: boolean;
  particles: number;
  resolutionScale: number;
  screenShake: number;
  subtitles: boolean;
  aimAssist: boolean;
  showFps: boolean;
  difficulty: DifficultyId;
  bindings: Bindings;
}

const KEY = 'btf.settings.v1';

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.85,
    voiceVolume: 0.8,
    quality: 'high',
    shadows: true,
    bloom: true,
    particles: 1,
    resolutionScale: 1,
    screenShake: 1,
    subtitles: true,
    aimAssist: true,
    showFps: false,
    difficulty: 'regular',
    bindings: cloneBindings(DEFAULT_BINDINGS),
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged: Settings = { ...base, ...parsed, bindings: cloneBindings({ ...base.bindings, ...(parsed.bindings ?? {}) }) };
    return merged;
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings then last for the session only.
  }
}
