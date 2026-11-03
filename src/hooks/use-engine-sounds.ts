import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEngineMixer, ENGINE_TICK_MS, type EngineAudioFrame } from '@/game/engine-audio';

const sources = {
  jeep: require('../../assets/audio/engine-jeep.wav'),
  crawler: require('../../assets/audio/engine-crawler.wav'),
  rally: require('../../assets/audio/engine-rally.wav'),
};
const playerOptions = { updateInterval: 1000, preferredForwardBufferDuration: 16, allowsExternalPlayback: false };

export function useEngineSounds() {
  const own = useAudioPlayer(null, playerOptions);
  const remoteA = useAudioPlayer(null, playerOptions);
  const remoteB = useAudioPlayer(null, playerOptions);
  const remoteC = useAudioPlayer(null, playerOptions);
  const mixer = useMemo(() => createEngineMixer([own, remoteA, remoteB, remoteC], null), [own, remoteA, remoteB, remoteC]);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      Asset.loadAsync([sources.jeep, sources.crawler, sources.rally]),
      setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }),
    ]).then(([assets]) => {
      if (mounted) mixer.setSources({
        jeep: { uri: assets[0].localUri ?? assets[0].uri },
        crawler: { uri: assets[1].localUri ?? assets[1].uri },
        rally: { uri: assets[2].localUri ?? assets[2].uri },
      });
    })
      .catch(error => { if (mounted) console.warn('Não foi possível configurar o som dos motores.', error); });
    const timer = setInterval(() => mixer.tick(), ENGINE_TICK_MS);
    return () => { mounted = false; clearInterval(timer); mixer.dispose(); };
  }, [mixer]);
  const updateSound = useCallback((frame: EngineAudioFrame) => mixer.update(frame), [mixer]);
  const unlockSound = useCallback(() => mixer.unlock(), [mixer]);
  const toggleSound = useCallback(() => setMuted(mixer.toggle()), [mixer]);
  const silenceSound = useCallback(() => mixer.silence(), [mixer]);
  const releaseSound = useCallback(() => mixer.release(), [mixer]);
  return { muted, updateSound, unlockSound, toggleSound, releaseSound, silenceSound };
}
