import { vehicles, type VehicleId } from './vehicles';
import type { Gearing } from './physics';
import type { RoomSnapshot } from './network-types';

export type EngineVoice = { id: string; vehicleId: VehicleId; speed: number; gearing: Gearing; accelerating: boolean; braking: boolean; distance: number; own: boolean };
export type EngineAudioFrame = { active: boolean; voices: EngineVoice[] };
export const ENGINE_FADE_SECONDS = 0.25;
export const ENGINE_TICK_MS = 40;
export type EngineSource = number | { uri: string };
export type EnginePlayer = {
  loop: boolean; shouldCorrectPitch: boolean; volume: number; playing: boolean; isLoaded: boolean;
  play(): void; pause(): void; replace(source: EngineSource): void; setPlaybackRate(rate: number): void;
};

export function engineParameters(voice: EngineVoice) {
  const limit = vehicles[voice.vehicleId][voice.gearing].forwardLimit * 3.6;
  const speed = Math.min(1, Math.max(0, voice.speed) / limit);
  const load = voice.braking ? 0 : voice.accelerating ? 1 : 0.2;
  const attenuation = voice.own ? 1 : voice.distance >= 60 ? 0 : 1 / (1 + (Math.max(0, voice.distance) / 12) ** 2);
  return {
    rate: Math.min(1.95, 0.8 + speed * 0.85 + load * 0.26),
    volume: (voice.own ? 0.43 : 0.2) * (0.35 + speed * 0.3 + load * 0.35) * attenuation,
  };
}

export function nearbyEngines(snapshot: RoomSnapshot, sessionId: string): EngineVoice[] {
  const own = snapshot.players.find(player => player.id === sessionId);
  if (!own) return [];
  return snapshot.players.filter(player => player.id !== sessionId).map(player => ({
    id: player.id, vehicleId: player.vehicleId, speed: player.speed, gearing: player.gearing,
    accelerating: player.speed > 2, braking: false, own: false,
    distance: Math.hypot(player.body.position.x - own.body.position.x, player.body.position.y - own.body.position.y, player.body.position.z - own.body.position.z),
  })).filter(voice => voice.distance < 60).sort((a, b) => a.distance - b.distance).slice(0, 3);
}

export function createEngineMixer(players: EnginePlayer[], initialSources: Record<VehicleId, EngineSource> | null) {
  const slots = players.map(player => ({
    player, voiceId: null as string | null, vehicleId: null as VehicleId | null,
    volume: 0, rate: 0.8, appliedRate: null as number | null, started: false, configured: false,
  }));
  let sources = initialSources;
  let frame: EngineAudioFrame = { active: false, voices: [] };
  let muted = false; let unlocked = false;
  let fadeGain = 0;
  function stopSlot(slot: typeof slots[number]) {
    if (slot.volume !== 0) slot.player.volume = 0;
    slot.volume = 0;
    if (slot.started) slot.player.pause();
    slot.started = false;
  }
  function stop() {
    slots.forEach(stopSlot);
  }
  function tick(deltaSeconds = ENGINE_TICK_MS / 1000) {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds));
    const audible = !muted && unlocked && frame.active && sources !== null;
    const step = dt / ENGINE_FADE_SECONDS;
    fadeGain = audible ? Math.min(1, fadeGain + step) : Math.max(0, fadeGain - step);
    if (fadeGain < 0.0001) fadeGain = 0;
    if (!audible) {
      // Keep playing while the gain falls. Pause only after the fade finishes;
      // reversing a fade never restarts the source or resets its volume to zero.
      slots.forEach(slot => { if (slot.started) slot.player.volume = slot.volume * fadeGain; });
      if (fadeGain === 0) stop();
      return;
    }
    const volumeBlend = 1 - Math.pow(0.65, dt / 0.08);
    const rateBlend = 1 - Math.pow(0.82, dt / 0.08);
    for (const slot of slots) {
      if (slot.voiceId !== null && !frame.voices.some(voice => voice.id === slot.voiceId)) {
        stopSlot(slot); slot.voiceId = null;
      }
    }
    frame.voices.forEach(voice => {
      // Keep a player bound to the same car when nearby cars swap distance order.
      const slot = slots.find(candidate => candidate.voiceId === voice.id) ?? slots.find(candidate => candidate.voiceId === null);
      if (!slot) return;
      slot.voiceId = voice.id;
      if (slot.vehicleId !== voice.vehicleId) {
        stopSlot(slot); slot.player.loop = false; slot.player.replace(sources![voice.vehicleId]);
        slot.vehicleId = voice.vehicleId; slot.appliedRate = null; slot.configured = false;
        slot.player.shouldCorrectPitch = false;
      }
      if (!slot.player.isLoaded) return;
      const target = engineParameters(voice);
      slot.volume += (target.volume - slot.volume) * volumeBlend;
      slot.rate += (target.rate - slot.rate) * rateBlend;
      slot.player.volume = slot.volume * fadeGain;
      // Native rate setters reconfigure the audio processor. Ignore tiny steady
      // state changes instead of reconfiguring it on every timer tick.
      if (slot.appliedRate === null || Math.abs(slot.rate - slot.appliedRate) >= 0.025) {
        slot.player.setPlaybackRate(slot.rate); slot.appliedRate = slot.rate;
      }
      // Queue the next loop only after the first item's pitch algorithm is set.
      if (!slot.configured) { slot.player.loop = true; slot.configured = true; }
      // `playing` can briefly be false while a loop advances or buffers. Playback
      // intent must survive that transition, otherwise play() restarts its queue.
      if (target.volume > 0 && !slot.started) { slot.player.play(); slot.started = true; }
      if (target.volume === 0) stopSlot(slot);
    });
  }
  return {
    update(next: EngineAudioFrame) { frame = next; },
    setSources(next: Record<VehicleId, EngineSource>) {
      stop(); sources = next; fadeGain = 0;
      slots.forEach(slot => { slot.vehicleId = null; slot.appliedRate = null; slot.configured = false; });
    },
    tick,
    unlock() { if (!unlocked) { unlocked = true; tick(); } },
    toggle() { muted = !muted; unlocked = true; tick(0); return muted; },
    release() { frame = { ...frame, voices: frame.voices.map(voice => voice.own ? { ...voice, accelerating: false, braking: false } : voice) }; },
    silence() { frame = { ...frame, active: false }; tick(0); },
    dispose: stop,
  };
}
