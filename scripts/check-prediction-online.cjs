const assert = require('node:assert/strict');
const { createGameServer } = require('../build-server/server/index.js');
const { createSupabaseServices } = require('../build-server/server/supabase.js');
const { createSupabaseFixture } = require('./supabase-fixture.cjs');
const { createMultiplayerClient } = require('../build-server/src/game/multiplayer-client.js');
const { createPrediction } = require('../build-server/src/game/prediction.js');
const { emptyControls } = require('../build-server/src/game/physics.js');
const { networkTiming } = require('../build-server/src/game/network-config.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test, message) { const start = Date.now(); while (!test()) { if (Date.now() - start > 6000) throw new Error(message); await pause(20); } }
async function run() {
  const fixture = await createSupabaseFixture();
  const { game, http } = createGameServer(createSupabaseServices(fixture.env));
  const prediction = createPrediction(); let status; let own; let timer; let throttle = true; let snapshots = 0;
  const controller = createMultiplayerClient(s => { status = s; }, (snapshot, sessionId) => {
    snapshots++; own = snapshot.players.find(p => p.id === sessionId); prediction.reconcile(snapshot, sessionId);
  }, { prediction: true });
  try {
    await game.listen(0, '127.0.0.1');
    await controller.connect({ address: `http://127.0.0.1:${http.address().port}`, vehicleId: 'jeep', getAccessToken: async () => fixture.tokenFor('Preditor') });
    await waitFor(() => prediction.debug().ready && status.phase === 'online', 'Initial authoritative physics state must initialize prediction');
    const start = { ...own.body.position };
    timer = setInterval(() => {
      const commands = prediction.advance(1 / networkTiming.simulationHz, { ...emptyControls(), throttle, brake: !throttle }, 'high');
      controller.enqueueInputs(commands);
    }, 1000 / networkTiming.simulationHz);
    await pause(1800);
    assert(own.speed > 15, 'Actual predictive client batches accelerate the authoritative server car');
    assert(Math.hypot(own.body.position.x - start.x, own.body.position.z - start.z) > 2);
    assert(own.acknowledgedSeq > 50, 'The real server acknowledges individual predicted ticks');
    assert(prediction.debug().pending < 20, 'The actual client/server pipeline bounds unacknowledged commands');
    assert(prediction.pose().car.chassis.position.distanceTo(own.body.position) < 5);
    throttle = false; prediction.clearPending(); controller.release();
    await waitFor(() => own.speed < 1, 'Release/braking must converge on authoritative state');
    assert(snapshots > 30);
    controller.leave(); assert.equal(status.phase, 'offline');
    assert.equal(status.tournament, undefined, 'Leaving clears competition state for local free driving');
    console.log('Live prediction pipeline passed: production multiplayer client + predictor + Colyseus, input batching, authoritative ACKs, bounded replay history, real acceleration, braking/release and clean leave. Supabase Auth uses a test-only HTTP fixture.');
  } finally { if (timer) clearInterval(timer); controller.dispose(); prediction.dispose(); await game.gracefullyShutdown(false); await fixture.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
