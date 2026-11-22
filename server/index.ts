import { createServer, type IncomingMessage } from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME, NETWORK_VERSION } from '../src/game/network-types';
import { DriveRoom } from './drive-room';
import { createSupabaseServices, type GameServices } from './supabase';
import { tournamentRules, type TournamentConfig } from '../src/game/tournament';
import { reconnectionConfig, reconnectionRules, type ReconnectionConfig } from '../src/game/reconnection-config';

export function createGameServer(services: GameServices = createSupabaseServices(), config: Partial<TournamentConfig> = {}, reconnect: Partial<ReconnectionConfig> = {}) {
  const reconnectOptions = reconnectionConfig(reconnect);
  const http = createServer((request, response) => {
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ game: 'Ramp Rivals', version: NETWORK_VERSION, status: 'ok' }));
    } else { response.writeHead(404); response.end(); }
  });
  const game = new Server({
    transport: new WebSocketTransport({ server: http, maxPayload: 16384, pingInterval: 5000, pingMaxRetries: 2,
      verifyClient: (info: { req: IncomingMessage }, done: (allowed: boolean, code?: number, message?: string) => void) => {
        const url = new URL(info.req.url ?? '/', 'http://localhost');
        const resumeToken = url.searchParams.get('reconnectionToken');
        if (!resumeToken) { done(true); return; }
        const roomId = url.pathname.split('/').filter(Boolean).pop() ?? '';
        const sessionId = url.searchParams.get('sessionId') ?? '';
        const target = matchMaker.getLocalRoomById(roomId) as DriveRoom | undefined;
        if (!target || !sessionId || resumeToken.length > 128) { done(false, 403, 'Reconexão indisponível.'); return; }
        const bearer = url.searchParams.get('_authToken') ?? info.req.headers.authorization?.replace(/^Bearer /i, '');
        void services.verify(bearer).then(identity => {
          if (!target?.approveReconnection(sessionId, resumeToken, identity)) { done(false, 403, 'Reconexão não autorizada.'); return; }
          done(true);
        }).catch(() => done(false, 401, 'Não foi possível validar a identidade da reconexão.'));
      },
    }),
    gracefullyShutdown: false, greet: false,
  });
  // Bind services in the class, never in client-overridable room options.
  class AuthenticatedDriveRoom extends DriveRoom { protected services = services; protected tournamentConfig = { ...tournamentRules, ...config }; protected reconnectOptions = reconnectOptions; }
  game.define(ROOM_NAME, AuthenticatedDriveRoom);
  return { game, http };
}

if (require.main === module) {
  const { game } = createGameServer(undefined, {}, { windowSeconds: Number(process.env.RECONNECT_WINDOW_SECONDS ?? reconnectionRules.windowSeconds) });
  const port = Number(process.env.PORT ?? 2567);
  game.listen(port, '0.0.0.0').then(() => console.log(`Ramp Rivals online: porta ${port}`)).catch(error => { console.error(error); process.exitCode = 1; });
  const shutdown = () => { void game.gracefullyShutdown(false).then(() => process.exit(0)); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
