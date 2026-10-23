// Persistent progression: requisition, upgrades, unlocks, collectibles, ranks and checkpoints.

export interface MissionRecord {
  bestRank: string;
  bestScore: number;
  bestTime: number;
  completed: string[];
}

export interface CheckpointSave {
  levelId: string;
  checkpointId: string;
  difficulty: string;
  weapons: Array<{ id: string; mag: number; reserve: number }>;
  current: number;
  grenades: Record<string, number>;
  grenadeType: string;
  collected: string[];
  completedTriggers: string[];
  stats: Record<string, number>;
  time: number;
}

export interface SaveData {
  version: 1;
  requisition: number;
  upgrades: Record<string, number>;
  unlockedWeapons: string[];
  loadoutSecondary: string | null;
  armor: string;
  visor: string;
  unlockedCosmetics: string[];
  intel: string[];
  caches: string[];
  missions: Record<string, MissionRecord>;
  challenges: string[];
  checkpoint: CheckpointSave | null;
  introSeen: boolean;
}

const KEY = 'btf.save.v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    requisition: 0,
    upgrades: {},
    unlockedWeapons: ['ar'],
    loadoutSecondary: null,
    armor: 'kestrel',
    visor: 'cyan',
    unlockedCosmetics: ['kestrel', 'arctic', 'cyan', 'amber'],
    intel: [],
    caches: [],
    missions: {},
    challenges: [],
    checkpoint: null,
    introSeen: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...defaultSave(), ...parsed, version: 1 };
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore: storage unavailable
  }
}

export function resetSave(): SaveData {
  const s = defaultSave();
  writeSave(s);
  return s;
}
