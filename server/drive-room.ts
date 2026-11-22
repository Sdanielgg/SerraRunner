import { randomBytes, randomUUID } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { createPhysics, createPhysicsWorld, emptyControls, controlKeys, type Controls, type Gearing } from '../src/game/physics';
import { isTestLocation, isVehicleId, MAX_PLAYERS, NETWORK_VERSION, type InputCommand, type PlayerSnapshot, type RoomSnapshot, type TestLocation } from '../src/game/network-types';
import type { VehicleId } from '../src/game/vehicles';
import { isHornTone, type HornTone } from '../src/game/horn-audio';
import { createCompetitionRun, competitionRules } from '../src/game/competition';
import type { GameServices, VerifiedIdentity, VerifiedResult, CompetitionSync, GarageData } from './supabase';
import { authRules } from '../src/auth/config';
import { createTournament, tournamentRules, type TournamentConfig, type TournamentRoundRecord } from '../src/game/tournament';
import { networkTiming } from '../src/game/network-config';
import { createRaceEconomy } from '../src/game/race-economy';
import { createEconomyWallet } from './economy-wallet';
import { disableEconomyCourse } from '../src/game/economy-course';
import { economyRules } from '../src/game/economy-config';
import { createGarage } from './garage';
import { baseUpgrades, isUpgradeKind, type UpgradeLevels } from '../src/game/upgrades';
import { reconnectionRules, type ReconnectionConfig } from '../src/game/reconnection-config';

type Player = {
  connection: Client | null; resumeUntil: number; resumeToken: string | null; resumeIdentity: VerifiedIdentity | null;
  epoch: number; resumed: boolean; kicked: boolean; authVersion: number;
  garage: ReturnType<typeof createGarage> | null;
  economy: ReturnType<typeof createRaceEconomy> | null;
  id: string; receivedSeq: number; inputs: InputCommand[];
  identity: VerifiedIdentity; suspended: boolean; authBusy: boolean; lastAuth: number;
  competition: ReturnType<typeof createCompetitionRun>; result: VerifiedResult | null; saving: boolean;
  name: string; slot: number; vehicleId: VehicleId; car: ReturnType<typeof createPhysics>;
  controls: Controls; gearing: Gearing; location: TestLocation; revision: number; seq: number;
  horn: boolean; hornTone: HornTone;
  lastInput: number; lastAction: number; bucketStart: number; messages: number;
};
const activeCodes = new Set<string>();
const dt = 1 / networkTiming.simulationHz;

export abstract class DriveRoom extends Room {
  protected abstract services: GameServices;
  protected tournamentConfig: TournamentConfig = tournamentRules;
  protected reconnectOptions: ReconnectionConfig = reconnectionRules;
  maxClients = MAX_PLAYERS;
  private world = createPhysicsWorld();
  private players = new Map<string, Player>();
  private tick = 0;
  private accumulator = 0;
  private tournament!: ReturnType<typeof createTournament>;
  private pendingRound: TournamentRoundRecord | null = null;
  private savingRound = false;
  private wallets = new Map<string, ReturnType<typeof createEconomyWallet>>();
  private phaseSync: CompetitionSync | null = null;
  private phaseBusy = false;
  private phaseError = false;
  private roundUpgrades = new Map<string, UpgradeLevels>();
  private roundEntrants = new Set<string>();

  async onCreate() {
    this.tournament = createTournament(this.tournamentConfig);
    if (activeCodes.size >= 32) throw new ServerError(503, 'Servidor cheio. Tenta novamente mais tarde.');
    do { this.roomId = randomBytes(4).toString('hex').toUpperCase(); } while (activeCodes.has(this.roomId));
    activeCodes.add(this.roomId);
    await this.setPrivate(true);
    this.setPatchRate(null);
    this.onMessage('purchase', async (client, payload: unknown) => {
      const p = this.players.get(client.sessionId); const state = this.tournament.snapshot();
      if (!p || p.connection !== client || p.suspended || p.identity.expiresAt <= Date.now() || !this.admit(p) || state.phase !== 'garage' || state.persistence !== 'saved' || this.phaseSync || !p.garage || state.championId || !state.members.some(m => m.id === p.id && m.connected && !m.ready) || !payload || typeof payload !== 'object') return;
      const request = payload as Record<string, unknown>;
      try {
        if (request.type === 'reload') await p.garage.load();
        else if (typeof request.operationId === 'string' && isUpgradeKind(request.kind)) await p.garage.buy(request.operationId, request.kind);
      } catch (error) { client.error(400, error instanceof Error ? error.message : 'Compra recusada.'); }
    });
    this.onMessage('auth', async (client, token: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.connection !== client || player.suspended || player.authBusy || Date.now() - player.lastAuth < authRules.roomRefreshMinIntervalMs) return;
      const attempt = ++player.authVersion;
      player.authBusy = true; player.lastAuth = Date.now();
      try {
        const identity = await this.services.verify(token);
        if (identity.userId !== player.identity.userId) throw new ServerError(401, 'A conta mudou. Volta a entrar na sala.');
        if (this.players.get(client.sessionId) !== player || player.connection !== client || player.authVersion !== attempt) return;
        player.identity = identity; player.name = identity.name; player.suspended = false;
        this.tournament.update(client.sessionId, { connected: true, name: identity.name, color: identity.color });
        void this.wallets.get(identity.userId)?.load();
      } catch (error) {
        if (player.connection !== client || player.authVersion !== attempt) return;
        if ((error as { code?: number }).code === 401) {
          player.kicked = true; player.identity.expiresAt = 0; player.suspended = true; this.flushInput(player);
          this.tournament.update(player.id, { connected: false });
          client.error(401, 'Sessão inválida ou expirada. Inicia sessão novamente.'); client.leave(4003);
        }
        else client.error(503, 'Falha de rede ao validar a sessão. A tentar novamente.');
      } finally { if (player.authVersion === attempt) player.authBusy = false; }
    });
    this.onMessage('tournament', (client, payload: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.connection !== client || player.suspended || player.identity.expiresAt <= Date.now() || !this.admit(player) || !payload || typeof payload !== 'object') return;
      const action = payload as Record<string, unknown>;
      const previous = this.tournament.snapshot().phase;
      try {
        if (action.type === 'retry' && client.sessionId === this.tournament.snapshot().hostId) { void this.saveRound(); void this.syncPhase(); return; }
        if (this.phaseSync) throw new Error('Confirma primeiro a fase da competição no servidor.');
        if (['end','new'].includes(String(action.type)) && [...this.players.values()].some(p => p.garage?.hasPending())) throw new Error('Confirma primeiro as compras pendentes.');
        if (action.type === 'ready' && player.garage?.blocked()) throw new Error('Carrega a garagem e confirma a compra pendente antes de ficar pronto.');
        if (action.type === 'ready' && typeof action.ready === 'boolean') this.tournament.ready(client.sessionId, action.ready);
        else if (action.type === 'target' && typeof action.points === 'number') this.tournament.target(client.sessionId, action.points);
        else if (action.type === 'start' && typeof action.round === 'number') {
          if (!this.services.canPersist) throw new Error('Configura a persistência do servidor antes de iniciar.');
          if ([...this.wallets.values()].some(w => w.hasPending())) throw new Error('Aguarda a confirmação das moedas da ronda anterior.');
          if (previous === 'garage' && [...this.players.values()].some(p => !p.garage || p.garage.blocked())) throw new Error('Há uma garagem ou compra por confirmar.');
          if ([...this.players.values()].filter(p => !p.suspended && p.identity.expiresAt > Date.now()).length < tournamentRules.minPlayers) throw new Error('São necessárias duas sessões autenticadas válidas.');
          if ([...this.players.values()].some(p => ['countdown', 'ready', 'running', 'saving', 'save-error'].includes(p.competition.status().phase))) throw new Error('Termina e guarda as voltas individuais antes de iniciar a competição.');
          this.tournament.start(client.sessionId, action.round, randomUUID(), randomUUID());
        } else if (action.type === 'garage') this.tournament.garage(client.sessionId);
        else if (action.type === 'end') this.tournament.end(client.sessionId);
        else if (action.type === 'new') this.tournament.reset(client.sessionId);
        else throw new Error('Comando de competição inválido.');
        this.tournamentTransition(previous);
      } catch (error) { client.error(400, error instanceof Error ? error.message : 'Comando rejeitado.'); }
    });
    this.onMessage('competition', (client, action: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.connection !== client || !this.actionAllowed(player) || player.suspended || player.identity.expiresAt <= Date.now()) return;
      if (this.tournament.snapshot().started) { client.error(400, 'A sala está numa competição por rondas.'); return; }
      if (!this.services.canPersist) { client.error(503, 'Competições indisponíveis: falta configurar a persistência no servidor.'); return; }
      if (action === 'retry' && player.result && player.competition.status().phase === 'save-error') { void this.saveCompetition(player); return; }
      if (player.competition.status().phase === 'save-error') { client.error(503, 'Guarda o resultado pendente antes de iniciar outra tentativa.'); return; }
      if (action !== 'start' || player.saving) return;
      this.respawn(player, 'race');
      player.competition = createCompetitionRun(); player.competition.start(player.car.chassis.position);
      player.result = { id: randomUUID(), user_id: player.identity.userId, course_id: competitionRules.courseId, vehicle_id: player.vehicleId, elapsed_ms: 0, room_code: this.roomId };
    });
    this.onMessage('input', (client, payload: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.connection !== client || player.suspended || player.identity.expiresAt <= Date.now() || !this.admit(player) || !payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if ((value.epoch ?? 0) !== player.epoch) return;
      if (value.release === true) { this.flushInput(player); player.lastInput = Date.now(); return; }
      const commands = Array.isArray(value.commands) ? value.commands : [value];
      if (commands.length > networkTiming.maxBatchInputs) return;
      for (const command of commands) {
        if (!command || typeof command !== 'object') continue;
        const c = command as Record<string, unknown>;
        if (!Number.isSafeInteger(c.seq) || (c.seq as number) <= player.receivedSeq || !c.controls || typeof c.controls !== 'object' || (c.gearing !== 'low' && c.gearing !== 'high')) continue;
        const raw = c.controls as Record<string, unknown>; const controls = emptyControls();
        for (const key of controlKeys) if (key in controls || raw[key] === true) controls[key] = raw[key] === true;
        player.receivedSeq = c.seq as number;
        player.inputs.push({ seq: c.seq as number, controls, gearing: c.gearing });
        if (player.inputs.length > networkTiming.maxQueuedInputs) player.inputs.shift();
      }
      player.horn = value.horn === true;
      player.hornTone = isHornTone(value.hornTone) ? value.hornTone : 'auto';
      player.lastInput = Date.now();
    });
    this.onMessage('vehicle', (client, payload: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.connection !== client || !this.actionAllowed(player) || !payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if (!isVehicleId(value.vehicleId) || !isTestLocation(value.location)) return;
      if (this.phaseSync || player.garage?.blocked()) { client.error(400, 'Confirma primeiro a garagem ou compra pendente.'); return; }
      try { this.tournament.update(client.sessionId, { vehicleId: value.vehicleId }); }
      catch { client.error(400, 'Escolhe o veículo no lobby ou na garagem.'); return; }
      player.car.dispose(); player.vehicleId = value.vehicleId; player.car = createPhysics(value.vehicleId, this.world);
      this.respawn(player, value.location);
      if (this.tournament.snapshot().phase === 'garage') this.loadGarage(player);
    });
    this.onMessage('reset', (client, location: unknown) => {
      const player = this.players.get(client.sessionId);
      if (player && player.connection === client && this.actionAllowed(player) && isTestLocation(location)) {
        const phase = this.tournament.snapshot().phase;
        if (phase === 'race') { if (!this.recoverRace(player)) client.error(400, 'Recuperação indisponível: aguarda ou já terminaste a ronda.'); }
        else if (['lobby', 'garage'].includes(phase)) this.respawn(player, location);
        else client.error(400, 'Não podes repor o carro nesta fase.');
      }
    });
    this.onMessage('ping', (client, sent: unknown) => {
      const player = this.players.get(client.sessionId);
      if (player && player.connection === client && !player.suspended && this.admit(player) && typeof sent === 'number' && Number.isFinite(sent)) client.send('pong', sent);
    });
    this.setSimulationInterval(delta => {
      this.accumulator = Math.min(0.1, this.accumulator + delta / 1000);
      while (this.accumulator >= dt) {
        this.accumulator -= dt;
        for (const player of this.players.values()) {
          const input = player.inputs.shift();
          if (input) { player.controls = input.controls; player.seq = input.seq; }
          if (Date.now() - player.lastInput > 500) this.flushInput(player);
          if (player.suspended || player.identity.expiresAt <= Date.now()) { player.controls = { ...emptyControls(), brake: true }; player.horn = false; }
          const countdown = player.competition.status().phase === 'countdown';
          player.car.applyControls(dt, countdown || !this.controlsEnabled(player) ? { ...emptyControls(), brake: true } : player.controls, player.gearing);
        }
        this.world.step(dt); this.tick++;
        for (const player of this.players.values()) {
          if (!player.suspended && Date.now() >= player.identity.expiresAt) {
            player.kicked = true; player.suspended = true; this.flushInput(player); this.tournament.update(player.id, { connected: false }); player.connection?.leave(4003);
            continue;
          }
          const position = player.car.chassis.position;
          if (!Number.isFinite(position.y) || position.y < -10 || Math.abs(position.x) > 240 || Math.abs(position.z) > 240) {
            if (this.tournament.snapshot().phase === 'race') {
              if (!this.recoverRace(player)) { this.tournament.disqualify(player.id); this.respawn(player, 'garage'); }
            } else this.respawn(player, 'garage');
          }
          if (player.competition.step(dt, position, !player.suspended) && player.result) {
            player.result.elapsed_ms = player.competition.status().elapsedMs;
            void this.saveCompetition(player);
          }
        }
        const previous = this.tournament.snapshot().phase;
        if (!this.phaseSync) this.tournament.step(dt, new Map([...this.players].map(([id, p]) => [id, p.car.chassis.position])));
        const state = this.tournament.snapshot();
        for (const player of this.players.values()) if (player.economy) {
          const member = state.members.find(m => m.id === player.id);
          const eligible = state.phase === 'race' && member?.status === 'racing' && !member.needsRecovery && !player.suspended && player.identity.expiresAt > Date.now();
          const fuel = player.car.getFuel();
          player.car.addFuel(player.economy.step(dt, player.car.getStuntSample(), eligible, fuel.fuel, fuel.capacity));
        }
        this.tournamentTransition(previous);
        if (this.tick % networkTiming.simulationHz === 0 && this.phaseSync?.phase === 'garage' && this.tournament.snapshot().persistence === 'saved') void this.syncPhase();
        if (this.tick % (networkTiming.simulationHz / networkTiming.snapshotHz) === 0) {
          this.broadcastSnapshots();
          if (this.tick % 15 === 0) for (const client of this.clients) {
            const player = this.players.get(client.sessionId);
            if (player?.connection === client && !player.suspended) client.send('competition', { ...player.competition.status(), available: this.services.canPersist });
          }
        }
      }
    }, 1000 / networkTiming.simulationHz);
  }

  async onAuth(_client: Client, options: Record<string, unknown>) {
    if (options?.version !== NETWORK_VERSION) throw new ServerError(400, 'Atualiza o jogo: a versão do servidor é diferente.');
    if (this.tournament.snapshot().started || this.tournament.snapshot().phase !== 'lobby') throw new ServerError(403, 'A competição já começou ou terminou. Só são permitidas reconexões válidas.');
    const identity = await this.services.verify(options.accessToken);
    if (this.tournament.snapshot().started || [...this.players.values()].some(p => p.identity.userId === identity.userId)) throw new ServerError(403, 'Entrada indisponível: competição iniciada ou conta já presente.');
    return identity;
  }

  onJoin(client: Client, options: Record<string, unknown>, identity: VerifiedIdentity) {
    if (this.tournament.snapshot().started || this.tournament.snapshot().phase !== 'lobby' || this.players.size >= MAX_PLAYERS) throw new ServerError(403, 'A sala já está completa ou em competição.');
    const used = new Set([...this.players.values()].map(player => player.slot));
    let slot = 0; while (used.has(slot)) slot++;
    const vehicleId = isVehicleId(options.vehicleId) ? options.vehicleId : 'jeep';
    this.tournament.add({ id: client.sessionId, userId: identity.userId, name: identity.name, color: identity.color, vehicleId, slot, connected: true });
    const player: Player = {
      connection: client, resumeUntil: 0, resumeToken: null, resumeIdentity: null, epoch: 0, resumed: false, kicked: false, authVersion: 0,
      garage: null,
      economy: null,
      id: client.sessionId, receivedSeq: -1, inputs: [],
      identity, suspended: false, authBusy: false, lastAuth: 0,
      competition: createCompetitionRun(), result: null, saving: false,
      name: identity.name, slot, vehicleId, car: createPhysics(vehicleId, this.world),
      controls: emptyControls(), gearing: 'high', location: 'garage', revision: 0, seq: -1,
      horn: false, hornTone: 'auto',
      lastInput: Date.now(), lastAction: 0, bucketStart: Date.now(), messages: 0,
    };
    this.players.set(client.sessionId, player); this.respawn(player, 'garage');
    if (!this.wallets.has(identity.userId)) this.wallets.set(identity.userId, createEconomyWallet(identity.userId, this.services));
    void this.wallets.get(identity.userId)!.load();
    client.send('snapshot', this.snapshot(client.sessionId));
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.players.get(client.sessionId);
    if (!player || player.connection !== client) return;
    player.connection = null; player.authVersion++; player.authBusy = false;
    player.controls = { ...emptyControls(), brake: true };
    player.horn = false;
    player.suspended = true; player.resumeUntil = Date.now() + this.reconnectOptions.windowSeconds * 1000;
    player.resumeToken = client.reconnectionToken; player.resumeIdentity = null;
    player.economy?.cancel();
    this.flushInput(player); this.tournament.update(client.sessionId, { connected: false });
    if (!consented && !player.kicked) {
      try {
        const returned = await this.allowReconnection(client, this.reconnectOptions.windowSeconds);
        const identity = player.resumeIdentity as VerifiedIdentity | null;
        if (!identity || identity.userId !== player.identity.userId || Date.now() > player.resumeUntil || identity.expiresAt <= Date.now()) { returned.leave(4003); throw new Error('Reconexão não autenticada.'); }
        player.identity = identity; player.name = identity.name; player.connection = returned; player.suspended = false;
        player.resumeUntil = 0; player.resumeToken = null; player.resumeIdentity = null;
        player.seq = player.receivedSeq = -1; this.flushInput(player); player.epoch++; player.revision++; player.resumed = true; player.lastInput = Date.now();
        this.tournament.update(client.sessionId, { connected: true, name: identity.name, color: identity.color });
        returned.send('snapshot', this.snapshot(client.sessionId));
        returned.send('competition', { ...player.competition.status(), available: this.services.canPersist });
        this.broadcastSnapshots(); return;
      } catch { /* Remove the vehicle after the reconnection window expires. */ }
    }
    player.car.dispose(); this.players.delete(client.sessionId);
    this.tournament.remove(client.sessionId);
    this.broadcastSnapshots();
  }

  // Called by the transport's public ws verifyClient hook, before Colyseus
  // consumes a reserved token. A wrong account cannot consume the owner's seat.
  approveReconnection(sessionId: string, token: string, identity: VerifiedIdentity) {
    const player = this.players.get(sessionId);
    if (!player || !player.suspended || player.connection || player.kicked || player.resumeToken !== token || Date.now() >= player.resumeUntil || identity.expiresAt <= Date.now() || identity.userId !== player.identity.userId) return false;
    player.resumeIdentity = identity; return true;
  }

  async onDispose() {
    for (const player of this.players.values()) player.car.dispose();
    disableEconomyCourse(this.world);
    this.players.clear(); activeCodes.delete(this.roomId);
    if (this.pendingRound) await this.saveRound();
  }

  private admit(player: Player) {
    const now = Date.now();
    if (now - player.bucketStart >= 1000) { player.bucketStart = now; player.messages = 0; }
    return ++player.messages <= 100;
  }

  private actionAllowed(player: Player) {
    if (player.suspended || player.identity.expiresAt <= Date.now() || !this.admit(player) || Date.now() - player.lastAction < 400) return false;
    player.lastAction = Date.now(); return true;
  }

  private respawn(player: Player, location: TestLocation) {
    if (['countdown', 'ready', 'running'].includes(player.competition.status().phase)) player.competition.cancel();
    const x = (player.slot - 1.5) * 4;
    if (location === 'race') player.car.startRace(player.slot);
    else player.car.reset({ x: location === 'trail' ? -35 + x : x, y: 1.5, z: 6, yaw: location === 'trail' ? 0 : -0.35 });
    player.location = location;
    player.gearing = location === 'trail' ? 'low' : 'high';
    this.flushInput(player); player.revision++;
  }

  private snapshot(sessionId?: string): RoomSnapshot {
    const players: PlayerSnapshot[] = [...this.players].map(([id, player]) => {
      const { chassis } = player.car;
      return {
        id, name: player.name, vehicleId: player.vehicleId, gearing: player.gearing, revision: player.revision,
        userId: player.identity.userId, color: player.identity.color, location: player.location,
        physics: player.car.getState(), acknowledgedSeq: player.seq, controlsEnabled: this.controlsEnabled(player),
        connected: !player.suspended, resumeUntil: player.suspended ? player.resumeUntil : undefined,
        horn: player.horn, hornTone: player.hornTone,
        body: { position: { ...chassis.position }, quaternion: { ...chassis.quaternion } },
        wheels: player.car.getWheelTransforms(false).map(wheel => ({ position: { ...wheel.position }, quaternion: { ...wheel.quaternion } })),
        ...player.car.getTelemetry(),
      };
    });
    const own = sessionId ? this.players.get(sessionId) : undefined;
    return { version: NETWORK_VERSION, tick: this.tick, players, tournament: { ...this.tournament.snapshot(), phasePending: !!this.phaseSync, phaseError: this.phaseError, rewardsPending: [...this.wallets.values()].some(w => w.hasPending()), rewardsError: false }, economy: sessionId ? this.economySnapshot(sessionId) : undefined, garage: own?.garage?.snapshot(), connection: own ? this.connectionSnapshot(own) : undefined };
  }
  private economySnapshot(sessionId: string) {
    const p = this.players.get(sessionId); if (!p?.economy) return undefined;
    const fuel = p.car.getFuel();
    return { ...p.economy.status(), ...fuel, ...this.wallets.get(p.identity.userId)!.snapshot() };
  }
  private broadcastSnapshots() {
    const base = this.snapshot();
    for (const client of this.clients) {
      const player = this.players.get(client.sessionId);
      if (player?.connection === client && !player.suspended) client.send('snapshot', { ...base, economy: this.economySnapshot(client.sessionId), garage: player.garage?.snapshot(), connection: this.connectionSnapshot(player) });
    }
  }
  private connectionSnapshot(player: Player) { return { epoch: player.epoch, resumed: player.resumed, windowSeconds: this.reconnectOptions.windowSeconds }; }

  private flushInput(player: Player) { player.inputs = []; player.seq = player.receivedSeq; player.controls = emptyControls(); player.horn = false; }
  private controlsEnabled(player: Player) {
    if (this.phaseSync) return false;
    if (player.suspended || player.identity.expiresAt <= Date.now()) return false;
    if (player.competition.status().phase === 'countdown') return false;
    const state = this.tournament.snapshot(); const member = state.members.find(m => m.id === player.id);
    if (state.phase === 'race') return member?.status === 'racing' && !member.needsRecovery;
    return (state.phase === 'lobby' || state.phase === 'garage') && !member?.ready;
  }
  private recoverRace(player: Player) {
    const spawn = this.tournament.recover(player.id); if (!spawn) return false;
    player.economy?.cancel(); player.car.reset(spawn); this.flushInput(player); player.revision++; return true;
  }
  private tournamentTransition(previous: ReturnType<ReturnType<typeof createTournament>['snapshot']>['phase']) {
    const state = this.tournament.snapshot(); if (previous === state.phase) return;
    if (state.phase === 'countdown') {
      void this.lock();
    }
    if (state.phase === 'finished') void this.lock();
    if (state.phase === 'garage') { for (const player of this.players.values()) { player.economy?.cancel(); player.car.endCompetitionEconomy(); this.respawn(player, 'garage'); } disableEconomyCourse(this.world); }
    if (state.phase === 'lobby') { this.pendingRound = null; for (const p of this.players.values()) { p.economy = null; p.garage = null; } void this.unlock(); }
    if (['countdown','garage','finished'].includes(state.phase) && state.matchId) {
      this.phaseSync = { match_id: state.matchId, round_id: state.roundId, round_number: state.round, room_code: this.roomId, host_user_id: state.members.find(m => m.id === state.hostId)?.userId ?? state.members[0].userId, target_points: state.targetPoints, phase: state.phase as CompetitionSync['phase'], members: state.members.map(m => ({ user_id: m.userId, vehicle_id: m.vehicleId, active: m.connected })) };
      this.phaseError = false; void this.syncPhase();
    }
    if (state.phase === 'results') {
      this.pendingRound = { id: state.roundId, match_id: state.matchId, round_number: state.round, target_points: state.targetPoints, room_code: this.roomId,
        course_id: economyRules.courseId,
        winner_user_id: state.members.find(m => m.id === state.winnerId)?.userId ?? null,
        entries: state.members.map(m => ({ user_id: m.userId, name: m.name, vehicle_id: m.vehicleId, elapsed_ms: m.finishMs, points: m.points, recoveries: m.recoveries, participated: this.roundEntrants.has(m.userId), upgrades: this.roundUpgrades.get(m.userId) ?? baseUpgrades(), rewards: this.wallets.get(m.userId)?.events(state.roundId) ?? [] })) };
      void this.saveRound();
    }
  }
  private loadGarage(player: Player) {
    const garage = createGarage(this.tournament.snapshot().matchId, player.identity.userId, player.vehicleId, this.services, amount => { if (player.garage === garage) this.wallets.get(player.identity.userId)?.setBalance(amount); });
    player.garage = garage; void garage.load();
  }
  private async syncPhase() {
    if (!this.phaseSync || this.phaseBusy) return;
    if (this.phaseSync.phase === 'garage' && this.tournament.snapshot().persistence !== 'saved') return;
    this.phaseBusy = true; const payload = this.phaseSync;
    try {
      const loadouts = await this.services.syncCompetition(payload);
      if (payload.phase === 'countdown') {
        if (payload.members.some(m => !loadouts[m.user_id])) throw new Error('Falta confirmar melhorias dos participantes.');
        this.roundUpgrades.clear();
        this.roundEntrants = new Set(payload.members.filter(m => m.active !== false).map(m => m.user_id));
        for (const member of payload.members) this.roundUpgrades.set(member.user_id, loadouts[member.user_id].levels);
        for (const player of this.players.values()) {
          const data: GarageData = loadouts[player.identity.userId];
          this.wallets.get(player.identity.userId)!.setBalance(data.balance);
          this.respawn(player, 'race'); player.car.beginCompetitionEconomy(data.levels); player.garage = null;
          const wallet = this.wallets.get(player.identity.userId)!;
          player.economy = createRaceEconomy((key, kind, amount) => wallet.enqueue(payload.round_id, key, kind, amount));
        }
      }
      this.phaseSync = null; this.phaseError = false;
      if (payload.phase === 'garage') for (const player of this.players.values()) this.loadGarage(player);
    } catch { this.phaseError = true; }
    finally { this.phaseBusy = false; }
  }
  private async saveRound() {
    if (!this.pendingRound || this.savingRound || this.tournament.snapshot().persistence === 'saved') return;
    this.savingRound = true; this.tournament.persistence('pending');
    try {
      const record = this.pendingRound; const balances = await this.services.saveRound(record);
      for (const entry of record.entries) this.wallets.get(entry.user_id)?.confirm(entry.rewards ?? [], balances[entry.user_id]);
      this.tournament.persistence('saved'); void this.syncPhase();
    }
    catch { this.tournament.persistence('error'); }
    finally { this.savingRound = false; }
  }

  private async saveCompetition(player: Player) {
    if (!player.result || player.saving) return;
    player.saving = true; player.competition.saving();
    try { await this.services.saveResult({ ...player.result }); player.competition.saved(); }
    catch { player.competition.failed(); }
    finally { player.saving = false; }
  }
}
