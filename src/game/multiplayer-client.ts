import { Client, type Room } from 'colyseus.js';
import { emptyControls, type Controls, type Gearing } from './physics';
import { MAX_PLAYERS, NETWORK_VERSION, ROOM_NAME, serverAddress, type RoomInfo, type RoomSnapshot, type TestLocation } from './network-types';
import type { VehicleId } from './vehicles';
import type { HornTone } from './horn-audio';

export type OnlineStatus = {
  phase: 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error';
  message: string; room: RoomInfo | null; ping: number | null;
};
export const offlineStatus = (): OnlineStatus => ({ phase: 'offline', message: '', room: null, ping: null });
type ConnectOptions = { address: string; name: string; vehicleId: VehicleId; code?: string };

export function createMultiplayerClient(onStatus: (status: OnlineStatus) => void, onSnapshot: (snapshot: RoomSnapshot, sessionId: string) => void) {
  let status = offlineStatus();
  let room: Room | null = null;
  let client: Client | null = null;
  let generation = 0;
  let seq = 0;
  let controls = emptyControls(); let gearing: Gearing = 'high';
  let horn = false; let hornTone: HornTone = 'auto';
  let inputTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let latestSnapshot = Date.now();
  function publish(change: Partial<OnlineStatus>) { status = { ...status, ...change }; onStatus(status); }
  function clearTimers() {
    if (inputTimer) clearInterval(inputTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    inputTimer = pingTimer = null; reconnectTimer = null;
  }
  function sendInput() {
    if (room?.connection.isOpen) room.send('input', { seq: ++seq, controls, gearing, horn, hornTone });
  }
  async function timedJoin(promise: Promise<Room>, token: number) {
    let timeout: ReturnType<typeof setTimeout>;
    let expired = false;
    promise.then(joined => { if (expired || token !== generation) void joined.leave().catch(() => {}); }, () => {});
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { expired = true; reject(new Error('O servidor demorou a responder. Tenta novamente.')); }, 15000);
      })]);
    } finally { clearTimeout(timeout!); }
  }
  function attach(joined: Room, token: number) {
    if (token !== generation) { void joined.leave().catch(() => {}); return; }
    room = joined; seq = 0; controls = emptyControls(); horn = false; latestSnapshot = Date.now();
    publish({ phase: 'online', message: '', room: { code: joined.roomId, sessionId: joined.sessionId, players: [] } });
    joined.onMessage<RoomSnapshot>('snapshot', snapshot => {
      if (room !== joined || token !== generation || snapshot.version !== NETWORK_VERSION || !Array.isArray(snapshot.players) || snapshot.players.length > MAX_PLAYERS) return;
      latestSnapshot = Date.now();
      onSnapshot(snapshot, joined.sessionId);
      const players = snapshot.players.map(({ id, name, vehicleId }) => ({ id, name, vehicleId }));
      if (JSON.stringify(players) !== JSON.stringify(status.room?.players)) publish({ room: { code: joined.roomId, sessionId: joined.sessionId, players } });
    });
    joined.onMessage<number>('pong', sent => { if (room === joined) publish({ ping: Math.max(0, Date.now() - sent) }); });
    joined.onError((_code, message) => { if (room === joined) publish({ message: message || 'Erro de ligação.' }); });
    joined.onLeave(() => {
      if (room !== joined || token !== generation) return;
      const reconnectToken = joined.reconnectionToken;
      room = null; clearTimers(); controls = emptyControls(); horn = false;
      publish({ phase: 'reconnecting', message: 'Ligação interrompida. A tentar voltar à sala…', ping: null });
      let attempt = 0;
      const reconnect = async () => {
        if (token !== generation || !client) return;
        try { attach(await timedJoin(client.reconnect(reconnectToken), token), token); }
        catch {
          if (token !== generation) return;
          if (++attempt < 3) reconnectTimer = setTimeout(() => { void reconnect(); }, 500 * 2 ** attempt);
          else publish({ phase: 'error', message: 'A ligação terminou. Podes voltar a entrar com o código da sala.', room: null });
        }
      };
      reconnectTimer = setTimeout(() => { void reconnect(); }, 500);
    });
    inputTimer = setInterval(sendInput, 1000 / 30);
    pingTimer = setInterval(() => {
      if (room !== joined) return;
      if (Date.now() - latestSnapshot > 8000) joined.connection.close();
      else joined.send('ping', Date.now());
    }, 2000);
  }
  return {
    async connect(options: ConnectOptions) {
      const token = ++generation;
      clearTimers(); const old = room; room = null;
      if (old) void old.leave().catch(() => {});
      publish({ phase: 'connecting', message: 'A ligar ao servidor…', room: null, ping: null });
      try {
        client = new Client(serverAddress(options.address));
        const joinOptions = { name: options.name.trim().slice(0, 20), vehicleId: options.vehicleId, version: NETWORK_VERSION };
        const promise = options.code ? client.joinById(options.code.trim().toUpperCase(), joinOptions) : client.create(ROOM_NAME, joinOptions);
        attach(await timedJoin(promise, token), token);
      } catch (cause) {
        if (token !== generation) return;
        const code = (cause as { code?: number })?.code;
        const detail = cause instanceof Error ? cause.message : '';
        publish({ phase: 'error', message: code === 4212 || code === 4214 || /not found|locked|not defined|full/i.test(detail)
          ? 'Sala inexistente ou cheia. Confirma o código e tenta novamente.'
          : detail || 'Não foi possível ligar. Confirma o endereço e a ligação à Internet.', room: null });
      }
    },
    setInput(next: Controls, range: Gearing) { controls = { ...next }; gearing = range; },
    setHorn(active: boolean, tone: HornTone) {
      if (horn === active && hornTone === tone) return;
      horn = active; hornTone = tone; sendInput();
    },
    release() { controls = emptyControls(); horn = false; sendInput(); },
    selectVehicle(vehicleId: VehicleId, location: TestLocation) {
      controls = emptyControls(); horn = false; gearing = location === 'trail' ? 'low' : 'high';
      room?.send('vehicle', { vehicleId, location });
    },
    reset(location: TestLocation) { controls = emptyControls(); horn = false; gearing = location === 'trail' ? 'low' : 'high'; room?.send('reset', location); },
    leave() {
      generation++; clearTimers(); controls = emptyControls(); horn = false;
      const old = room; room = null;
      if (old) void old.leave().catch(() => {});
      publish(offlineStatus());
    },
    dispose() {
      generation++; clearTimers(); horn = false;
      const old = room; room = null;
      if (old) void old.leave().catch(() => {});
    },
  };
}
