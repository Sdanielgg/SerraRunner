/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const filename = path.resolve(__dirname, '../src/game', `${name}.ts`);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths; cache.set(name, mod);
  mod.require = request => request.startsWith('./') ? load(request.slice(2)) : Module.prototype.require.call(mod, request);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return mod.exports;
}
const { createEngineMixer, engineParameters, nearbyEngines } = load('engine-audio');
const voices = [];
for (let i = 0; i < 4; i++) voices.push({
  loop: false, shouldCorrectPitch: true, volume: 0, playing: false, isLoaded: true, rate: 1, source: 1,
  playCalls: 0, replaceCalls: 0, rateCalls: 0,
  play() { this.playing = true; this.playCalls++; }, pause() { this.playing = false; },
  replace(source) { this.source = source; this.replaceCalls++; }, setPlaybackRate(rate) { this.rate = rate; this.rateCalls++; },
});
const mixer = createEngineMixer(voices, { jeep: 1, crawler: 2, rally: 3, gt3: 4 });
const idle = { id: 'self', vehicleId: 'jeep', speed: 0, gearing: 'high', accelerating: false, braking: false, distance: 0, own: true };
mixer.update({ active: true, voices: [idle] }); mixer.tick();
assert.equal(voices[0].playing, false, 'Audio waits for a user gesture');
mixer.unlock();
assert(voices[0].playing && voices[0].loop && voices[0].volume > 0, 'User gesture starts the looping engine');
const idleRate = voices[0].rate;
mixer.update({ active: true, voices: [{ ...idle, speed: 50, accelerating: true }] });
for (let i = 0; i < 10; i++) mixer.tick();
assert(voices[0].rate > idleRate, 'Engine pitch increases under acceleration and speed');
assert.equal(voices[0].shouldCorrectPitch, false, 'Playback rate changes engine pitch');
const starts = voices[0].playCalls;
voices[0].playing = false;
mixer.tick();
assert.equal(voices[0].playCalls, starts, 'A transient playing=false at a loop boundary does not restart playback');
voices[0].playing = true;
for (let i = 0; i < 100; i++) mixer.tick();
const stableRateCalls = voices[0].rateCalls;
for (let i = 0; i < 100; i++) { mixer.unlock(); mixer.tick(); }
assert.equal(voices[0].rateCalls, stableRateCalls, 'Steady speed and repeated input gestures do not reconfigure the audio processor');
const rateUnderLoad = voices[0].rate;
const startsBeforeRelease = voices[0].playCalls;
mixer.release();
for (let i = 0; i < 20; i++) mixer.tick();
assert(voices[0].playing && voices[0].volume > 0, 'Releasing controls on window blur keeps the motor audible');
assert.equal(voices[0].playCalls, startsBeforeRelease, 'Lifting throttle and blur do not pause or restart the motor');
assert(voices[0].rate < rateUnderLoad, 'Releasing controls lets engine speed settle gradually');
const nearby = engineParameters({ ...idle, distance: 5, own: false });
const distant = engineParameters({ ...idle, distance: 40, own: false });
assert(nearby.volume > distant.volume * 5, 'Remote engines attenuate with distance');
assert.equal(engineParameters({ ...idle, distance: 61, own: false }).volume, 0);
assert(engineParameters({ ...idle, speed: 20, gearing: 'low' }).rate > engineParameters({ ...idle, speed: 20, gearing: 'high' }).rate, 'Low gearing revs higher at the same road speed');
const beforeMute = voices[0].volume;
mixer.toggle();
assert.equal(voices[0].volume, beforeMute, 'Mute begins without an immediate volume jump');
mixer.tick(0.1);
assert(voices[0].playing && voices[0].volume > 0 && voices[0].volume < beforeMute, 'Fade-out lowers the volume before pausing');
mixer.tick(0.15);
assert(!voices[0].playing && voices[0].volume === 0, 'Playback pauses only after the fade reaches silence');
mixer.toggle(); assert(voices[0].playing && voices[0].volume === 0, 'Unmuting starts at silence');
mixer.tick(0.1);
assert(voices[0].volume > 0 && voices[0].volume < beforeMute, 'Fade-in raises the volume progressively');
mixer.tick(0.15);
const startsBeforeReverse = voices[0].playCalls;
mixer.toggle(); mixer.tick(0.08);
const intermediateVolume = voices[0].volume;
mixer.toggle();
assert.equal(voices[0].volume, intermediateVolume, 'Reversing a fade keeps the current volume');
mixer.tick(0.08);
assert.equal(voices[0].playCalls, startsBeforeReverse, 'A rapid focus/mute reversal does not restart playback');
mixer.update({ active: true, voices: [{ ...idle, vehicleId: 'crawler' }, { ...idle, id: 'friend', vehicleId: 'rally', own: false, distance: 8 }] }); mixer.tick();
assert.equal(voices[0].source, 2); assert.equal(voices[1].source, 3);
assert(voices[1].playing, 'Nearby multiplayer vehicles have their own engine sounds');
const replacementCounts = voices.map(voice => voice.replaceCalls);
mixer.update({ active: true, voices: [{ ...idle, id: 'friend', vehicleId: 'rally', own: false, distance: 8 }, { ...idle, vehicleId: 'crawler' }] }); mixer.tick();
assert.deepEqual(voices.map(voice => voice.replaceCalls), replacementCounts, 'Reordering nearby cars keeps the same audio players and does not reload clips');
mixer.update({ active: true, voices: [{ ...idle, vehicleId: 'gt3' }] }); mixer.tick();
assert.equal(voices[0].source, 4, 'GT3 has its own engine clip');
assert(voices[0].playing, 'GT3 engine plays through the same stable mixer');
mixer.update({ active: true, voices: [idle] }); mixer.tick();
assert(!voices[1].playing, 'Departing remote vehicles stop their engine sound');
mixer.silence(); mixer.tick(0.1);
assert(voices[0].playing && voices[0].volume > 0, 'Opening a menu fades the engine instead of cutting it');
mixer.tick(0.15); assert(voices.every(voice => !voice.playing), 'Menus/background pause every voice once faded out');
voices[0].isLoaded = false; mixer.update({ active: true, voices: [idle] }); mixer.tick();
assert(!voices[0].playing, 'Unloaded assets do not start playback');
mixer.dispose();
const cachedPlayer = { ...voices[0], playing: false, playCalls: 0, replaceCalls: 0, isLoaded: true };
const cachedMixer = createEngineMixer([cachedPlayer], null);
cachedMixer.update({ active: true, voices: [idle] }); cachedMixer.unlock();
assert.equal(cachedPlayer.replaceCalls, 0, 'Playback waits until sources finish caching');
cachedMixer.setSources({ jeep: { uri: 'file:///engine-jeep.wav' }, crawler: 2, rally: 3, gt3: 4 }); cachedMixer.tick();
assert.equal(cachedPlayer.source.uri, 'file:///engine-jeep.wav', 'Playback uses the cached local asset');
assert(cachedPlayer.playing); cachedMixer.dispose();
const snapshot = { players: [
  { id: 'self', body: { position: { x: 0, y: 0, z: 0 } } },
  ...[100, 10, 5].map((x, i) => ({ id: `p${i}`, vehicleId: 'jeep', speed: 8, gearing: 'high', body: { position: { x, y: 0, z: 0 } } })),
] };
assert.deepEqual(nearbyEngines(snapshot, 'self').map(voice => voice.distance), [5, 10], 'Only nearby engines are mixed, closest first');
for (const id of ['jeep', 'crawler', 'rally', 'gt3']) {
  const wav = fs.readFileSync(path.resolve(__dirname, `../assets/audio/engine-${id}.wav`));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(24), 22050); assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 22050 * 16 * 2, 'Long mono PCM loop avoids frequent queue transitions');
  assert(Math.abs(wav.readInt16LE(44) - wav.readInt16LE(wav.length - 2)) < 3000, 'Loop boundary is continuous');
  let energy = 0; let maximum = 0;
  for (let i = 44; i < wav.length; i += 2) { const value = wav.readInt16LE(i); energy += value * value; maximum = Math.max(maximum, Math.abs(value)); }
  assert(energy > 0 && maximum < 32767, 'Loop is audible and does not clip');
}
console.log('Audio checks passed: gesture unlock, stable loop playback, rate deadband, persistent vehicle voices, cached sources, pitch/load/gearing, mute/background, long seamless WAV assets.');

// Verify the web backend schedules audio-clock ramps and retains its source
// across throttle releases, speed changes, muting and resuming.
const { createWebEnginePlayer } = load('web-engine-player');
class AudioParameter {
  constructor(value = 0) { this.value = value; this.targets = []; }
  cancelAndHoldAtTime() {}
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value, time, timeConstant) { this.targets.push({ value, time, timeConstant }); }
}
const nodes = []; const gains = [];
const context = {
  currentTime: 0, destination: {},
  createGain() { const node = { gain: new AudioParameter(), connect() {}, disconnect() {} }; gains.push(node); return node; },
  createBufferSource() {
    const node = { playbackRate: new AudioParameter(1), starts: 0, stops: 0, connect() {}, disconnect() {}, start() { this.starts++; }, stop() { this.stops++; } };
    nodes.push(node); return node;
  },
};
const webPlayer = createWebEnginePlayer(context, new Map([['1', {}], ['2', {}], ['3', {}]]));
const webMixer = createEngineMixer([webPlayer], { jeep: 1, crawler: 2, rally: 3, gt3: 4 });
webMixer.update({ active: true, voices: [{ ...idle, speed: 40, accelerating: true }] }); webMixer.unlock();
for (let tick = 0; tick < 40; tick++) {
  context.currentTime += 0.08;
  webMixer.update({ active: true, voices: [{ ...idle, speed: 40 - tick * 0.5, accelerating: tick < 10 }] });
  webMixer.tick();
}
webMixer.release(); webMixer.tick(); webMixer.toggle(); webMixer.tick(0.1); webMixer.tick(0.15); webMixer.toggle(); webMixer.tick(0.1);
assert.equal(nodes.length, 1, 'Web speed changes, throttle release and mute/resume reuse one audio buffer source');
assert.equal(nodes[0].starts, 1); assert.equal(nodes[0].stops, 0, 'Playback stays continuous through transitions');
assert(nodes[0].playbackRate.targets.length > 0, 'Pitch changes use scheduled ramps');
assert(gains[0].gain.targets.some(target => target.value === 0), 'Pausing fades volume towards silence');
assert(gains[0].gain.targets.every(target => target.timeConstant > 0), 'Volume transitions use nonzero fade times');
webMixer.silence(); webMixer.tick(0.25); webMixer.update({ active: true, voices: [idle] }); webMixer.tick();
assert.equal(nodes[0].starts, 1, 'Returning from a menu resumes the same source phase');
webMixer.dispose(); webPlayer.dispose();
assert.equal(nodes[0].stops, 1, 'The source is released when the audio backend is disposed');
console.log('Web audio checks passed: continuous buffer playback, smooth pitch/gain, blur/throttle release, fade-out, phase-preserving resume, disposal.');

const { createHornMixer, hornRate, nearbyHorns, isHornTone } = load('horn-audio');
const hornPlayers = Array.from({ length: 4 }, () => ({
  loop: false, shouldCorrectPitch: true, volume: 0, playing: false, isLoaded: true, rate: 1,
  plays: 0, pauses: 0, replacements: 0,
  play() { this.playing = true; this.plays++; }, pause() { this.playing = false; this.pauses++; },
  replace() { this.replacements++; }, setPlaybackRate(rate) { this.rate = rate; },
}));
const ownHorn = { id: 'self', vehicleId: 'jeep', tone: 'auto', honking: true, distance: 0, own: true };
assert.equal(new Set(['jeep', 'crawler', 'rally', 'gt3'].map(id => hornRate(id, 'auto'))).size, 4, 'Each vehicle has a distinct automatic horn pitch');
assert(hornRate('jeep', 'low') < hornRate('jeep', 'mid') && hornRate('jeep', 'mid') < hornRate('jeep', 'high'), 'Manual horn tones run from low to high');
assert(isHornTone('auto') && isHornTone('high') && !isHornTone(100000) && !isHornTone('unknown'), 'Only the supported horn tones are accepted');
const horns = createHornMixer(hornPlayers);
horns.update({ active: true, voices: [ownHorn] }); horns.tick();
assert.equal(hornPlayers[0].plays, 0, 'Horn waits for its cached clip');
horns.setSource(9); horns.tick();
assert.equal(hornPlayers[0].plays, 1); assert.equal(hornPlayers[0].rate, hornRate('jeep', 'auto'));
assert.equal(hornPlayers[0].shouldCorrectPitch, false, 'Horn playback changes the actual pitch');
const initialHornGain = hornPlayers[0].volume;
for (let i = 0; i < 20; i++) horns.tick();
assert(hornPlayers[0].volume > initialHornGain, 'Horn attacks with a short fade');
horns.update({ active: true, voices: [{ ...ownHorn, tone: 'high' }] }); horns.tick();
assert.equal(hornPlayers[0].rate, hornRate('jeep', 'high'));
assert.equal(hornPlayers[0].plays, 1); assert.equal(hornPlayers[0].replacements, 1, 'Changing pitch keeps the continuous horn source');
horns.update({ active: true, voices: [{ ...ownHorn, honking: false }] }); horns.tick();
assert(hornPlayers[0].playing && hornPlayers[0].volume > 0, 'Releasing a horn fades before pausing');
for (let i = 0; i < 30; i++) horns.tick();
assert(!hornPlayers[0].playing && hornPlayers[0].volume === 0, 'Released horn becomes fully silent');
const quartet = [ownHorn, ...['crawler', 'rally', 'gt3'].map((vehicleId, i) => ({ ...ownHorn, id: `friend${i}`, vehicleId, distance: 8 + i * 5, own: false }))];
horns.update({ active: true, voices: quartet });
for (let i = 0; i < 20; i++) horns.tick();
assert(hornPlayers.every(player => player.playing), 'Four players can sound their horns together');
const hornPlayCounts = hornPlayers.map(player => player.plays);
horns.update({ active: true, voices: [...quartet].reverse() }); horns.tick();
assert.deepEqual(hornPlayers.map(player => player.plays), hornPlayCounts, 'Reordering nearby horns does not restart them');
horns.setMuted(true); horns.tick(); assert(hornPlayers.some(player => player.playing), 'Mute uses the horn fade');
for (let i = 0; i < 30; i++) horns.tick();
assert(hornPlayers.every(player => !player.playing), 'Sound mute silences all horns');
horns.setMuted(false); horns.update({ active: true, voices: [ownHorn] }); horns.tick();
horns.silence(); for (let i = 0; i < 30; i++) horns.tick();
assert(hornPlayers.every(player => !player.playing), 'Focus loss and menus release the horn pool');
horns.dispose();
const hornSnapshot = { players: [
  { id: 'self', body: { position: { x: 0, y: 0, z: 0 } } },
  ...[10, 40, 100].map((x, i) => ({ id: `horn${i}`, vehicleId: 'gt3', horn: true, hornTone: 'low', body: { position: { x, y: 0, z: 0 } } })),
] };
assert.deepEqual(nearbyHorns(hornSnapshot, 'self').map(voice => voice.distance), [10, 40], 'Remote horns are audible only within 80 metres');
const hornWav = fs.readFileSync(path.resolve(__dirname, '../assets/audio/horn.wav'));
assert.equal(hornWav.toString('ascii', 0, 4), 'RIFF');
assert.equal(hornWav.readUInt32LE(40), 22050 * 16 * 2);
const boundarySlope = hornWav.readInt16LE(44) - hornWav.readInt16LE(hornWav.length - 2);
const firstSlope = hornWav.readInt16LE(46) - hornWav.readInt16LE(44);
assert(Math.abs(boundarySlope - firstSlope) < 100, 'High-frequency horn loop keeps a continuous slope at its boundary');
let hornEnergy = 0;
for (let i = 44; i < hornWav.length; i += 2) { const sample = hornWav.readInt16LE(i); hornEnergy += sample * sample; assert(Math.abs(sample) < 32767, 'Horn does not clip'); }
assert(hornEnergy > 0, 'Horn asset is audible');
const nodeCount = nodes.length; const gainCount = gains.length;
const webHornPlayer = createWebEnginePlayer(context, new Map([['horn', {}]]), { gainRamp: 0.012, pitchRamp: 0.025 });
const webHorns = createHornMixer([webHornPlayer]); webHorns.setSource({ uri: 'horn' }); webHorns.update({ active: true, voices: [ownHorn] }); webHorns.tick();
webHorns.update({ active: true, voices: [{ ...ownHorn, tone: 'low' }] }); webHorns.tick();
assert.equal(nodes.length, nodeCount + 1, 'Web horn pitch changes use one buffer source');
assert(gains[gainCount].gain.targets.every(target => target.timeConstant === 0.012), 'Web horn uses its shorter audio-clock attack ramp');
assert(nodes[nodeCount].playbackRate.targets.some(target => target.timeConstant === 0.025), 'Web horn pitch transitions are smoothed');
webHorns.dispose(); webHornPlayer.dispose();
console.log('Horn checks passed: vehicle/manual pitches, cached loops, hold/release fades, four independent voices, mute/focus, distance, continuous web playback.');
