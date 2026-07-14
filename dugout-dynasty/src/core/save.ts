import { GameState, SAVE_VERSION } from './state';

const KEY = 'dugout-dynasty-save';

export interface SaveStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage-backed store; swap for Capacitor Preferences later if desired. */
export const localSaveStore: SaveStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or unavailable — skip this save */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export function saveGame(state: GameState, store: SaveStore = localSaveStore): void {
  state.version = SAVE_VERSION;
  store.set(KEY, JSON.stringify(state));
}

export function loadGame(store: SaveStore = localSaveStore): GameState | null {
  const raw = store.get(KEY);
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as GameState;
    if (typeof state.version !== 'number' || state.version > SAVE_VERSION) return null;
    return migrate(state);
  } catch {
    return null;
  }
}

export function clearSave(store: SaveStore = localSaveStore): void {
  store.remove(KEY);
}

/** Bring older saves up to the current schema. v1 is the first version. */
function migrate(state: GameState): GameState {
  // future: if (state.version === 1) { ...; state.version = 2; }
  return state;
}
