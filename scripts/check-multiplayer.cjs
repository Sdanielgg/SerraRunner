const assert = require('node:assert/strict');
const { Client } = require('colyseus.js');
const { matchMaker } = require('@colyseus/core');
const { createGameServer } = require('../build-server/server/index.js');
const { createMultiplayerClient } = require('../build-server/src/game/multiplayer-client.js');
const { createPhysics, createPhysicsWorld, emptyControls } = require('../build-server/src/game/physics.js');
const { NETWORK_VERSION, ROOM_NAME, serverAddress } = require('../build-server/src/game/network-types.js');

async function waitFor(test, message, timeout = 6000) {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
async function run() {
  assert.equal(serverAddress(' wss://serra.example/ '), 'wss://serra.example');
  assert.throws(() => serverAddress('http://serra.example'), /https/);
  assert.throws(() => serverAddress('https://user:pass@example.com'), /endereço/);
  const sharedWorld = createPhysicsWorld();
  const carA = createPhysics('jeep', sharedWorld); const carB = createPhysics('crawler', sharedWorld);
  carA.reset({ x: 0, y: 1.4, z: 0, yaw: 0 }); carB.reset({ x: 0.5, y: 1.4, z: 0, yaw: 0 });
  for (let i = 0; i < 120; i++) {
    carA.applyControls(1 / 60, emptyControls()); carB.applyControls(1 / 60, emptyControls()); sharedWorld.step(1 / 60);
  }
  assert(carA.chassis.position.distanceTo(carB.chassis.position) > 1.5, 'Vehicles collide in one shared authoritative world');
  carA.dispose(); carB.dispose();
  assert.equal(sharedWorld.bodies.filter(body => body.mass > 0).length, 0, 'Disposal removes player bodies');

  const { game, http } = createGameServer();
  const rooms = [];
  let controller; let inputTimer;
  try {
    await game.listen(0, '127.0.0.1');
    const address = `http://127.0.0.1:${http.address().port}`;
    const client = new Client(address);
    const options = { version: NETWORK_VERSION, name: 'Ana', vehicleId: 'jeep' };
    const first = await client.create(ROOM_NAME, options); rooms.push(first);
    let latest;
    first.onMessage('snapshot', state => { latest = state; });
    first.onMessage('pong', () => {});
    assert.match(first.roomId, /^[A-F0-9]{8}$/, 'Invite code has eight characters');
    for (const [name, vehicleId] of [['Bruno', 'crawler'], ['Carla', 'rally'], ['Diogo', 'jeep']]) {
      const room = await client.joinById(first.roomId, { ...options, name, vehicleId }); rooms.push(room);
      room.onMessage('snapshot', () => {});
    }
    await waitFor(() => latest?.players.length === 4, 'four synchronized players');
    assert.equal(new Set(latest.players.map(player => player.body.position.x)).size, 4, 'Players spawn in separate slots');
    assert.deepEqual(new Set(latest.players.map(player => player.vehicleId)), new Set(['jeep', 'crawler', 'rally']));
    await assert.rejects(client.joinById(first.roomId, options), /full|locked|maxClients/i);
    await assert.rejects(client.joinById('00000000', options));
    await assert.rejects(client.create(ROOM_NAME, { ...options, version: 999 }), /versão/);
    const separate = await client.create(ROOM_NAME, options); rooms.push(separate);
    let separateState; separate.onMessage('snapshot', state => { separateState = state; });
    await waitFor(() => separateState?.players.length === 1, 'room isolation');
    assert.notEqual(separate.roomId, first.roomId);

    let seq = 0;
    const own = () => latest.players.find(player => player.id === first.sessionId);
    const start = { ...own().body.position };
    inputTimer = setInterval(() => first.send('input', { seq: ++seq, controls: { ...emptyControls(), throttle: true }, gearing: 'high', position: { x: 99999, y: 99999, z: 99999 } }), 40);
    await waitFor(() => own().speed > 18, 'server applies commands');
    assert(Math.hypot(own().body.position.x - start.x, own().body.position.z - start.z) > 0.5, 'Vehicle advances on every client');
    assert(Math.abs(own().body.position.x) < 100, 'Client cannot submit its own position');
    clearInterval(inputTimer); inputTimer = null;
    const stalePlayer = matchMaker.getLocalRoomById(first.roomId).players.get(first.sessionId);
    await waitFor(() => !stalePlayer.controls.throttle, 'input timeout releases a disconnected pedal', 2000);

    const second = rooms[1];
    second.send('vehicle', { vehicleId: 'rally', location: 'trail' });
    await waitFor(() => latest.players.find(player => player.id === second.sessionId)?.vehicleId === 'rally', 'vehicle switch broadcasts to everyone');
    const changed = latest.players.find(player => player.id === second.sessionId);
    assert.equal(changed.gearing, 'low'); assert(changed.body.position.x < -30);
    await rooms[3].leave(); rooms.splice(3, 1);
    await waitFor(() => latest.players.length === 3, 'departing player removed');

    let status; let networkSnapshot; const phases = [];
    controller = createMultiplayerClient(value => { status = value; phases.push(value.phase); }, snapshot => { networkSnapshot = snapshot; });
    await controller.connect({ address, code: first.roomId, name: 'Eva', vehicleId: 'crawler' });
    await waitFor(() => status.phase === 'online' && networkSnapshot?.players.length === 4, 'app client joins a room');
    const session = status.room.sessionId;
    controller.setInput({ ...emptyControls(), throttle: true }, 'low');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.speed > 10, 'app client sends held controls');
    controller.release();
    const serverRoom = matchMaker.getLocalRoomById(first.roomId);
    serverRoom.clients.getById(session).ref.terminate();
    await waitFor(() => phases.includes('reconnecting'), 'automatic reconnect begins');
    await waitFor(() => status.phase === 'online' && status.room.sessionId === session && status.room.players.length === 4, 'automatic reconnect preserves the player', 10000);
    controller.selectVehicle('rally', 'garage');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.vehicleId === 'rally', 'app client can change its vehicle');
    controller.leave();
    await waitFor(() => latest.players.length === 3, 'app client leaves cleanly');
    assert.equal(status.phase, 'offline');
    console.log('Multiplayer checks passed: shared-world collisions, 4 players, private codes, full/missing rooms, protocol version, room isolation, authoritative movement, stale input release, vehicle changes, automatic reconnection, clean leave.');
  } finally {
    if (inputTimer) clearInterval(inputTimer);
    controller?.dispose();
    await Promise.allSettled(rooms.map(room => room.leave()));
    await game.gracefullyShutdown(false);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
