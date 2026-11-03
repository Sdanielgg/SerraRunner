import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME, NETWORK_VERSION } from '../src/game/network-types';
import { DriveRoom } from './drive-room';

export function createGameServer() {
  const http = createServer((request, response) => {
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ game: 'Serra Runner', version: NETWORK_VERSION, status: 'ok' }));
    } else { response.writeHead(404); response.end(); }
  });
  const game = new Server({
    transport: new WebSocketTransport({ server: http, maxPayload: 4096, pingInterval: 5000, pingMaxRetries: 2 }),
    gracefullyShutdown: false, greet: false,
  });
  game.define(ROOM_NAME, DriveRoom);
  return { game, http };
}

if (require.main === module) {
  const { game } = createGameServer();
  const port = Number(process.env.PORT ?? 2567);
  game.listen(port, '0.0.0.0').then(() => console.log(`Serra Runner online: porta ${port}`)).catch(error => { console.error(error); process.exitCode = 1; });
  const shutdown = () => { void game.gracefullyShutdown(false).then(() => process.exit(0)); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
