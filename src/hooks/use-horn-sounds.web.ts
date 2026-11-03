import { Asset } from 'expo-asset';
import { useCallback, useEffect, useRef } from 'react';
import { createHornMixer, HORN_TICK_MS, type HornFrame } from '@/game/horn-audio';
import { createWebEnginePlayer } from '@/game/web-engine-player';

const moduleSource = require('../../assets/audio/horn.wav');
export function useHornSounds(muted: boolean) {
  const runtime = useRef<{ context: AudioContext; mixer: ReturnType<typeof createHornMixer> } | null>(null);
  const latest = useRef<HornFrame>({ active: false, voices: [] });
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; runtime.current?.mixer.setMuted(muted); }, [muted]);
  useEffect(() => {
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context(); const buffers = new Map<string, AudioBuffer>();
    const players = Array.from({ length: 4 }, () => createWebEnginePlayer(context, buffers, { gainRamp: 0.012, pitchRamp: 0.025 }));
    const mixer = createHornMixer(players); mixer.setMuted(mutedRef.current); mixer.update(latest.current);
    runtime.current = { context, mixer };
    const source = { uri: Asset.fromModule(moduleSource).uri }; const abort = new AbortController();
    let mounted = true;
    void fetch(source.uri, { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error(`Buzina indisponível (${response.status}).`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (mounted) { buffers.set(source.uri, buffer); mixer.setSource(source); }
    }).catch(error => { if (mounted) console.warn('Não foi possível preparar a buzina.', error); });
    const timer = setInterval(() => mixer.tick(), HORN_TICK_MS);
    return () => {
      mounted = false; abort.abort(); clearInterval(timer); runtime.current = null;
      mixer.dispose(); players.forEach(player => player.dispose()); void context.close().catch(() => {});
    };
  }, []);
  const updateHorn = useCallback((frame: HornFrame) => {
    latest.current = frame; runtime.current?.mixer.update(frame);
  }, []);
  const unlockHorn = useCallback(() => { const context = runtime.current?.context; if (context?.state === 'suspended') void context.resume().catch(() => {}); }, []);
  const silenceHorn = useCallback(() => { latest.current = { active: false, voices: [] }; runtime.current?.mixer.silence(); }, []);
  return { updateHorn, silenceHorn, unlockHorn };
}
