const assert = require('node:assert/strict');
const { Client } = require('colyseus.js');
const { createClient } = require('@supabase/supabase-js');
const { matchMaker } = require('@colyseus/core');
const { Vec3 } = require('cannon-es');
const { createGameServer } = require('../build-server/server/index.js');
const { createSupabaseServices } = require('../build-server/server/supabase.js');
const { createSupabaseFixture } = require('./supabase-fixture.cjs');
const { NETWORK_VERSION, ROOM_NAME } = require('../build-server/src/game/network-types.js');
const { networkTiming } = require('../build-server/src/game/network-config.js');
const { raceSamples } = require('../build-server/src/game/race-track.js');
const { emptyControls } = require('../build-server/src/game/physics.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(test, message, timeout = 6000) { const start = Date.now(); while (!test()) { if (Date.now() - start > timeout) throw new Error(`Timeout: ${message}`); await pause(20); } }
async function run() {
 const fixture = await createSupabaseFixture();
 const { game, http } = createGameServer(createSupabaseServices(fixture.env), { countdownSeconds: 0.15, roundSeconds: 100, resultsSeconds: 0.4 });
 const rooms = []; let timer; let latest; let errors = 0;
 try {
  await game.listen(0, '127.0.0.1'); const client = new Client(`http://127.0.0.1:${http.address().port}`);
  const opts = name => ({ version: NETWORK_VERSION, accessToken: fixture.tokenFor(name), vehicleId: 'jeep' });
  const auth = createClient(fixture.url, fixture.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await auth.auth.signInWithPassword({email:'ana@test.invalid',password:'correct-password'});
  assert.ifError(login.error);
  let host = await client.create(ROOM_NAME, { version: NETWORK_VERSION, accessToken: login.data.session.access_token, vehicleId: 'jeep' }); rooms.push(host);
  const attach = (room, observe = false) => { room.onMessage('competition', () => {}); room.onMessage('snapshot', s => { if (observe) latest = s; }); room.onMessage('pong', () => {}); room.onError(() => { errors++; }); };
  attach(host, true); await waitFor(() => latest, 'initial lobby');
  host.send('tournament', { type: 'start', round: 0 }); await pause(100); assert.equal(latest.tournament.phase, 'lobby'); assert(errors > 0);
  for (const [name, vehicleId] of [['Bruno','crawler'],['Carla','rally'],['Diogo','gt3']]) { const room = await client.joinById(host.roomId, { ...opts(name), vehicleId }); rooms.push(room); attach(room); }
  await waitFor(() => latest.players.length === 4, 'four-player lobby');
  assert.equal(new Set(latest.tournament.members.map(m => m.vehicleId)).size, 4);
  await assert.rejects(client.joinById(host.roomId, opts('Quinto')), /full|locked|maxClients/i);
  const separate = await client.create(ROOM_NAME, opts('Isolado')); rooms.push(separate); let isolated;
  separate.onMessage('snapshot', s => { isolated = s; }); separate.onMessage('competition', () => {});
  const ticks = []; const listener = host.onMessage('snapshot', s => ticks.push(s.tick));
  await pause(1100); listener();
  const unique = [...new Set(ticks)];
  assert(unique.length >= 17 && unique.length <= 26, 'Snapshots arrive near 20 Hz under local load');
  assert(unique.slice(1).every((n, i) => n - unique[i] === 3), 'Every snapshot advances exactly three 60 Hz simulation ticks');
  rooms[1].send('tournament', { type: 'target', points: 1 }); await pause(100); assert.equal(latest.tournament.targetPoints, 15);
  host.send('tournament', { type: 'target', points: 1 }); await waitFor(() => latest.tournament.targetPoints === 1, 'short demo target');
  for (const room of rooms.slice(0, 3)) room.send('tournament', { type: 'ready', ready: true });
  await pause(100); host.send('tournament', { type: 'start', round: 0 }); await pause(100); assert.equal(latest.tournament.phase, 'lobby', 'The fourth unready player blocks start');
  rooms[3].send('tournament', { type: 'ready', ready: true }); await waitFor(() => latest.tournament.members.every(m => m.ready), 'everyone ready');
  fixture.stats.failRoundWrites = 1;
  host.send('tournament', { type: 'start', round: 0 }); await waitFor(() => latest.tournament.phase === 'race', 'common countdown and race');
  // A reserved existing session can reconnect while new joins remain locked.
  const old = rooms[1]; const reconnectToken = old.reconnectionToken;
  const serverRoom = matchMaker.getLocalRoomById(host.roomId); serverRoom.clients.getById(old.sessionId).ref.terminate();
  await waitFor(() => latest.tournament.members.find(m => m.id === old.sessionId).connected === false, 'disconnect marks the participant');
  client.http.authToken = fixture.tokenFor('Bruno');
  const returned = await client.reconnect(reconnectToken); rooms[1] = returned; attach(returned);
  await waitFor(() => latest.tournament.members.find(m => m.id === old.sessionId).connected, 'valid reauthentication resumes a locked room session');
  await rooms[3].leave(); rooms[3] = null; await waitFor(() => latest.players.length === 3, 'one driver leaves');
  await assert.rejects(client.joinById(host.roomId, opts('Quinto')), /locked|competição|indisponível/i);
  host.send('reset', 'trail'); await waitFor(() => latest.tournament.members.find(m => m.id === host.sessionId).recoveries === 1, 'server checkpoint recovery');
  assert(latest.players.find(p => p.id === host.sessionId).body.position.x > 60, 'A forged reset destination cannot skip the circuit');
  let seq = 0;
  timer = setInterval(() => {
   const own = latest.players.find(p => p.id === host.sessionId); if (!own || latest.tournament.phase !== 'race') return;
   let nearest = 0; let distance = Infinity;
   raceSamples.forEach((p, i) => { const d = Math.hypot(p.x - own.body.position.x, p.z - own.body.position.z); if (d < distance) { nearest = i; distance = d; } });
   const target = raceSamples[(nearest + 4) % raceSamples.length]; const car = serverRoom.players.get(host.sessionId).car;
   const local = car.chassis.quaternion.conjugate().vmult(new Vec3(target.x - own.body.position.x, 0, target.z - own.body.position.z));
   const angle = Math.atan2(local.x, -local.z); const speed = car.chassis.velocity.length();
   const controls = { ...emptyControls(), left: angle < -0.04, right: angle > 0.04, throttle: speed < 7, brake: speed > 8 };
   host.send('input', { commands: [{ seq: ++seq, controls, gearing: 'high' }, { seq: ++seq, controls, gearing: 'high' }], horn: false });
  }, 1000 / networkTiming.inputSendHz);
  await waitFor(() => latest.tournament.members.find(m => m.id === host.sessionId).status === 'finished', 'actual physical lap through all ordered checkpoints', 90000);
  clearInterval(timer); timer = null;
  assert.equal(latest.tournament.members.find(m => m.id === host.sessionId).passed, 13);
  for (const i of [1,2]) { await rooms[i].leave(); rooms[i] = null; }
  await waitFor(() => latest.tournament.persistence === 'error', 'round persistence failure');
  assert.equal(latest.tournament.winnerId, host.sessionId); assert.equal(latest.tournament.members.find(m => m.id === host.sessionId).points, 1);
  assert.equal(latest.tournament.championId, host.sessionId);
  host.send('tournament', { type: 'retry' }); await waitFor(() => latest.tournament.persistence === 'saved', 'retry persists the same round');
  host.send('tournament', { type: 'retry' }); await pause(100);
  assert.equal(fixture.rounds.size, 1); assert.equal(fixture.stats.roundWrites, 2);
  assert.equal(latest.tournament.members.reduce((sum, m) => sum + m.points, 0), 1, 'Retry never adds another point');
  assert.equal(isolated.tournament.phase, 'lobby'); assert.equal(isolated.tournament.members[0].points, 0, 'Separate Colyseus rooms stay isolated');
  const record = [...fixture.rounds.values()][0]; assert.equal(record.winner_user_id, fixture.users.get('Ana').id);
  assert(record.entries.find(e => e.user_id === record.winner_user_id).elapsed_ms > 35000);
  await waitFor(() => latest.tournament.phase === 'garage', 'results lead to garage');
  const winnerToken=host.reconnectionToken;const winnerBalance=latest.economy.balance;
  serverRoom.clients.getById(host.sessionId).ref.terminate();await waitFor(()=>serverRoom.players.get(host.sessionId).suspended,'winner temporarily absent');
  client.http.authToken=fixture.tokenFor('Ana');host=await client.reconnect(winnerToken);rooms[0]=host;attach(host,true);
  await waitFor(()=>latest.connection?.epoch===1,'winner full state after reconnection');
  assert.equal(latest.tournament.members.find(m=>m.id===host.sessionId).points,1,'Earned point survives actual reconnect');assert.equal(latest.tournament.championId,host.sessionId);assert.equal(latest.economy.balance,winnerBalance);assert.equal(fixture.rounds.size,1);
  host.send('tournament', { type: 'end' }); await waitFor(() => latest.tournament.phase === 'finished', 'competition end');
  host.send('tournament', { type: 'new' }); await waitFor(() => latest.tournament.phase === 'lobby', 'new competition reopens lobby');
  assert.equal(latest.tournament.targetPoints, 15);
  const newcomer = await client.joinById(host.roomId, opts('Quinto')); rooms.push(newcomer); attach(newcomer);
  console.log('Online tournament passed: 2–4/all-ready/host, fifth-player and late-join blocking, valid locked reconnection, 60 Hz / 20 Hz cadence, isolated rooms, 60 Hz input batches, real physics lap, authoritative recovery, 1 point per win, demo champion, atomic retry, results/garage/end/new lobby. Supabase HTTP is test-only.');
 } finally { if (timer) clearInterval(timer); await Promise.allSettled(rooms.filter(Boolean).map(room => room.leave())); await game.gracefullyShutdown(false); await fixture.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
