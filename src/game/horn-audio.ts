import type { EnginePlayer, EngineSource } from './engine-audio';
import type { RoomSnapshot } from './network-types';
import type { VehicleId } from './vehicles';

export const HORN_TONES = ['auto', 'low', 'mid', 'high'] as const;
export type HornTone = typeof HORN_TONES[number];
export const HORN_TICK_MS = 20;
export const HORN_DISTANCE = 80;
export const HORN_PULSE_MS = 180;
export type HornVoice = { id: string; vehicleId: VehicleId; tone: HornTone; honking: boolean; distance: number; own: boolean };
export type HornFrame = { active: boolean; voices: HornVoice[] };

export function isHornTone(value: unknown): value is HornTone {
  return value === 'auto' || value === 'low' || value === 'mid' || value === 'high';
}
export function hornRate(vehicleId: VehicleId, tone: HornTone) {
  const automatic = { crawler: 260, jeep: 340, rally: 440, gt3: 520 };
  const frequency = tone === 'auto' ? automatic[vehicleId] : { low: 260, mid: 380, high: 520 }[tone];
  return frequency / 360;
}
export function randomHornTone(previous: HornTone, random = Math.random): HornTone {
  const choices = (['low', 'mid', 'high'] as const).filter(tone => tone !== previous);
  return choices[Math.floor(random() * choices.length)];
}

// A tap schedules its own release, independently of render frames. A newer tap
// replaces the release timer and always changes pitch, even during a quick run.
export function createHornPulse(onChange: (active: boolean, tone: HornTone) => void, random = Math.random,
  schedule: (callback: () => void) => () => void = callback => {
    const timer = setTimeout(callback, HORN_PULSE_MS); return () => clearTimeout(timer);
  }) {
  let active = false; let tone: HornTone = 'auto'; let revision = 0;
  let cancel: (() => void) | null = null;
  function clear() { revision++; cancel?.(); cancel = null; active = false; }
  return {
    get active() { return active; }, get tone() { return tone; },
    trigger() {
      clear(); const token = revision;
      tone = randomHornTone(tone, random); active = true; onChange(true, tone);
      cancel = schedule(() => {
        if (revision !== token) return;
        active = false; cancel = null; onChange(false, tone);
      });
    },
    release() { clear(); onChange(false, tone); },
    dispose: clear,
  };
}
export function nearbyHorns(snapshot: RoomSnapshot, sessionId: string): HornVoice[] {
  const own = snapshot.players.find(player => player.id === sessionId);
  if (!own) return [];
  return snapshot.players.filter(player => player.id !== sessionId && player.horn).map(player => ({
    id: player.id, vehicleId: player.vehicleId, tone: player.hornTone, honking: true, own: false,
    distance: Math.hypot(player.body.position.x - own.body.position.x, player.body.position.y - own.body.position.y, player.body.position.z - own.body.position.z),
  })).filter(voice => voice.distance < HORN_DISTANCE);
}

// A separate pool keeps honking from replacing or restarting any engine loop.
// Hold a continuous cached sound, changing only pitch and a short gain envelope.
export function createHornMixer(players: EnginePlayer[]) {
  const slots = players.map(player => ({ player, id: null as string | null, gain: 0, rate: null as number | null, started: false }));
  let frame: HornFrame = { active: false, voices: [] };
  let ready = false; let muted = false;
  function stop(slot: typeof slots[number]) {
    if (slot.gain !== 0 || slot.started) slot.player.volume = 0;
    if (slot.started) slot.player.pause();
    slot.started = false; slot.gain = 0; slot.id = null;
  }
  function tick(delta = HORN_TICK_MS / 1000) {
    const dt = Math.max(0, Math.min(0.25, delta));
    const audible = ready && frame.active && !muted;
    if (audible) for (const voice of frame.voices) {
      if (!voice.honking || slots.some(slot => slot.id === voice.id)) continue;
      const free = slots.find(slot => slot.id === null);
      if (free) free.id = voice.id;
    }
    for (const slot of slots) {
      const voice = frame.voices.find(value => value.id === slot.id);
      const distance = voice?.distance ?? Infinity;
      const target = audible && voice?.honking && distance < HORN_DISTANCE
        ? (voice.own ? 0.52 : 0.38 / (1 + (distance / 18) ** 2)) : 0;
      if (!slot.player.isLoaded) { slot.gain = 0; if (!target) slot.id = null; continue; }
      slot.gain += (target - slot.gain) * (1 - Math.exp(-dt / (target > slot.gain ? 0.025 : 0.045)));
      if (target === 0 && slot.gain < 0.001) { stop(slot); continue; }
      if (voice && target > 0) {
        const rate = hornRate(voice.vehicleId, voice.tone);
        if (slot.rate !== rate) { slot.player.setPlaybackRate(rate); slot.rate = rate; }
      }
      slot.player.volume = slot.gain;
      if (target > 0 && !slot.started) { slot.player.loop = true; slot.player.play(); slot.started = true; }
    }
  }
  return {
    update(next: HornFrame) { frame = next; }, tick,
    setSource(source: EngineSource) {
      slots.forEach(slot => { stop(slot); slot.player.loop = false; slot.player.shouldCorrectPitch = false; slot.player.replace(source); slot.rate = null; });
      ready = true;
    },
    setMuted(value: boolean) { muted = value; },
    silence() { frame = { active: false, voices: [] }; },
    dispose() { ready = false; slots.forEach(stop); },
  };
}
