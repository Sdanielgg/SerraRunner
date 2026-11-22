const assert = require('node:assert/strict');
const { createTournament, tournamentRules } = require('../build-server/src/game/tournament.js');
const { createCircuitLap, circuitCheckpoints, circuitRules } = require('../build-server/src/game/circuit-race.js');
const { raceSamples } = require('../build-server/src/game/race-track.js');
const { createPhysics, emptyControls } = require('../build-server/src/game/physics.js');
const { Vec3 } = require('cannon-es');
const dt = 1 / 60;
const origin = { x: 70, y: 1, z: -8 };
const alice = { id: 'a', userId: '20000000-0000-4000-8000-000000000002', name: 'Alice', color: '#123456', vehicleId: 'jeep', slot: 0, connected: true };
const bob = { id: 'b', userId: '10000000-0000-4000-8000-000000000001', name: 'Bob', color: '#abcdef', vehicleId: 'gt3', slot: 1, connected: true };
const positions = () => new Map([['a', { ...origin }], ['b', { ...origin }]]);
const route = [origin, ...Array.from({ length: raceSamples.length + 1 }, (_, i) => ({ ...raceSamples[(circuitRules.startSample + i) % raceSamples.length], y: 1 }))];
function begin(race, round) { race.ready('a', true); race.ready('b', true); race.start('a', round, 'match', `round-${round}`); while (race.snapshot().phase === 'countdown') race.step(dt, positions()); }
function drive(race, both = true) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]; const b = route[i]; const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    for (let j = 1; j <= steps; j++) {
      const p = { x: a.x + (b.x - a.x) * j / steps, y: 1, z: a.z + (b.z - a.z) * j / steps };
      race.step(dt, new Map([['a', p], ['b', both ? p : origin]]));
    }
  }
}
const match = createTournament({ countdownSeconds: 0.05, roundSeconds: 30, resultsSeconds: 0.01 });
match.add(alice); match.add(bob);
assert.equal(match.snapshot().targetPoints, 15);
assert.throws(() => match.start('a', 0, 'm', 'r'), /prontos/);
match.ready('a', true); match.ready('b', true);
assert.throws(() => match.start('b', 0, 'm', 'r'), /anfitrião/);
match.update('b', { vehicleId: 'crawler' }); assert.equal(match.snapshot().members[1].ready, false);
assert.throws(() => match.target('b', 3)); match.target('a', 3); assert(match.snapshot().members.every(m => !m.ready));
match.target('a', tournamentRules.targetPoints);
for (let round = 0; round < 15; round++) {
  begin(match, round);
  assert.throws(() => match.add({ ...alice, id: 'late', userId: 'late' }));
  assert.throws(() => match.update('b', { vehicleId: 'rally' }));
  drive(match);
  const result = match.snapshot();
  assert.equal(result.phase, 'results'); assert.equal(result.winnerId, 'b', 'Exact-time ties use authenticated userId, not join/iteration order');
  assert.equal(result.members[1].points, round + 1); assert.equal(result.members[0].points, 0);
  const sum = result.members.reduce((n, m) => n + m.points, 0);
  for (let i = 0; i < 30; i++) match.step(dt, positions());
  assert.equal(match.snapshot().members.reduce((n, m) => n + m.points, 0), sum, 'Closing a round twice never awards another point');
  assert.equal(match.snapshot().phase, 'garage');
  match.update('b',{connected:false});assert.equal(match.snapshot().members[1].points,round+1,'A disconnected winner keeps accumulated points');
  match.update('b',{connected:true});assert.equal(match.snapshot().members[1].points,round+1,'Returning does not award or reset points');
  match.persistence('saved');
}
assert.equal(match.snapshot().championId, 'b');
assert.throws(() => match.ready('b', true)); match.end('a'); assert.equal(match.snapshot().phase, 'finished');
match.reset('a'); assert.equal(match.snapshot().phase, 'lobby'); assert(match.snapshot().members.every(m => m.points === 0));

const empty = createTournament({ countdownSeconds: 0.01, roundSeconds: 0.1, resultsSeconds: 1 }); empty.add(alice); empty.add(bob); begin(empty, 0);
for (let i = 0; i < 10; i++) empty.step(dt, positions());
assert.equal(empty.snapshot().phase, 'results'); assert.equal(empty.snapshot().winnerId, null); assert(empty.snapshot().members.every(m => m.points === 0));
assert.equal(match.snapshot().round, 0, 'Separate state machines never share scores or phases');

const lap = createCircuitLap(origin);
lap.step(dt, { x: 150, y: 1, z: 35 }); assert(lap.status().needsRecovery, 'Skipping across the map requires recovery'); assert.equal(lap.status().passed, 0);
const recovered = lap.recover(1, -2); assert(recovered); assert.equal(lap.status().penaltyMs, 5000); assert.equal(lap.status().passed, 0); assert.equal(lap.recover(1.5, -2), null);
assert(lap.recover(3, -2)); assert.equal(lap.status().penaltyMs, 10000);
assert.equal(circuitCheckpoints.length, 13); assert.equal(circuitRules.sectors, 12);
const gate=circuitCheckpoints[0];const absentLap=createCircuitLap({x:gate.x-gate.dx*.1,y:1,z:gate.z-gate.dz*.1});
absentLap.step(dt,{x:gate.x+gate.dx*.1,y:1,z:gate.z+gate.dz*.1},false);assert.equal(absentLap.status().passed,0);assert(absentLap.status().needsRecovery,'Crossing a checkpoint while absent requires recovery instead of awarding progress');
for (const [slot, id] of ['jeep', 'crawler', 'rally', 'gt3'].entries()) {
  const car = createPhysics(id); car.startRace(slot);
  for (let i = 0; i < 180; i++) car.step(dt, { ...emptyControls(), brake: true });
  const physicalLap = createCircuitLap(car.chassis.position); let finished = false;
  for (let tick = 0; tick < 80 * 60; tick++) {
    let nearest = 0; let distance = Infinity;
    raceSamples.forEach((p, i) => { const d = Math.hypot(p.x - car.chassis.position.x, p.z - car.chassis.position.z); if (d < distance) { nearest = i; distance = d; } });
    const target = raceSamples[(nearest + 4) % raceSamples.length];
    const local = car.chassis.quaternion.conjugate().vmult(new Vec3(target.x - car.chassis.position.x, 0, target.z - car.chassis.position.z));
    const angle = Math.atan2(local.x, -local.z); const speed = car.chassis.velocity.length();
    car.step(dt, { ...emptyControls(), left: angle < -0.04, right: angle > 0.04, throttle: speed < 7, brake: speed > 8 });
    if (physicalLap.step(dt, car.chassis.position) !== null) { finished = true; break; }
  }
  assert(finished, `${id} completes the competitive checkpoints from grid slot ${slot} without shortcut/recovery flags`); car.dispose();
}
console.log('Tournament checks passed: all-ready/host gates, vehicle changes, exact ties, 15 rounds/15 one-point wins, no duplicates, no-finish timeout, garage/new/end, isolated scores, anti-shortcut and server recovery penalties.');
