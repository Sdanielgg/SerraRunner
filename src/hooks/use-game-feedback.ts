import { useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { interfaceTiming } from '@/game/interface-config';

// Discrete actions only: never call the OS once per rendered frame. iOS chooses
// its own pulse duration; unsupported devices may ignore vibration entirely.
export function useGameFeedback(enabled: boolean) {
  const active = useRef(enabled);
  const last = useRef(0);
  const cancelFeedback = useCallback(() => Vibration.cancel(), []);
  useEffect(() => { active.current = enabled; if (!enabled) cancelFeedback(); return cancelFeedback; }, [enabled, cancelFeedback]);
  const feedback = useCallback(() => {
    if (!active.current || Date.now() - last.current < interfaceTiming.feedbackCooldownMs) return;
    last.current = Date.now(); Vibration.vibrate(interfaceTiming.vibrationMs);
  }, []);
  return { feedback, cancelFeedback };
}
