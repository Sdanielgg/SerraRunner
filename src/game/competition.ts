import { raceSamples, raceTrack } from './race-track';

// Circuit rules are independent of the Desafio da Serra's 30 checkpoints.
export const competitionRules = { sectors: 12, countdownSeconds: 3, maxSeconds: 600, maxStepDistance: 8, courseId: 'serra-circuit-v1' } as const;
export type CompetitionStatus = { phase: 'idle' | 'countdown' | 'ready' | 'running' | 'saving' | 'saved' | 'save-error' | 'cancelled'; elapsedMs: number; passed: number; total: number; countdown: number; message: string };
type Position = { x: number; y: number; z: number };
const start = 16; // The existing circuit finish line, not the garage/grid.
export const competitionGates = Array.from({ length: competitionRules.sectors + 1 }, (_, i) => raceSamples[(start + Math.round(i * raceSamples.length / competitionRules.sectors)) % raceSamples.length]);
export function createCompetitionRun() {
  let state: CompetitionStatus = { phase: 'idle', elapsedMs: 0, passed: 0, total: competitionGates.length, countdown: 0, message: '' };
  let previous: Position | null = null;
  let elapsed = 0; let waiting = 0;
  return {
    status: () => ({ ...state }),
    start(position: Position) { previous = { ...position }; elapsed = 0; waiting = 0; state = { ...state, phase: 'countdown', elapsedMs: 0, passed: 0, countdown: competitionRules.countdownSeconds, message: '' }; },
    cancel(message = 'Tentativa cancelada. Inicia uma nova volta no menu Online.') { state.phase = 'cancelled'; state.message = message; },
    saving() { state.phase = 'saving'; state.message = 'A guardar resultado…'; },
    saved() { state.phase = 'saved'; state.message = 'Resultado guardado na tua conta.'; },
    failed() { state.phase = 'save-error'; state.message = 'Falha ao guardar. Abre Online para tentar novamente.'; },
    step(dt: number, position: Position, canAdvance = true) {
      if (!previous) return false;
      if (state.phase === 'countdown') {
        state.countdown = Math.max(0, state.countdown - dt);
        if (state.countdown < 0.00001) { state.countdown = 0; state.phase = 'ready'; }
      } else if (state.phase === 'ready' || state.phase === 'running') {
        waiting += dt;
        if (waiting > competitionRules.maxSeconds) { this.cancel('Tempo máximo da tentativa atingido.'); return false; }
        const gate = competitionGates[state.passed];
        const from = (previous.x - gate.x) * gate.dx + (previous.z - gate.z) * gate.dz;
        const to = (position.x - gate.x) * gate.dx + (position.z - gate.z) * gate.dz;
        const distance = Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z);
        const fraction = from < 0 && to >= 0 ? -from / (to - from) : 1;
        const crossX = previous.x + (position.x - previous.x) * fraction;
        const crossZ = previous.z + (position.z - previous.z) * fraction;
        const valid = from < 0 && to >= 0 && distance < competitionRules.maxStepDistance
          && Math.abs((crossX - gate.x) * gate.nx + (crossZ - gate.z) * gate.nz) < raceTrack.width / 2 + 0.5
          && position.y > -0.2 && position.y < 4;
        if (valid && !canAdvance) { this.cancel('O carro atravessou um setor durante a ausência. Inicia uma nova tentativa.'); previous = { ...position }; return false; }
        if (state.phase === 'running') elapsed += dt * (valid && state.passed === competitionGates.length - 1 ? fraction : 1);
        if (valid) {
          if (state.phase === 'ready') { state.phase = 'running'; elapsed = dt * (1 - fraction); }
          state.passed++;
          if (state.passed === competitionGates.length) { state.elapsedMs = Math.max(1, Math.round(elapsed * 1000)); state.phase = 'saving'; previous = { ...position }; return true; }
        }
        state.elapsedMs = Math.round(elapsed * 1000);
      }
      previous = { ...position }; return false;
    },
  };
}
