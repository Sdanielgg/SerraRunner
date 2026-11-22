import { raceSamples, raceLength, raceTrack } from './race-track';

// Circuit-specific rules. Never import the local challenge's checkpoints here.
export const circuitRules = { courseId: 'serra-circuit-race-v1', sectors: 12, startSample: 16, corridorHalfWidth: raceTrack.width / 2 + 1, maxSpeedMps: 90, recoveryPenaltyMs: 5000, recoveryCooldownSeconds: 2, maxRecoveries: 10 } as const;
export type RacePosition = { x: number; y: number; z: number };
const lengths = raceSamples.map((p, i) => { const n = raceSamples[(i + 1) % raceSamples.length]; return Math.hypot(n.x - p.x, n.z - p.z); });
const cumulative = [0];
for (const length of lengths) cumulative.push(cumulative[cumulative.length - 1] + length);
const startDistance = cumulative[circuitRules.startSample];
export const circuitCheckpoints = Array.from({ length: circuitRules.sectors + 1 }, (_, i) => {
  const index = (circuitRules.startSample + Math.round(i * raceSamples.length / circuitRules.sectors)) % raceSamples.length;
  return { ...raceSamples[index], distance: i === circuitRules.sectors ? raceLength : (cumulative[index] - startDistance + raceLength) % raceLength };
});
function projection(p: RacePosition) {
  let best = Infinity; let along = 0;
  for (let i = 0; i < raceSamples.length; i++) {
    const a = raceSamples[i]; const b = raceSamples[(i + 1) % raceSamples.length];
    const dx = b.x - a.x; const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (lengths[i] ** 2)));
    const distance = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    if (distance < best) { best = distance; along = cumulative[i] + lengths[i] * t; }
  }
  return { lateral: best, along: (along - startDistance + raceLength) % raceLength };
}
export function createCircuitLap(initial: RacePosition, maxHeight = 4) {
  let previous = { ...initial }; let projected = projection(initial);
  let progress = projected.along > raceLength / 2 ? projected.along - raceLength : projected.along;
  let passed = 0; let blocked = false; let recoveries = 0; let lastRecovery = -Infinity; let penaltyMs = 0;
  let finished = false;
  return {
    status: () => ({ passed, total: circuitCheckpoints.length, needsRecovery: blocked, recoveries, penaltyMs, progress, finished }),
    step(dt: number, p: RacePosition, canAdvance = true): number | null {
      if (finished || blocked) return null;
      if (![p.x, p.y, p.z].every(Number.isFinite)) { blocked = true; return null; }
      const next = projection(p);
      const travel = Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z);
      const advance = ((next.along - projected.along + raceLength * 1.5) % raceLength) - raceLength / 2;
      if (next.lateral > circuitRules.corridorHalfWidth || p.y < -0.25 || p.y > maxHeight
        || travel > circuitRules.maxSpeedMps * dt + 0.5 || Math.abs(advance) > travel * 1.8 + 0.3) {
        blocked = true; return null;
      }
      progress += advance;
      const gate = circuitCheckpoints[passed];
      const from = (previous.x - gate.x) * gate.dx + (previous.z - gate.z) * gate.dz;
      const to = (p.x - gate.x) * gate.dx + (p.z - gate.z) * gate.dz;
      let fraction: number | null = null;
      if (from < 0 && to >= 0 && Math.abs(progress - gate.distance) < 8) {
        if (!canAdvance) { blocked = true; previous = { ...p }; projected = next; return null; }
        const t = -from / (to - from);
        const x = previous.x + (p.x - previous.x) * t; const z = previous.z + (p.z - previous.z) * t;
        if (Math.abs((x - gate.x) * gate.nx + (z - gate.z) * gate.nz) <= circuitRules.corridorHalfWidth && (passed !== circuitCheckpoints.length - 1 || p.y < 4)) {
          passed++;
          if (passed === circuitCheckpoints.length) { finished = true; fraction = t; }
        }
      }
      // Missing a gate cannot be repaired by doing a second lap or cutting back.
      if (!finished && progress > circuitCheckpoints[passed].distance + 8) blocked = true;
      previous = { ...p }; projected = next;
      return fraction;
    },
    recover(elapsedSeconds: number, lane: number) {
      if (finished || recoveries >= circuitRules.maxRecoveries || elapsedSeconds - lastRecovery < circuitRules.recoveryCooldownSeconds) return null;
      const gate = circuitCheckpoints[Math.max(0, passed - 1)];
      const offset = passed ? 3 : -5;
      const p = { x: gate.x + gate.dx * offset + gate.nx * lane, y: 1.5, z: gate.z + gate.dz * offset + gate.nz * lane, yaw: Math.atan2(-gate.dx, -gate.dz) };
      previous = { ...p }; projected = projection(p); progress = (passed ? gate.distance : 0) + offset;
      blocked = false; recoveries++; penaltyMs += circuitRules.recoveryPenaltyMs; lastRecovery = elapsedSeconds;
      return p;
    },
  };
}
