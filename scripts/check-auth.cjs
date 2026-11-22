const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { createSupabaseFixture } = require('./supabase-fixture.cjs');
const { createSupabaseServices } = require('../build-server/server/supabase.js');
const { validateProfile, authErrorMessage } = require('../build-server/src/auth/profile.js');
const { createCompetitionRun, competitionGates, competitionRules } = require('../build-server/src/game/competition.js');
const { createPhysics, emptyControls } = require('../build-server/src/game/physics.js');
const { raceSamples } = require('../build-server/src/game/race-track.js');
const { Vec3 } = require('cannon-es');

async function run() {
  assert.throws(() => validateProfile('a', '#123456'));
  assert.throws(() => validateProfile('Ana\u0001', '#123456'));
  assert.throws(() => validateProfile('Ana', 'red'));
  assert.deepEqual(validateProfile(' Ana ', '#ABCDEF'), { display_name: 'Ana', vehicle_color: '#abcdef' });
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /incorretos/);
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /Confirma/);
  assert.match(authErrorMessage({ code: 'otp_expired' }), /expirou/);
  assert.match(authErrorMessage({ name: 'AuthRetryableFetchError' }), /rede/);
  const missing = createSupabaseServices({});
  assert.equal(missing.canPersist, false); await assert.rejects(missing.verify('anything'), /configurada/);

  const fixture = await createSupabaseFixture();
  const services = createSupabaseServices(fixture.env);
  let client; let restored;
  try {
    const token = fixture.tokenFor('Ana');
    const identity = await services.verify(token);
    assert.equal(identity.userId, fixture.users.get('Ana').id); assert.equal(identity.name, 'Ana');
    await assert.rejects(services.verify(fixture.tokenFor('Ana', -1)), /expirada/);
    fixture.revoked.add(token); await assert.rejects(services.verify(token), /inválida|expirada/);
    const memory = new Map();
    const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } };
    const options = { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'session-test' } };
    client = createClient(fixture.url, 'public-test-key', options);
    const invalid = await client.auth.signInWithPassword({ email: 'ana@test.invalid', password: 'wrong' });
    assert.equal(invalid.error.code, 'invalid_credentials');
    const login = await client.auth.signInWithPassword({ email: 'ana@test.invalid', password: 'correct-password' });
    assert(!login.error); assert(memory.has('session-test'), 'The session is persisted by the Supabase SDK');
    restored = createClient(fixture.url, 'public-test-key', options);
    const session = await restored.auth.getSession(); assert.equal(session.data.session.user.id, identity.userId);
    const refresh = await restored.auth.refreshSession(); assert(!refresh.error); assert.notEqual(refresh.data.session.access_token, login.data.session.access_token);
    assert.equal((await services.verify(refresh.data.session.access_token)).userId, identity.userId, 'A renewed token keeps the authenticated user identity');
    await restored.auth.signOut({ scope: 'local' }); assert(!memory.has('session-test'), 'Logout removes the stored session');
    const signup = await restored.auth.signUp({ email: 'novo@test.invalid', password: 'correct-password' });
    assert(!signup.error); assert.equal(signup.data.session, null, 'Email confirmation does not create a fake signed-in session');
    assert(!(await restored.auth.resend({ type: 'signup', email: 'novo@test.invalid' })).error);
    const badOtp = await restored.auth.verifyOtp({ email: 'novo@test.invalid', type: 'signup', token: '000000' });
    assert.equal(badOtp.error.code, 'otp_expired');
    const verified = await restored.auth.verifyOtp({ email: 'novo@test.invalid', type: 'signup', token: '123456' });
    assert(!verified.error); assert.equal(verified.data.session.user.id, fixture.users.get('Novo').id);
    fixture.stats.logoutOffline = true;
    await restored.auth.signOut({ scope: 'local' });
    assert(!memory.has('session-test'), 'A network failure cannot preserve the local session after logout');
    console.log('Auth checks passed with a test-only HTTP fixture: profile validation, missing configuration, verified identity, invalid/expired tokens, credentials, SDK persistence, restoration, refresh and logout. Real Supabase validation is still required.');
  } finally { await client?.auth.stopAutoRefresh(); await restored?.auth.stopAutoRefresh(); await fixture.close(); }

  // Validate ordered, directional timing, then complete the actual physical lap.
  const invalidRun = createCompetitionRun(); invalidRun.start({ x: 70, y: 1, z: 1 }); invalidRun.step(3, { x: 70, y: 1, z: 1 });
  const finish = competitionGates.at(-1);
  invalidRun.step(1 / 60, { x: finish.x + finish.dx * 2, y: 1, z: finish.z + finish.dz * 2 });
  assert.equal(invalidRun.status().passed, 0, 'Teleporting across a gate is rejected');
  invalidRun.cancel(); assert.equal(invalidRun.status().phase, 'cancelled');
  for (const id of ['jeep', 'crawler', 'rally', 'gt3']) {
    const car = createPhysics(id); car.startRace();
    const race = createCompetitionRun(); race.start(car.chassis.position);
    for (let i = 0; i < competitionRules.countdownSeconds * 60; i++) { car.step(1 / 60, { ...emptyControls(), brake: true }); race.step(1 / 60, car.chassis.position); }
    let completed = false;
    for (let tick = 0; tick < 80 * 60; tick++) {
      let nearest = 0; let distance = Infinity;
      raceSamples.forEach((point, i) => { const d = Math.hypot(point.x - car.chassis.position.x, point.z - car.chassis.position.z); if (d < distance) { nearest = i; distance = d; } });
      const target = raceSamples[(nearest + 4) % raceSamples.length];
      const local = car.chassis.quaternion.conjugate().vmult(new Vec3(target.x - car.chassis.position.x, 0, target.z - car.chassis.position.z));
      const angle = Math.atan2(local.x, -local.z); const speed = car.chassis.velocity.length();
      car.step(1 / 60, { ...emptyControls(), left: angle < -0.04, right: angle > 0.04, throttle: speed < 7, brake: speed > 8 });
      if (race.step(1 / 60, car.chassis.position)) { completed = true; break; }
    }
    assert(completed, `${id} completes the server-timed circuit`); assert(race.status().elapsedMs > 30000); assert.equal(race.status().passed, competitionGates.length);
    car.dispose();
  }
  console.log('Competition checks passed: countdown, ordered gates, anti-teleport, cancellation and physical completion with all four vehicles.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
