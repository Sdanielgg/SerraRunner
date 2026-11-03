import type { EnginePlayer, EngineSource } from './engine-audio';

// In-memory audio keeps looping independently of rendering and DOM media events.
// Parameter ramps run on the audio clock, rather than changing pitch in steps.
export function createWebEnginePlayer(context: AudioContext, buffers: Map<string, AudioBuffer>, options: { gainRamp?: number; pitchRamp?: number } = {}): EnginePlayer & { dispose(): void } {
  const gain = context.createGain();
  gain.gain.value = 0; gain.connect(context.destination);
  let source: AudioBufferSourceNode | null = null;
  let buffer: AudioBuffer | null = null;
  let volume = 0; let rate = 0.8; let playing = false; let loop = true;
  const retired = new Set<AudioBufferSourceNode>();
  function ramp(parameter: AudioParam, target: number, timeConstant: number) {
    const now = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else { const current = parameter.value; parameter.cancelScheduledValues(now); parameter.setValueAtTime(current, now); }
    parameter.setTargetAtTime(target, now, timeConstant);
  }
  function retire(node: AudioBufferSourceNode) {
    retired.add(node);
    node.onended = () => { node.disconnect(); retired.delete(node); };
    node.stop(context.currentTime + 0.2);
  }
  return {
    shouldCorrectPitch: false,
    get isLoaded() { return buffer !== null; },
    get playing() { return playing; },
    get loop() { return loop; },
    set loop(value) { loop = value; if (source) source.loop = value; },
    get volume() { return volume; },
    set volume(value) { volume = Math.max(0, Math.min(1, value)); if (playing) ramp(gain.gain, volume, options.gainRamp ?? 0.08); },
    setPlaybackRate(value) {
      rate = Math.max(0.5, Math.min(2, value));
      if (source) ramp(source.playbackRate, rate, options.pitchRamp ?? 0.14);
    },
    replace(next: EngineSource) {
      if (source) { retire(source); source = null; }
      playing = false;
      buffer = buffers.get(typeof next === 'number' ? String(next) : next.uri) ?? null;
    },
    play() {
      if (!buffer) return;
      if (!source) {
        source = context.createBufferSource(); source.buffer = buffer; source.loop = loop;
        source.playbackRate.setValueAtTime(rate, context.currentTime);
        source.connect(gain); source.start();
      }
      playing = true; ramp(gain.gain, volume, options.gainRamp ?? 0.08);
    },
    pause() {
      // Keep the source phase intact while fading out; resuming never reloads it.
      playing = false; ramp(gain.gain, 0, 0.06);
    },
    dispose() {
      playing = false;
      if (source) { source.stop(); source.disconnect(); source = null; }
      for (const node of retired) { node.onended = null; node.stop(); node.disconnect(); }
      retired.clear(); gain.disconnect();
    },
  };
}
