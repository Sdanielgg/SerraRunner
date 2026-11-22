const assert = require('node:assert/strict');
const { createPrediction } = require('../build-server/src/game/prediction.js');
const { createPhysics, emptyControls } = require('../build-server/src/game/physics.js');
const { NETWORK_VERSION } = require('../build-server/src/game/network-types.js');
const { networkTiming } = require('../build-server/src/game/network-config.js');
const dt = 1 / networkTiming.simulationHz;
function player(car, tick, ack = -1, revision = 0) { return { id: 'self', name: 'Self', vehicleId: 'jeep', gearing: 'high', revision, body: { position: { ...car.chassis.position }, quaternion: { ...car.chassis.quaternion } }, wheels: [], speed: 0, reverse: false, horn: false, hornTone: 'auto', physics: car.getState(), acknowledgedSeq: ack, controlsEnabled: true }; }
function snapshot(car, tick, ack = -1, revision = 0) { return { version: NETWORK_VERSION, tick, players: [player(car, tick, ack, revision)] }; }
for (const fps of [30, 60, 144]) {
  const authoritative = createPhysics(); for (let i = 0; i < 180; i++) authoritative.step(dt, emptyControls());
  const local = createPrediction(); local.reconcile(snapshot(authoritative, 0), 'self');
  let frames = [];
  for (let i = 0; i < fps; i++) frames.push(...local.advance(1 / fps, { ...emptyControls(), throttle: true }, 'high'));
  assert.equal(frames.length, 60, `${fps} fps generates exactly 60 fixed-tick inputs`);
  assert(local.pose().car.chassis.position.distanceTo(authoritative.chassis.position) > 1, 'Local throttle responds before any authoritative echo');
  assert.equal(new Set(frames.map(c => c.seq)).size, frames.length);
  let ack = -1;
  for (const command of frames.slice(0, 45)) { authoritative.applyControls(dt, command.controls, command.gearing); authoritative.world.step(dt); ack = command.seq; }
  local.reconcile(snapshot(authoritative, 45, ack), 'self'); assert.equal(local.debug().pending, 15, 'Acknowledged inputs are removed and only the unacknowledged tail is replayed');
  const expected = createPhysics(); expected.restoreState(authoritative.getState());
  for (const command of frames.slice(45)) { expected.applyControls(dt, command.controls, command.gearing); expected.world.step(dt); }
  assert(local.pose().car.chassis.position.distanceTo(expected.chassis.position) < 0.05, 'Reconciliation restores velocities/suspension and replays the input tail');
  local.reconcile(snapshot(authoritative, 20, 10), 'self'); assert.equal(local.debug().pending, 15, 'Out-of-order snapshots cannot rewind acknowledgements');
  authoritative.reset({ x: 50, y: 1.5, z: 20, yaw: 0 }); local.reconcile(snapshot(authoritative, 48, ack, 1), 'self');
  assert.equal(local.debug().pending, 0); assert(local.pose().offset.length() === 0, 'Recovery/reset revisions snap to server state without replaying old commands');
  const peer = { ...player(authoritative, 48), id: 'peer', body: { position: { x: 52, y: 1, z: 20 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } } };
  local.reconcile({ ...snapshot(authoritative, 51, ack, 1), players: [player(authoritative, 51, ack, 1), peer] }, 'self'); assert.equal(local.debug().proxyCount, 1, 'Nearby opponents retain prediction collision proxies');
  local.suspend(); assert.equal(local.debug().pending, 0); assert.equal(local.pose(), null);
  local.dispose(); authoritative.dispose(); expected.dispose();
}
assert.equal(networkTiming.simulationHz, 60); assert.equal(networkTiming.snapshotHz, 20);
// Exercise a continuous 100 ms one-way link with snapshot jitter/reordering.
const server = createPhysics(); for (let i = 0; i < 180; i++) server.step(dt, emptyControls());
const predicted = createPrediction(); predicted.reconcile(snapshot(server, 0), 'self');
const inputPackets = []; const serverQueue = []; const snapshots = [];
let held = emptyControls(); let ack = -1; let worstError = 0;
for (let tick = 1; tick <= 360; tick++) {
  const controls = tick < 150 ? { ...emptyControls(), throttle: true } : { ...emptyControls(), brake: true };
  for (const command of predicted.advance(dt, controls, 'high')) inputPackets.push({ delivery: tick + 6, command });
  while (inputPackets[0]?.delivery <= tick) serverQueue.push(inputPackets.shift().command);
  const next = serverQueue.shift(); if (next) { held = next.controls; ack = next.seq; }
  server.applyControls(dt, held, 'high'); server.world.step(dt);
  if (tick % 3 === 0) snapshots.push({ delivery: tick + 6 + (tick % 4) * 2, state: snapshot(server, tick, ack) });
  for (let i = snapshots.length - 1; i >= 0; i--) if (snapshots[i].delivery <= tick) { predicted.reconcile(snapshots[i].state, 'self'); snapshots.splice(i, 1); }
  worstError = Math.max(worstError, predicted.pose().car.chassis.position.distanceTo(server.chassis.position));
  assert(predicted.debug().pending < 40, 'Latency/jitter cannot grow an unbounded replay history');
}
assert(worstError < 8, 'Prediction remains bounded under delayed, reordered snapshots');
assert(predicted.pose().car.chassis.position.distanceTo(server.chassis.position) < 0.2, 'Braking and reconciliation converge after a delayed-input run');
predicted.dispose(); server.dispose();
console.log('Prediction checks passed at 30/60/144 fps: immediate local response, 60 Hz inputs, ack/replay, complete physics state, stale snapshots, recovery revisions, collision proxies and suspension on disconnect.');
