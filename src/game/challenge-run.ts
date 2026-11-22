import { challengeCourse, challengeGates, challengeHeightAt, challengeSpawn } from './challenge-course';
import type { VehicleId } from './vehicles';

type Position = { x: number; y: number; z: number };
export type ChallengeStatus = {
  phase: 'idle' | 'countdown' | 'running' | 'finished';
  elapsed: number; countdown: number; passed: number; total: number;
  next: string; distance: number; recoveries: number; best: number | null;
  vehicleId: VehicleId; bestByVehicle: Partial<Record<VehicleId, number>>;
};
export function formatRaceTime(seconds: number) {
  const ticks = Math.max(0, Math.floor(seconds * 100));
  const minutes = Math.floor(ticks / 6000).toString().padStart(2, '0');
  const secs = (Math.floor(ticks / 100) % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}.${(ticks % 100).toString().padStart(2, '0')}`;
}
export function createChallengeRun(bestByVehicle: Partial<Record<VehicleId, number>> = {}) {
  let phase: ChallengeStatus['phase'] = 'idle';
  let elapsed = 0; let countdown = 0; let passed = 0; let recoveries = 0;
  let vehicleId: VehicleId = 'jeep';
  let previous: Position = { ...challengeSpawn };
  function status(position = previous): ChallengeStatus {
    const gate = challengeGates[passed];
    return { phase, elapsed, countdown, passed, total: challengeGates.length,
      next: gate?.name ?? 'Nível concluído', distance: gate ? Math.hypot(gate.x - position.x, gate.z - position.z) : 0,
      recoveries, best: bestByVehicle[vehicleId] ?? null, vehicleId, bestByVehicle: { ...bestByVehicle } };
  }
  return {
    status,
    start(id: VehicleId = 'jeep') { vehicleId = id; phase = 'countdown'; elapsed = 0; countdown = challengeCourse.countdown; passed = 0; recoveries = 0; previous = { ...challengeSpawn }; return status(); },
    cancel() { phase = 'idle'; return status(); },
    step(dt: number, position: Position) {
      if (phase === 'countdown') {
        countdown = Math.max(0, countdown - dt);
        if (countdown <= .00001) { countdown = 0; phase = 'running'; }
      } else if (phase === 'running') {
        const gate = challengeGates[passed];
        const from = (previous.x - gate.x) * gate.dx + (previous.z - gate.z) * gate.dz;
        const to = (position.x - gate.x) * gate.dx + (position.z - gate.z) * gate.dz;
        let crossed = false; let fraction = 1;
        if (from < 0 && to >= 0 && Math.hypot(position.x - previous.x, position.z - previous.z) < 8) {
          fraction = -from / (to - from);
          const x = previous.x + (position.x - previous.x) * fraction;
          const z = previous.z + (position.z - previous.z) * fraction;
          const y = previous.y + (position.y - previous.y) * fraction;
          crossed = Math.abs((x - gate.x) * gate.nx + (z - gate.z) * gate.nz) <= gate.halfWidth
            && y >= challengeHeightAt(x, z) - .2 && y < challengeHeightAt(x, z) + 4;
        }
        elapsed += dt * (crossed && passed === challengeGates.length - 1 ? fraction : 1);
        if (crossed) {
          passed++;
          if (passed === challengeGates.length) { phase = 'finished'; bestByVehicle[vehicleId] = Math.min(bestByVehicle[vehicleId] ?? Infinity, elapsed); }
        }
      }
      previous = { ...position }; return status(position);
    },
    recover() {
      if (phase !== 'running') return null;
      const gate = challengeGates[passed - 1];
      const spawn = gate ? { x: gate.x + gate.dx * 3, z: gate.z + gate.dz * 3, yaw: Math.atan2(-gate.dx, -gate.dz) } : challengeSpawn;
      const point = { ...spawn, y: challengeHeightAt(spawn.x, spawn.z) + 1.4 };
      elapsed += challengeCourse.recoveryPenalty; recoveries++; previous = point; return point;
    },
  };
}
