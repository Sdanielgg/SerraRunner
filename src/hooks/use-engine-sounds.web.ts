import { Asset } from 'expo-asset';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createEngineMixer, ENGINE_TICK_MS, type EngineAudioFrame } from '@/game/engine-audio';
import { createWebEnginePlayer } from '@/game/web-engine-player';

const modules = {
  jeep: require('../../assets/audio/engine-jeep.wav'),
  crawler: require('../../assets/audio/engine-crawler.wav'),
  rally: require('../../assets/audio/engine-rally.wav'),
  gt3: require('../../assets/audio/engine-gt3.wav'),
};
type Runtime = { context: AudioContext; mixer: ReturnType<typeof createEngineMixer> };

export function useEngineSounds() {
  const runtime = useRef<Runtime | null>(null);
  const currentFrame = useRef<EngineAudioFrame>({ active: false, voices: [] });
  const unlocked = useRef(false); const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const buffers = new Map<string, AudioBuffer>();
    const players = Array.from({ length: 4 }, () => createWebEnginePlayer(context, buffers));
    const mixer = createEngineMixer(players, null);
    const instance = { context, mixer }; runtime.current = instance;
    mixer.update(currentFrame.current);
    if (unlocked.current) mixer.unlock();
    if (mutedRef.current) mixer.toggle();
    const abort = new AbortController();
    let mounted = true;
    const sources = {
      jeep: { uri: Asset.fromModule(modules.jeep).uri },
      crawler: { uri: Asset.fromModule(modules.crawler).uri },
      rally: { uri: Asset.fromModule(modules.rally).uri },
      gt3: { uri: Asset.fromModule(modules.gt3).uri },
    };
    void Promise.all(Object.values(sources).map(async source => {
      const response = await fetch(source.uri, { signal: abort.signal });
      if (!response.ok) throw new Error(`Não foi possível carregar o motor (${response.status}).`);
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      if (mounted) buffers.set(source.uri, decoded);
    })).then(() => { if (mounted) mixer.setSources(sources); })
      .catch(error => { if (mounted) console.warn('Não foi possível preparar o som dos motores.', error); });
    const timer = setInterval(() => mixer.tick(), ENGINE_TICK_MS);
    const resume = () => { if (unlocked.current && !document.hidden && context.state === 'suspended') void context.resume().catch(() => {}); };
    window.addEventListener('focus', resume);
    return () => {
      mounted = false; abort.abort(); clearInterval(timer); window.removeEventListener('focus', resume);
      if (runtime.current === instance) runtime.current = null;
      mixer.dispose(); players.forEach(player => player.dispose()); void context.close().catch(() => {});
    };
  }, []);
  const updateSound = useCallback((frame: EngineAudioFrame) => { currentFrame.current = frame; runtime.current?.mixer.update(frame); }, []);
  const unlockSound = useCallback(() => {
    unlocked.current = true;
    const live = runtime.current;
    if (live) { void live.context.resume().catch(() => {}); live.mixer.unlock(); }
  }, []);
  const toggleSound = useCallback(() => {
    unlocked.current = true; mutedRef.current = !mutedRef.current; setMuted(mutedRef.current);
    const live = runtime.current;
    if (live) { void live.context.resume().catch(() => {}); live.mixer.toggle(); }
  }, []);
  const releaseSound = useCallback(() => {
    currentFrame.current = { ...currentFrame.current, voices: currentFrame.current.voices.map(voice => voice.own ? { ...voice, accelerating: false, braking: false } : voice) };
    runtime.current?.mixer.release();
  }, []);
  const silenceSound = useCallback(() => {
    currentFrame.current = { active: false, voices: [] }; runtime.current?.mixer.silence();
  }, []);
  return { muted, updateSound, unlockSound, toggleSound, releaseSound, silenceSound };
}
