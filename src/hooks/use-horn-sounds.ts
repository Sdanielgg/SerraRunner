import { useAudioPlayer } from 'expo-audio';
import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo } from 'react';
import { createHornMixer, HORN_TICK_MS, type HornFrame } from '@/game/horn-audio';

const source = require('../../assets/audio/horn.wav');
const options = { updateInterval: 1000, preferredForwardBufferDuration: 16, allowsExternalPlayback: false };
export function useHornSounds(muted: boolean) {
  const own = useAudioPlayer(null, options); const a = useAudioPlayer(null, options);
  const b = useAudioPlayer(null, options); const c = useAudioPlayer(null, options);
  const mixer = useMemo(() => createHornMixer([own, a, b, c]), [own, a, b, c]);
  useEffect(() => { mixer.setMuted(muted); }, [mixer, muted]);
  useEffect(() => {
    let mounted = true;
    void Asset.loadAsync(source).then(([asset]) => {
      if (mounted) mixer.setSource({ uri: asset.localUri ?? asset.uri });
    }).catch(error => console.warn('Não foi possível preparar a buzina.', error));
    const timer = setInterval(() => mixer.tick(), HORN_TICK_MS);
    return () => { mounted = false; clearInterval(timer); mixer.dispose(); };
  }, [mixer]);
  const updateHorn = useCallback((frame: HornFrame) => mixer.update(frame), [mixer]);
  const silenceHorn = useCallback(() => mixer.silence(), [mixer]);
  const unlockHorn = useCallback(() => mixer.tick(0), [mixer]);
  return { updateHorn, silenceHorn, unlockHorn };
}
