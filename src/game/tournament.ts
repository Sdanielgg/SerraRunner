import { createCircuitLap, type RacePosition } from './circuit-race';
import type { VehicleId } from './vehicles';
import { economyRules } from './economy-config';
import type { RewardEvent } from './economy-config';
import type { UpgradeLevels } from './upgrades';

export const tournamentRules = { targetPoints: 15, demoTargetPoints: 3, minPlayers: 2, maxPlayers: 4, countdownSeconds: 3, roundSeconds: 180, resultsSeconds: 8 } as const;
export type TournamentConfig = { countdownSeconds: number; roundSeconds: number; resultsSeconds: number };
export type RaceMember = { id: string; userId: string; name: string; color: string; vehicleId: VehicleId; slot: number; connected: boolean; departed: boolean; ready: boolean; points: number; passed: number; total: number; recoveries: number; needsRecovery: boolean; finishMs: number | null; status: 'waiting' | 'racing' | 'finished' | 'dnf' };
export type TournamentSnapshot = { phase: 'lobby' | 'countdown' | 'race' | 'results' | 'garage' | 'finished'; started: boolean; hostId: string | null; matchId: string; roundId: string; round: number; targetPoints: number; countdown: number; remainingSeconds: number; winnerId: string | null; championId: string | null; persistence: 'idle' | 'pending' | 'saved' | 'error'; members: RaceMember[]; rewardsPending?: boolean; rewardsError?: boolean; phasePending?: boolean; phaseError?: boolean };
export type TournamentAction = { type: 'ready'; ready: boolean } | { type: 'target'; points: number } | { type: 'start'; round: number } | { type: 'garage' | 'end' | 'new' | 'retry' };
export type TournamentRoundRecord = { id: string; match_id: string; round_number: number; target_points: number; room_code: string; course_id?: string; winner_user_id: string | null; entries: { user_id: string; name: string; vehicle_id: VehicleId; elapsed_ms: number | null; points: number; recoveries: number; participated?: boolean; upgrades?: UpgradeLevels; rewards?: RewardEvent[] }[] };
export function createTournament(config: TournamentConfig = tournamentRules) {
  let state: TournamentSnapshot = { phase: 'lobby', started: false, hostId: null, matchId: '', roundId: '', round: 0, targetPoints: tournamentRules.targetPoints, countdown: 0, remainingSeconds: config.roundSeconds, winnerId: null, championId: null, persistence: 'idle', members: [] };
  const laps = new Map<string, ReturnType<typeof createCircuitLap>>();
  let elapsed = 0; let phaseElapsed = 0; let awardedRound = -1;
  function settle() {
    if (state.phase !== 'race' || awardedRound === state.round) return;
    const finishers = state.members.filter(m => m.finishMs !== null).sort((a, b) => a.finishMs! - b.finishMs! || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
    const winner = finishers[0];
    state.winnerId = winner?.id ?? null;
    if (winner) { winner.points += 1; if (winner.points >= state.targetPoints) state.championId = winner.id; }
    for (const member of state.members) if (member.status === 'racing') member.status = 'dnf';
    awardedRound = state.round; state.phase = 'results'; state.persistence = 'pending'; phaseElapsed = 0;
  }
  return {
    snapshot: (): TournamentSnapshot => ({ ...state, members: state.members.map(m => ({ ...m })) }),
    add(member: Omit<RaceMember, 'departed' | 'ready' | 'points' | 'passed' | 'total' | 'recoveries' | 'needsRecovery' | 'finishMs' | 'status'>) {
      if (state.started || state.phase !== 'lobby' || state.members.length >= tournamentRules.maxPlayers || state.members.some(m => m.userId === member.userId)) throw new Error('Sala indisponível para novas entradas.');
      state.members.push({ ...member, departed: false, ready: false, points: 0, passed: 0, total: 13, recoveries: 0, needsRecovery: false, finishMs: null, status: 'waiting' });
      if (!state.hostId) state.hostId = member.id;
      state.members.forEach(m => { m.ready = false; });
    },
    update(id: string, change: Partial<Pick<RaceMember, 'name' | 'color' | 'vehicleId' | 'connected'>>) {
      const m = state.members.find(m => m.id === id); if (!m) return;
      if (change.vehicleId && !['lobby', 'garage'].includes(state.phase)) throw new Error('Só podes trocar de veículo no lobby ou garagem.');
      const changed = change.vehicleId !== undefined && change.vehicleId !== m.vehicleId || change.name !== undefined && change.name !== m.name || change.color !== undefined && change.color !== m.color;
      Object.assign(m, change); if (changed || change.connected === false) m.ready = false;
      if (!state.hostId && change.connected === true && !m.departed) state.hostId = m.id;
    },
    remove(id: string) {
      if (!state.started) state.members = state.members.filter(m => m.id !== id);
      else { const m = state.members.find(m => m.id === id); if (m) { m.connected = false; m.departed = true; m.ready = false; if (m.status === 'racing') m.status = 'dnf'; } }
      if (state.hostId === id) state.hostId = state.members.find(m => m.id !== id && m.connected)?.id ?? null;
    },
    ready(id: string, ready: boolean) {
      if (!['lobby', 'garage'].includes(state.phase) || state.championId) throw new Error('Não é possível alterar pronto nesta fase.');
      const m = state.members.find(m => m.id === id); if (!m?.connected) throw new Error('Jogador desligado.'); m.ready = ready;
    },
    target(id: string, points: number) {
      if (id !== state.hostId || state.started || state.phase !== 'lobby' || !Number.isInteger(points) || points < 1 || points > tournamentRules.targetPoints) throw new Error('Objetivo inválido ou sem permissão.');
      state.targetPoints = points; state.members.forEach(m => { m.ready = false; });
    },
    start(id: string, expectedRound: number, matchId: string, roundId: string) {
      const entrants = state.members.filter(m => m.connected);
      if (id !== state.hostId || !['lobby', 'garage'].includes(state.phase) || state.championId || expectedRound !== state.round
        || entrants.length < tournamentRules.minPlayers || !entrants.every(m => m.ready) || state.members.some(m => !m.connected && !m.departed)) throw new Error('O anfitrião precisa de 2 a 4 jogadores ligados e todos prontos.');
      if (state.persistence === 'pending' || state.persistence === 'error') throw new Error('Guarda os resultados da ronda anterior antes de iniciar outra.');
      state.started = true; state.matchId ||= matchId; state.roundId = roundId; state.round++;
      state.phase = 'countdown'; state.countdown = config.countdownSeconds; state.winnerId = null; state.persistence = 'idle'; state.remainingSeconds = config.roundSeconds;
      laps.clear(); elapsed = 0; phaseElapsed = 0;
      for (const m of state.members) { m.passed = 0; m.finishMs = null; m.recoveries = 0; m.needsRecovery = false; m.ready = false; m.status = m.connected ? 'racing' : 'dnf'; }
    },
    garage(id?: string) {
      if (state.phase !== 'results' || id && id !== state.hostId) throw new Error('Não é possível ir para a garagem.');
      state.phase = 'garage'; state.members.forEach(m => { m.ready = false; });
    },
    end(id: string) { if (id !== state.hostId || !['garage', 'lobby'].includes(state.phase)) throw new Error('Não é possível terminar nesta fase.'); state.phase = 'finished'; },
    reset(id: string) {
      if (id !== state.hostId || state.phase !== 'finished' || state.persistence === 'pending' || state.persistence === 'error') throw new Error('Termina e guarda os resultados antes de criar outra competição.');
      const members = state.members.filter(m => m.connected);
      state = { ...state, phase: 'lobby', started: false, targetPoints: tournamentRules.targetPoints, round: 0, matchId: '', roundId: '', championId: null, winnerId: null, persistence: 'idle', members: members.map(m => ({ ...m, points: 0, ready: false, status: 'waiting', finishMs: null, passed: 0 })) }; awardedRound = -1; laps.clear();
    },
    persistence(status: TournamentSnapshot['persistence']) { state.persistence = status; },
    disqualify(id: string) { const m = state.members.find(m => m.id === id); if (m && m.status === 'racing') m.status = 'dnf'; },
    recover(id: string) {
      const m = state.members.find(m => m.id === id); if (!m || state.phase !== 'race' || m.status !== 'racing' || !m.connected) return null;
      const result = laps.get(id)?.recover(elapsed, m.slot % 2 ? 2 : -2) ?? null;
      if (result) { const s = laps.get(id)!.status(); m.recoveries = s.recoveries; m.needsRecovery = s.needsRecovery; }
      return result;
    },
    step(dt: number, positions: Map<string, RacePosition>) {
      if (state.phase === 'results') { phaseElapsed += dt; if (phaseElapsed >= config.resultsSeconds) this.garage(); return; }
      if (state.phase === 'countdown') {
        state.countdown = Math.max(0, state.countdown - dt);
        if (state.countdown < 0.00001) {
          state.phase = 'race'; elapsed = 0;
          for (const m of state.members) { const p = positions.get(m.id); if (p && m.status === 'racing') laps.set(m.id, createCircuitLap(p, economyRules.maxRaceHeight)); else m.status = 'dnf'; }
        }
        return;
      }
      if (state.phase !== 'race') return;
      elapsed += dt; state.remainingSeconds = Math.max(0, config.roundSeconds - elapsed);
      for (const m of state.members) {
        const lap = laps.get(m.id); const p = positions.get(m.id);
        if (m.status !== 'racing' || !lap || !p) continue;
        const fraction = lap.step(dt, p, m.connected); const s = lap.status();
        m.passed = s.passed; m.total = s.total; m.needsRecovery = s.needsRecovery; m.recoveries = s.recoveries;
        if (fraction !== null) { m.finishMs = Math.max(1, Math.round((elapsed - dt + dt * fraction) * 1000 + s.penaltyMs)); m.status = 'finished'; }
      }
      if (elapsed >= config.roundSeconds || state.members.every(m => m.status !== 'racing')) settle();
    },
  };
}
