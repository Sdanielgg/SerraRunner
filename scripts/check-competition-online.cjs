const assert = require('node:assert/strict');
const { Client } = require('colyseus.js');
const { matchMaker } = require('@colyseus/core');
const { Vec3 } = require('cannon-es');
const { createGameServer } = require('../build-server/server/index.js');
const { createSupabaseServices } = require('../build-server/server/supabase.js');
const { createSupabaseFixture } = require('./supabase-fixture.cjs');
const { NETWORK_VERSION, ROOM_NAME } = require('../build-server/src/game/network-types.js');
const { raceSamples } = require('../build-server/src/game/race-track.js');
const { emptyControls } = require('../build-server/src/game/physics.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test, message, timeout = 6000) { const start = Date.now(); while (!test()) { if (Date.now() - start > timeout) throw new Error(`Timeout: ${message}`); await pause(30); } }
async function run() {
  const fixture = await createSupabaseFixture();
  const { game, http } = createGameServer(createSupabaseServices(fixture.env));
  let room; let timer;
  try {
    await game.listen(0, '127.0.0.1');
    const client = new Client(`http://127.0.0.1:${http.address().port}`);
    room = await client.create(ROOM_NAME, { version: NETWORK_VERSION, accessToken: fixture.tokenFor('Ana'), userId: 'forged', vehicleId: 'gt3' });
    let status; let snapshot;
    room.onMessage('competition', value => { status = value; }); room.onMessage('snapshot', value => { snapshot = value; });
    room.onMessage('pong', () => {});
    room.send('competition', { action: 'finish', user_id: 'forged', elapsed_ms: 1 });
    await pause(450); assert.equal(fixture.results.size, 0);
    room.send('competition', 'start'); await waitFor(() => status?.phase === 'countdown', 'competition starts');
    await pause(450); room.send('reset', 'race'); await waitFor(() => status?.phase === 'cancelled', 'reset cancels attempt');
    await pause(450); room.send('competition', 'start');
    await waitFor(() => status?.phase === 'ready', 'server countdown finishes');
    fixture.stats.failWrites = 1;
    let seq = 0;
    timer = setInterval(() => {
      const own = snapshot?.players.find(player => player.id === room.sessionId); if (!own) return;
      let nearest = 0; let distance = Infinity;
      raceSamples.forEach((point, i) => { const d = Math.hypot(point.x - own.body.position.x, point.z - own.body.position.z); if (d < distance) { distance = d; nearest = i; } });
      const target = raceSamples[(nearest + 4) % raceSamples.length];
      // Read the same server car for orientation; send only normal input commands.
      const player = matchMaker.getLocalRoomById(room.roomId).players.get(room.sessionId);
      const local = player.car.chassis.quaternion.conjugate().vmult(new Vec3(target.x - own.body.position.x, 0, target.z - own.body.position.z));
      const angle = Math.atan2(local.x, -local.z); const speed = player.car.chassis.velocity.length();
      room.send('input', { seq: ++seq, controls: { ...emptyControls(), left: angle < -0.04, right: angle > 0.04, throttle: speed < 7, brake: speed > 8 }, gearing: 'high' });
    }, 30);
    await waitFor(() => status?.phase === 'save-error', 'full authoritative lap reaches persistence failure', 90000);
    clearInterval(timer); timer = null;
    assert.equal(fixture.results.size, 0, 'A failed write is never presented as saved');
    room.send('competition', 'start'); await pause(450);
    assert.equal(status.phase, 'save-error', 'Starting again cannot discard a result awaiting retry');
    room.send('competition', 'retry'); await waitFor(() => status?.phase === 'saved', 'retry saves result');
    assert.equal(fixture.results.size, 1);
    const result = [...fixture.results.values()][0];
    assert.equal(result.user_id, fixture.users.get('Ana').id); assert(result.elapsed_ms > 30000); assert.equal(result.vehicle_id, 'gt3');
    const id = result.id;
    await pause(450); room.send('competition', 'retry'); await pause(450); assert.equal(fixture.results.size, 1); assert(fixture.results.has(id));
    // A different user's valid token must never transfer an existing connection.
    const left = new Promise(resolve => room.onLeave(resolve));
    room.send('auth', fixture.tokenFor('Bob'));
    assert.equal(await left, 4003);
    room = null;
    const expires = await client.create(ROOM_NAME, { version: NETWORK_VERSION, accessToken: fixture.tokenFor('Ana', 2), vehicleId: 'jeep' });
    expires.onMessage('snapshot', () => {}); expires.onMessage('competition', () => {});
    const expired = new Promise(resolve => expires.onLeave(resolve));
    assert.equal(await expired, 4003, 'Expired sessions are disconnected by the server');
    console.log('Online competition passed: real Colyseus/physics lap, reset cancellation, failed persistence and retry, verified result ownership, identity-switch rejection and session expiry. Supabase HTTP is a test fixture, not a production validation.');
  } finally { if (timer) clearInterval(timer); await room?.leave(); await game.gracefullyShutdown(false); await fixture.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
