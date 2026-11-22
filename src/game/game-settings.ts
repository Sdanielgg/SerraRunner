export type GameSettings = { sound: boolean; vibration: boolean; reducedGraphics: boolean };
export const gameSettingsKey = 'ramp-rivals:settings:v1';
export const defaultGameSettings: GameSettings = { sound: true, vibration: false, reducedGraphics: false };
export function parseGameSettings(raw: string | null): GameSettings {
  try {
    const value = JSON.parse(raw ?? '{}');
    return Object.fromEntries(Object.entries(defaultGameSettings).map(([key, fallback]) => [key,
      typeof value?.[key] === 'boolean' ? value[key] : fallback])) as GameSettings;
  } catch { return { ...defaultGameSettings }; }
}

// Serialise writes and merge changes made while storage is loading. A failed
// write keeps the in-memory choice and can be retried with the next change.
export function createGameSettings(storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> }) {
  let state = { settings: { ...defaultGameSettings }, loaded: false, saved: true };
  let dirty: Partial<GameSettings> = {};
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  function notify() { listeners.forEach(listener => listener()); }
  function persist() {
    const value = JSON.stringify(state.settings);
    writes = writes.then(async () => {
      try { await storage.setItem(gameSettingsKey, value); state = { ...state, saved: true }; }
      catch { state = { ...state, saved: false }; }
      notify();
    });
    return writes;
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      try { state = { ...state, settings: { ...parseGameSettings(await storage.getItem(gameSettingsKey)), ...dirty }, loaded: true }; }
      catch { state = { ...state, loaded: true, saved: false }; }
      notify();
      if (Object.keys(dirty).length) await persist();
    },
    update(change: Partial<GameSettings>) {
      dirty = { ...dirty, ...change }; state = { ...state, settings: { ...state.settings, ...change } }; notify();
      return state.loaded ? persist() : Promise.resolve();
    },
  };
}
