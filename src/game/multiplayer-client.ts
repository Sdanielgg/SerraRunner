import { Client, type Room } from 'colyseus.js';
import { emptyControls, type Controls, type Gearing } from './physics';
import { MAX_PLAYERS, NETWORK_VERSION, ROOM_NAME, serverAddress, type InputCommand, type RoomInfo, type RoomSnapshot, type TestLocation } from './network-types';
import type { VehicleId } from './vehicles';
import type { HornTone } from './horn-audio';
import type { CompetitionStatus } from './competition';
import { authRules } from '../auth/config';
import { networkTiming } from './network-config';
import { reconnectionRules } from './reconnection-config';
import type { TournamentAction, TournamentSnapshot } from './tournament';
import type { EconomySnapshot } from './economy-config';
import type { GarageSnapshot, UpgradeKind } from './upgrades';

export type ReconnectionStatus = { state: 'lost' | 'retrying' | 'background' | 'restored' | 'expired'; deadline: number; remainingSeconds: number; attempt: number };
export type OnlineStatus = {
  phase: 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error';
  message: string; room: RoomInfo | null; ping: number | null;
  competition?: CompetitionStatus & { available: boolean }; tournament?: TournamentSnapshot;
  economy?: EconomySnapshot; garage?: GarageSnapshot; reconnection?: ReconnectionStatus;
};
export const offlineStatus = (): OnlineStatus => ({ phase: 'offline', message: '', room: null, ping: null, competition: undefined, tournament: undefined, economy: undefined, garage: undefined, reconnection: undefined });
type ConnectOptions = { address: string; vehicleId: VehicleId; code?: string; getAccessToken: () => Promise<string> };
type Ticket = { token: string; sessionId: string; deadline: number; attempt: number };

export function createMultiplayerClient(onStatus: (status: OnlineStatus) => void, onSnapshot: (snapshot: RoomSnapshot, sessionId: string) => void, options: { prediction?: boolean } = {}) {
  let status = offlineStatus(); let room: Room | null = null; let client: Client | null = null; let generation = 0;
  let seq = 0; let epoch = -1; let controls = emptyControls(); let gearing: Gearing = 'high';
  let horn = false; let hornTone: HornTone = 'auto'; let active = true;
  let inputTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryTimer: ReturnType<typeof setInterval> | null = null;
  let authTimer: ReturnType<typeof setInterval> | null = null;
  let getAccessToken: (() => Promise<string>) | null = null;
  let latestSnapshot = 0; let commands: InputCommand[] = [];
  let windowSeconds: number = reconnectionRules.windowSeconds; let ticket: Ticket | null = null;
  let reconnectBusy = false; let restoredUntil = 0;
  function publish(change: Partial<OnlineStatus>) { status = { ...status, ...change }; onStatus(status); }
  function neutralize() { commands = []; controls = emptyControls(); horn = false; }
  function clearTimers() {
    if (inputTimer) clearInterval(inputTimer); if (pingTimer) clearInterval(pingTimer);
    if (authTimer) clearInterval(authTimer); if (recoveryTimer) clearInterval(recoveryTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    inputTimer = pingTimer = authTimer = recoveryTimer = null; reconnectTimer = null;
  }
  function sendInput() {
    if (active && status.phase === 'online' && epoch >= 0 && room?.connection.isOpen) room.send('input', options.prediction
      ? { epoch, commands: commands.splice(0, networkTiming.maxBatchInputs), horn, hornTone }
      : { epoch, seq: ++seq, controls, gearing, horn, hornTone });
  }
  async function refreshAuth() {
    const current = room; const token = generation;
    if (!current || status.phase !== 'online' || !active) return;
    try {
      const accessToken = await getAccessToken?.();
      if (accessToken && room === current && token === generation) current.send('auth', accessToken);
    } catch (error) { if (room === current && token === generation) publish({ message: error instanceof Error ? error.message : 'Não foi possível renovar a sessão.' }); }
  }
  async function timedJoin(promise: Promise<Room>, token: number, timeoutMs: number = reconnectionRules.joinTimeoutMs) {
    let timeout: ReturnType<typeof setTimeout>; let expired = false;
    promise.then(joined => { if (expired || token !== generation) void joined.leave().catch(() => {}); }, () => {});
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => { expired = true; reject(new Error('O servidor demorou a responder.')); }, Math.max(1, timeoutMs)); })]); }
    finally { clearTimeout(timeout!); }
  }
  function recoveryState(state: ReconnectionStatus['state']): ReconnectionStatus {
    return { state, deadline: ticket?.deadline ?? 0, remainingSeconds: Math.max(0, Math.ceil(((ticket?.deadline ?? 0) - Date.now()) / 1000)), attempt: ticket?.attempt ?? 0 };
  }
  function expire() {
    const reconnection = recoveryState('expired'); generation++; ticket = null; reconnectBusy = false;
    clearTimers(); neutralize(); epoch = -1;
    const old = room; room = null; if (old) void old.leave().catch(() => {});
    publish({ ...offlineStatus(), phase: 'error', reconnection, message: 'Prazo de reconexão expirado. Não foi possível retomar a sessão. O código da sala não recupera o lugar anterior.' });
  }
  function scheduleReconnect(delay: number) {
    if (!ticket || !active || reconnectBusy || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; void reconnect(); }, delay);
  }
  async function reconnect() {
    const saved = ticket; const token = generation;
    if (!saved || !client || !active || reconnectBusy) return;
    if (Date.now() >= saved.deadline) { expire(); return; }
    reconnectBusy = true; saved.attempt++;
    publish({ phase: 'reconnecting', message: 'Reconexão em curso. A validar a mesma conta…', reconnection: recoveryState('retrying') });
    try {
      const accessToken = await getAccessToken?.();
      if (token !== generation || ticket !== saved || !active) return;
      if (Date.now() >= saved.deadline) { expire(); return; }
      if (!accessToken) throw new Error('Inicia sessão novamente.');
      // Public SDK 0.16 field: forwarded as Authorization on HTTP and as
      // _authToken on WebSocket. Server checks it before consuming the seat.
      client.http.authToken = accessToken;
      const joined = await timedJoin(client.reconnect(saved.token), token, saved.deadline - Date.now());
      if (token !== generation || ticket !== saved) { void joined.leave().catch(() => {}); return; }
      if (joined.sessionId !== saved.sessionId) { void joined.leave().catch(() => {}); expire(); return; }
      // Transport authenticated before the deadline; still wait for the full
      // snapshot before enabling commands or declaring the session restored.
      ticket = null;
      attach(joined, token, true);
      if (!active) drop(joined, true);
    } catch {
      if (token !== generation || ticket !== saved) return;
      if (Date.now() >= saved.deadline) { expire(); return; }
    } finally {
      if (token === generation) { reconnectBusy = false; if (ticket && !room) scheduleReconnect(Math.min(reconnectionRules.maxRetryMs, reconnectionRules.firstRetryMs * reconnectionRules.retryFactor ** Math.min(saved.attempt, 12))); }
    }
  }
  function drop(joined: Room, background = false) {
    if (room !== joined) return;
    const previous = ticket;
    room = null; clearTimers(); neutralize(); epoch = -1;
    ticket = { token: joined.reconnectionToken, sessionId: joined.sessionId, deadline: previous?.deadline ?? Date.now() + windowSeconds * 1000, attempt: previous?.attempt ?? 0 };
    publish({ phase: 'reconnecting', message: background ? 'Ligação suspensa em segundo plano. Lugar reservado durante o prazo de reconexão.' : 'Ligação perdida. O lugar está reservado; a tentar restabelecer…', ping: null, reconnection: recoveryState(background ? 'background' : 'lost') });
    recoveryTimer = setInterval(() => {
      if (!ticket) return;
      if (Date.now() >= ticket.deadline) { expire(); return; }
      publish({ reconnection: recoveryState(active ? reconnectBusy ? 'retrying' : 'lost' : 'background') });
      if (!room) scheduleReconnect(0);
    }, reconnectionRules.heartbeatMs);
    if (background) void joined.leave(false).catch(() => {});
    scheduleReconnect(reconnectionRules.firstRetryMs);
  }
  function attach(joined: Room, token: number, resuming = false) {
    if (token !== generation) { void joined.leave().catch(() => {}); return; }
    clearTimers(); room = joined; neutralize(); epoch = -1; latestSnapshot = Date.now();
    publish({ phase: resuming ? 'reconnecting' : 'connecting', message: resuming ? 'A receber o estado completo da sala…' : 'A receber o estado da sala…', room: { code: joined.roomId, sessionId: joined.sessionId, players: resuming ? status.room?.players ?? [] : [] }, ...(resuming ? {} : { competition: undefined, tournament: undefined, economy: undefined, garage: undefined, reconnection: undefined }) });
    joined.onMessage<RoomSnapshot>('snapshot', snapshot => {
      if (room !== joined || token !== generation || snapshot.version !== NETWORK_VERSION || !Array.isArray(snapshot.players) || snapshot.players.length > MAX_PLAYERS || !snapshot.connection) return;
      const self = snapshot.players.find(p => p.id === joined.sessionId); if (!self || self.connected === false) return;
      const first = epoch < 0; const connection = snapshot.connection;
      if (!Number.isSafeInteger(connection.epoch) || connection.epoch < 0 || !Number.isFinite(connection.windowSeconds) || connection.windowSeconds <= 0 || connection.windowSeconds > 300) return;
      latestSnapshot = Date.now(); windowSeconds = connection.windowSeconds;
      if (first || epoch !== connection.epoch) { neutralize(); epoch = connection.epoch; seq = Math.max(0, self.acknowledgedSeq ?? 0); }
      const returned = first && resuming;
      if (returned) { ticket = null; restoredUntil = Date.now() + reconnectionRules.restoredMessageMs; }
      onSnapshot(snapshot, joined.sessionId);
      const players = snapshot.players.map(({ id, name, vehicleId, userId, color }) => ({ id, name, vehicleId, userId, color }));
      const transitioned = snapshot.tournament?.phase !== status.tournament?.phase;
      if (first || JSON.stringify(players) !== JSON.stringify(status.room?.players) || snapshot.tick % 15 === 0 || transitioned) publish({
        phase: 'online', room: { code: joined.roomId, sessionId: joined.sessionId, players }, tournament: snapshot.tournament, economy: snapshot.economy, garage: snapshot.garage,
        ...(returned ? { message: 'Ligação restabelecida. Estado recuperado; comandos reiniciados.', reconnection: { state: 'restored', deadline: 0, remainingSeconds: 0, attempt: 0 } as ReconnectionStatus }
          : first || transitioned || status.reconnection?.state === 'restored' && Date.now() >= restoredUntil ? { message: '', reconnection: undefined } : {}),
      });
    });
    joined.onMessage<number>('pong', sent => { if (room === joined && status.phase === 'online') publish({ ping: Math.max(0, Date.now() - sent) }); });
    joined.onMessage<NonNullable<OnlineStatus['competition']>>('competition', competition => { if (room === joined) publish({ competition }); });
    joined.onError((_code, message) => { if (room === joined) publish({ message: message || 'Erro de ligação.' }); });
    joined.onLeave(code => {
      if (room !== joined || token !== generation) return;
      if (code === 4003 || code === 4000) {
        room = null; clearTimers(); neutralize(); ticket = null;
        publish({ ...offlineStatus(), phase: 'error', message: code === 4003 ? 'Sessão inválida ou expirada. Inicia sessão novamente.' : 'A sala terminou a ligação. Não é possível retomar esta sessão.' }); return;
      }
      drop(joined);
    });
    inputTimer = setInterval(sendInput, 1000 / networkTiming.inputSendHz);
    authTimer = setInterval(() => { void refreshAuth(); }, authRules.roomRefreshIntervalMs);
    pingTimer = setInterval(() => {
      if (room !== joined) return;
      if (ticket && Date.now() >= ticket.deadline) { expire(); return; }
      if (Date.now() - latestSnapshot > reconnectionRules.snapshotTimeoutMs) { drop(joined); void joined.leave(false).catch(() => {}); }
      else if (status.phase === 'online') joined.send('ping', Date.now());
    }, reconnectionRules.heartbeatMs);
  }
  return {
    adopt(joined: Room, owner: Client, accessToken: () => Promise<string>) {
      client = owner;
      getAccessToken = accessToken;
      attach(joined, ++generation);
      if (!active) drop(joined, true);
    },
    async connect(connectOptions: ConnectOptions) {
      const token = ++generation;
      clearTimers(); neutralize(); ticket = null; reconnectBusy = false; epoch = -1;
      const old = room; room = null; if (old) void old.leave().catch(() => {});
      publish({ ...offlineStatus(), phase: 'connecting', message: 'A ligar ao servidor…' });
      try {
        getAccessToken = connectOptions.getAccessToken;
        const accessToken = await getAccessToken(); if (token !== generation) return;
        client = new Client(serverAddress(connectOptions.address));
        const joinOptions = { accessToken, vehicleId: connectOptions.vehicleId, version: NETWORK_VERSION };
        const promise = connectOptions.code ? client.joinById(connectOptions.code.trim().toUpperCase(), joinOptions) : client.create(ROOM_NAME, joinOptions);
        const joined = await timedJoin(promise, token); attach(joined, token);
        if (!active) drop(joined, true);
      } catch (cause) {
        if (token !== generation) return;
        const code = (cause as { code?: number })?.code; const detail = cause instanceof Error ? cause.message : '';
        publish({ ...offlineStatus(), phase: 'error', message: code === 4212 || code === 4214 || /not found|locked|not defined|full/i.test(detail)
          ? 'Sala inexistente, cheia ou já iniciada. Uma nova entrada não retoma uma sessão anterior.' : detail || 'Não foi possível ligar. Confirma a ligação à Internet.' });
      }
    },
    setActive(value: boolean) {
      active = value; neutralize();
      if (!active && room) { if (epoch >= 0 && room.connection.isOpen) room.send('input', { epoch, release: true }); drop(room, true); }
      else if (active && ticket) { if (Date.now() >= ticket.deadline) expire(); else scheduleReconnect(0); }
      else if (active && room) void refreshAuth();
    },
    setInput(next: Controls, range: Gearing) { if (status.phase === 'online' && active) { controls = { ...next }; gearing = range; } },
    enqueueInputs(next: InputCommand[]) { if (status.phase !== 'online' || !active) return; commands.push(...next); if (commands.length > networkTiming.maxQueuedInputs) commands.splice(0, commands.length - networkTiming.maxQueuedInputs); },
    tournament(action: TournamentAction) { if (status.phase === 'online') room?.send('tournament', action); },
    purchase(action: { operationId: string; kind: UpgradeKind } | { type: 'reload' }) { if (status.phase === 'online') room?.send('purchase', action); },
    refreshAuth,
    competition(action: 'start' | 'retry') { neutralize(); if (status.phase === 'online') room?.send('competition', action); },
    setHorn(value: boolean, tone: HornTone) { if (status.phase !== 'online' || !active || horn === value && hornTone === tone) return; horn = value; hornTone = tone; sendInput(); },
    release() { neutralize(); if (status.phase === 'online' && epoch >= 0) room?.send('input', { epoch, release: true }); },
    selectVehicle(vehicleId: VehicleId, location: TestLocation) { neutralize(); gearing = location === 'trail' ? 'low' : 'high'; if (status.phase === 'online') room?.send('vehicle', { vehicleId, location }); },
    reset(location: TestLocation) { neutralize(); gearing = location === 'trail' ? 'low' : 'high'; if (status.phase === 'online') room?.send('reset', location); },
    leave() { generation++; clearTimers(); neutralize(); ticket = null; reconnectBusy = false; epoch = -1; const old = room; room = null; if (old) void old.leave().catch(() => {}); if (client) client.http.authToken = ''; publish(offlineStatus()); },
    dispose() { generation++; clearTimers(); neutralize(); ticket = null; const old = room; room = null; if (old) void old.leave().catch(() => {}); if (client) client.http.authToken = ''; },
  };
}
