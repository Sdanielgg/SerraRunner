import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { createGameSettings } from '@/game/game-settings';

const store = createGameSettings(AsyncStorage);
let hydration: Promise<void> | undefined;

export function useGameSettings() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => { hydration ??= store.load(); }, []);
  return { ...state, updateSettings: store.update };
}
