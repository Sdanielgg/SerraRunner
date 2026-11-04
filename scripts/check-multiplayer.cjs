const assert = require('node:assert/strict');
const { Client } = require('colyseus.js');
const { matchMaker } = require('@colyseus/core');
const { createGameServer } = require('../build-server/server/index.js');
const { createMultiplayerClient } = require('../build-server/src/game/multiplayer-client.js');
const { createPhysics, createPhysicsWorld, emptyControls } = require('../build-server/src/game/physics.js');
const { NETWORK_VERSION, ROOM_NAME, serverAddress } = require('../build-server/src/game/network-types.js');
const { createHornPulse } = require('../build-server/src/game/horn-audio.js');

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
    for (const [name, vehicleId] of [['Bruno', 'crawler'], ['Carla', 'rally'], ['Diogo', 'gt3']]) {
      const room = await client.joinById(first.roomId, { ...options, name, vehicleId }); rooms.push(room);
      room.onMessage('snapshot', () => {});
    }
    await waitFor(() => latest?.players.length === 4, 'four synchronized players');
    assert.equal(new Set(latest.players.map(player => player.body.position.x)).size, 4, 'Players spawn in separate slots');
    assert.deepEqual(new Set(latest.players.map(player => player.vehicleId)), new Set(['jeep', 'crawler', 'rally', 'gt3']));
    const gridRevisions = new Map(latest.players.map(player => [player.id, player.revision]));
    for (const room of rooms) room.send('reset', 'race');
    await waitFor(() => latest.players.every(player => player.revision > gridRevisions.get(player.id) && player.body.position.x > 60 && player.body.position.x < 80), 'four players reach the race grid');
    assert(latest.players.every(player => player.gearing === 'high'), 'Circuit entry selects High on the server');
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const first = latest.players[a].body.position; const second = latest.players[b].body.position;
      assert(Math.hypot(first.x - second.x, first.z - second.z) > 5, 'Race grid slots do not overlap');
    }
    await new Promise(resolve => setTimeout(resolve, 450));
    for (const room of rooms) room.send('reset', 'garage');
    await waitFor(() => latest.players.every(player => Math.abs(player.body.position.x) < 10), 'return from the circuit to the garage');
    await assert.rejects(client.joinById(first.roomId, options), /full|locked|maxClients/i);
    await assert.rejects(client.joinById('00000000', options));
    await assert.rejects(client.create(ROOM_NAME, { ...options, version: 999 }), /versão/);
    const separate = await client.create(ROOM_NAME, options); rooms.push(separate);
    let separateState; separate.onMessage('snapshot', state => { separateState = state; });
    await waitFor(() => separateState?.players.length === 1, 'room isolation');
    assert.notEqual(separate.roomId, first.roomId);

    let seq = 0;
    const own = () => latest.players.find(player => player.id === first.sessionId);
    let hornPeer;
    rooms[1].onMessage('snapshot', snapshot => { hornPeer = snapshot; });
    first.send('input', { seq: ++seq, controls: emptyControls(), gearing: 'high', horn: true, hornTone: 'low' });
    await waitFor(() => own().horn && hornPeer?.players.find(player => player.id === first.sessionId)?.horn, 'horn reaches another client');
    assert.equal(hornPeer.players.find(player => player.id === first.sessionId).hornTone, 'low', 'Selected horn tone is synchronized');
    await waitFor(() => !own().horn, 'stale horn input is released automatically', 2000);
    const hornPulse = createHornPulse((active, tone) => first.send('input', { seq: ++seq, controls: emptyControls(), gearing: 'high', horn: active, hornTone: tone }), () => 0);
    try {
      hornPulse.trigger();
      await waitFor(() => hornPeer.players.find(player => player.id === first.sessionId)?.hornTone === 'low' && hornPeer.players.find(player => player.id === first.sessionId)?.horn, 'first random horn tap reaches peers');
      hornPulse.trigger();
      await waitFor(() => hornPeer.players.find(player => player.id === first.sessionId)?.hornTone === 'mid' && hornPeer.players.find(player => player.id === first.sessionId)?.horn, 'rapid second tap changes the pitch for peers');
      await waitFor(() => !own().horn, 'short horn pulse ends automatically');
    } finally { hornPulse.dispose(); }
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
    controller.setHorn(true, 'high');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.horn, 'app client holds its horn');
    assert.equal(networkSnapshot.players.find(player => player.id === session).hornTone, 'high');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.speed > 10, 'app client sends held controls');
    controller.release();
    await waitFor(() => !networkSnapshot.players.find(player => player.id === session)?.horn, 'releasing controls stops the horn');
    controller.setHorn(true, 'low');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.horn, 'horn is held before disconnection');
    const serverRoom = matchMaker.getLocalRoomById(first.roomId);
    serverRoom.clients.getById(session).ref.terminate();
    await waitFor(() => phases.includes('reconnecting'), 'automatic reconnect begins');
    await waitFor(() => !latest.players.find(player => player.id === session)?.horn, 'disconnect releases a held horn');
    await waitFor(() => status.phase === 'online' && status.room.sessionId === session && status.room.players.length === 4, 'automatic reconnect preserves the player', 10000);
    assert.equal(networkSnapshot.players.find(player => player.id === session)?.horn, false, 'Reconnection does not leave a horn stuck on');
    controller.selectVehicle('gt3', 'race');
    await waitFor(() => networkSnapshot.players.find(player => player.id === session)?.vehicleId === 'gt3', 'app client can select the GT3');
    const gt3 = networkSnapshot.players.find(player => player.id === session);
    assert(gt3.body.position.x > 60 && gt3.gearing === 'high', 'GT3 spawns on the circuit in High');
    controller.leave();
    await waitFor(() => latest.players.length === 3, 'app client leaves cleanly');
    assert.equal(status.phase, 'offline');
    console.log('Multiplayer checks passed: shared-world collisions, 4 players, race grid and return, private codes, full/missing rooms, protocol version, room isolation, authoritative movement, stale input release, vehicle changes, automatic reconnection, clean leave.');
  } finally {
    if (inputTimer) clearInterval(inputTimer);
    controller?.dispose();
    await Promise.allSettled(rooms.map(room => room.leave()));
    await game.gracefullyShutdown(false);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
