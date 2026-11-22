import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { controlPreferencesKey, defaultControlPreferences, parseControlPreferences, type ControlPreferences } from '@/game/control-layout';

export function useControlPreferences() {
  const [preferences, setPreferences] = useState<ControlPreferences>(defaultControlPreferences);
  const [saved, setSaved] = useState(true);
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(controlPreferencesKey).then(value => { if (active && !changed.current) setPreferences(parseControlPreferences(value)); }).catch(() => { if (active) setSaved(false); });
    return () => { active = false; };
  }, []);
  const updatePreferences = useCallback((next: ControlPreferences) => {
    changed.current = true; setPreferences(next);
    writes.current = writes.current.catch(() => {}).then(async () => {
      try { await AsyncStorage.setItem(controlPreferencesKey, JSON.stringify(next)); setSaved(true); }
      catch { setSaved(false); }
    });
  }, []);
  return { preferences, updatePreferences, saved };
}
