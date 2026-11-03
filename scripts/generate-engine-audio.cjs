/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');

// Original, deterministic engine loops. Every partial completes a whole number
// of cycles. Long local clips avoid frequent queue transitions on mobile.
const sampleRate = 22050;
const frames = sampleRate * 16;
const profiles = { jeep: { pulse: 40, roughness: 0.15 }, crawler: { pulse: 30, roughness: 0.24 }, rally: { pulse: 55, roughness: 0.1 } };
const directory = path.resolve(__dirname, '../assets/audio');
fs.mkdirSync(directory, { recursive: true });
for (const [id, profile] of Object.entries(profiles)) {
  const samples = new Float64Array(frames);
  let peak = 0;
  for (let frame = 0; frame < frames; frame++) {
    const time = frame / sampleRate;
    const cycle = Math.PI * 2 * profile.pulse * time;
    let exhaust = 0;
    for (let harmonic = 1; harmonic <= 14; harmonic++) exhaust += Math.sin(cycle * harmonic + harmonic * 0.21) / harmonic ** 1.25;
    let mechanical = 0;
    for (let partial = 0; partial < 12; partial++) mechanical += Math.sin(Math.PI * 2 * (237 + partial * 97) * time + partial * 1.7) / 12;
    const value = exhaust * (1 + 0.025 * Math.sin(Math.PI * 2 * time)) + profile.roughness * mechanical;
    samples[frame] = value; peak = Math.max(peak, Math.abs(value));
  }
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  samples.forEach((value, index) => wav.writeInt16LE(Math.round(value / peak * 26000), 44 + index * 2));
  fs.writeFileSync(path.join(directory, `engine-${id}.wav`), wav);
}
console.log('Generated engine loops: jeep, crawler, rally.');
