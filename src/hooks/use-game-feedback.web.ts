import { useCallback, useEffect, useRef } from 'react';
import { interfaceTiming } from '@/game/interface-config';

export function useGameFeedback(enabled: boolean) {
  const active = useRef(enabled);
  const last = useRef(0);
  const cancelFeedback = useCallback(() => { if (typeof navigator !== 'undefined') navigator.vibrate?.(0); }, []);
  useEffect(() => { active.current = enabled; if (!enabled) cancelFeedback(); return cancelFeedback; }, [enabled, cancelFeedback]);
  const feedback = useCallback(() => {
    if (!active.current || Date.now() - last.current < interfaceTiming.feedbackCooldownMs || typeof navigator === 'undefined') return;
    last.current = Date.now(); navigator.vibrate?.(interfaceTiming.vibrationMs);
  }, []);
  return { feedback, cancelFeedback };
}
