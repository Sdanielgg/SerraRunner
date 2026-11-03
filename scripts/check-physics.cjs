/* global __dirname */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const gameModules = new Map();
function loadGameModule(name, overrides = {}) {
  const filename = path.resolve(__dirname, '../src/game', `${name}.ts`);
  if (gameModules.has(filename)) return gameModules.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename; mod.paths = module.paths; gameModules.set(filename, mod);
  mod.require = request => overrides[request] ?? (request.startsWith('./') ? loadGameModule(request.slice(2)) : Module.prototype.require.call(mod, request));
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return mod.exports;
}
const { createPhysics, emptyControls } = loadGameModule('physics');
const fingers = loadGameModule('touch-controls').createTouchControls();
fingers.press(1, 'throttle');
assert.deepEqual(fingers.press(2, 'left'), { ...emptyControls(), throttle: true, left: true }, 'Two fingers can accelerate and steer simultaneously');
assert.deepEqual(fingers.release(2), { ...emptyControls(), throttle: true }, 'Lifting steering finger preserves acceleration');
fingers.press(3, 'throttle');
assert.equal(fingers.release(1).throttle, true, 'Two fingers on one button remain independent');
assert.deepEqual(fingers.release(3), emptyControls(), 'Lifting the last finger releases its control');
fingers.press(4, 'right'); fingers.press(5, 'brake'); fingers.press(6, 'reverse');
assert.deepEqual(fingers.release(5), { ...emptyControls(), right: true, reverse: true }, 'Cancelling one touch preserves other active controls');
assert.deepEqual(fingers.clear(), emptyControls(), 'Reset and backgrounding clear all active fingers');
assert.deepEqual(fingers.release(6), emptyControls(), 'Late touch-end after reset is harmless');
console.log('Multi-touch checks passed: simultaneous controls, independent release, cancellation, reset.');
function simulate(car, seconds, changes = {}, gearing = 'high') {
  let info;
  for (let i = 0; i < seconds * 60; i++) info = car.step(1 / 60, { ...emptyControls(), ...changes }, gearing);
  return info;
}
const car = createPhysics();
simulate(car, 3);
assert(car.chassis.position.y > 0.3 && car.chassis.position.y < 1, 'Suspension supports the chassis above ground');
assert.equal(car.vehicle.numWheelsOnGround, 4);
const start = car.chassis.position.clone();
const drive = simulate(car, 3, { throttle: true });
console.log('Forward:', drive, 'position:', car.chassis.position.toString());
assert(drive.speed > 20, 'Throttle accelerates the vehicle');
assert.equal(drive.reverse, false, 'Throttle drives towards the front of the jeep');
assert(car.chassis.position.distanceTo(start) > 10);
const rollingStart = car.chassis.position.clone();
const wheelAngles = car.vehicle.wheelInfos.map(wheel => wheel.rotation);
const coast = simulate(car, 1);
assert(coast.speed > 10 && car.chassis.position.distanceTo(rollingStart) > 3, 'Vehicle coasts after releasing throttle');
car.vehicle.wheelInfos.forEach((wheel, i) => {
  assert(Math.abs(wheel.rotation - wheelAngles[i]) > 1, 'Each wheel keeps rolling without throttle');
});
const brake = simulate(car, 2, { brake: true });
assert(brake.speed < 1, 'Brakes stop the vehicle');
const reverse = simulate(car, 3, { reverse: true });
assert(reverse.reverse && reverse.speed > 5, 'Reverse engages after braking');
car.reset(); simulate(car, 2);
const initialRotation = car.chassis.quaternion.clone();
simulate(car, 3, { throttle: true, left: true });
assert(Math.abs(car.chassis.quaternion.y - initialRotation.y) > 0.1, 'Steering changes heading');
assert(car.chassis.position.y > 0.2, 'Vehicle stays on its wheels while turning');
car.reset();
assert.equal(car.chassis.velocity.length(), 0);
assert.equal(car.chassis.angularVelocity.length(), 0);
assert.equal(car.chassis.position.x, 0);

const lowCar = createPhysics();
const highCar = createPhysics();
simulate(lowCar, 2); simulate(highCar, 2);
const lowLaunch = simulate(lowCar, 0.5, { throttle: true }, 'low');
const highLaunch = simulate(highCar, 0.5, { throttle: true }, 'high');
assert(lowLaunch.speed > highLaunch.speed, 'Low gearing accelerates harder from rest');
const lowSpeed = simulate(lowCar, 4, { throttle: true }, 'low');
const highSpeed = simulate(highCar, 4, { throttle: true }, 'high');
assert(lowSpeed.speed > 25 && lowSpeed.speed < 35, 'Low gearing limits forward speed to approximately 32 km/h');
assert(highSpeed.speed > lowSpeed.speed + 15, 'High gearing allows a higher cruising speed');
simulate(lowCar, 2, { brake: true }, 'low');
const lowReverse = simulate(lowCar, 3, { reverse: true }, 'low');
assert(lowReverse.reverse && lowReverse.speed > 10 && lowReverse.speed < 17, 'Low gearing also limits reverse speed');
// Changing range at speed cuts drive without snapping velocity or applying brakes.
const beforeShift = highCar.chassis.velocity.length();
highCar.step(1 / 60, { ...emptyControls(), throttle: true }, 'low');
assert(Math.abs(highCar.chassis.velocity.length() - beforeShift) < 0.5, 'Shifting to Low preserves momentum');
highCar.vehicle.wheelInfos.forEach(wheel => {
  assert.equal(wheel.engineForce, 0, 'Low cuts engine force while above its speed limit');
  assert.equal(wheel.brake, 0, 'Changing gearing does not apply the brakes');
});
const resumed = simulate(highCar, 0.5, { throttle: true }, 'high');
assert(resumed.speed > beforeShift * 3.6, 'Switching back to High restores acceleration');
console.log('Gearing checks passed: Low launch torque, forward/reverse limits, High speed, smooth range changes.');

const { Vec3, RaycastResult } = require('cannon-es');
const { terrainHeightAt } = loadGameModule('terrain');
const trailCar = createPhysics();
for (const [x, z] of [[-35, -28], [-35, -30], [-35.3, -55.7], [-34.6, -56.2], [-35, -72], [-35, -89], [-20.2, -85.8]]) {
  const hit = new RaycastResult();
  assert(trailCar.world.raycastClosest(new Vec3(x, 20, z), new Vec3(x, -2, z), {}, hit), 'Terrain has a collision surface');
  assert(Math.abs(hit.hitPointWorld.y - terrainHeightAt(x, z)) < 1e-6, `Rendered triangle heights match collision heights at ${x}, ${z}: collision=${hit.hitPointWorld.y}, mesh=${terrainHeightAt(x, z)}`);
  assert(hit.hitNormalWorld.y > 0, 'Terrain collision normals face upwards');
}
trailCar.startTrail(); simulate(trailCar, 2);
assert.equal(trailCar.vehicle.numWheelsOnGround, 4, 'Trail entrance is a safe spawn');
let climbedHeight = 0;
for (let tick = 0; tick < 5 * 60; tick++) {
  trailCar.step(1 / 60, { ...emptyControls(), throttle: true }, 'low');
  climbedHeight = Math.max(climbedHeight, trailCar.chassis.position.y);
  assert(Number.isFinite(trailCar.chassis.position.y), 'Off-road physics remains finite');
}
assert(climbedHeight > 4, 'The jeep can climb the first ramp in Low');
assert(trailCar.chassis.position.z < -25, 'The jeep advances through the ramp');
trailCar.reset(); assert.equal(trailCar.chassis.position.x, 0, 'Reset returns from the trail to the garage');
console.log('Terrain checks passed: mesh/collider agreement, safe spawn, Low ramp climb, reset.');

const orbit = loadGameModule('orbit-camera').createOrbitCamera();
const initialView = orbit.offset(13);
orbit.begin(1, 100, 100); orbit.move(2, 300, 300);
assert.deepEqual(orbit.offset(13), initialView, 'Another finger cannot move the camera');
orbit.move(1, 200, 150);
assert.notDeepEqual(orbit.offset(13), initialView, 'Dragging changes camera direction');
assert(Math.abs(Math.hypot(...Object.values(orbit.offset(13))) - 13) < 1e-8, 'Orbit keeps its distance from the jeep');
orbit.move(1, 200, 100000);
assert(orbit.offset(13).y < 13 && orbit.offset(13).y > 0, 'Vertical drag cannot flip the camera');
orbit.cancel(); const cancelledView = orbit.offset(13); orbit.move(1, 0, 0);
assert.deepEqual(orbit.offset(13), cancelledView, 'Cancellation stops the drag');
orbit.begin(3, 0, 0); orbit.end(3); orbit.move(3, 100, 100);
assert.deepEqual(orbit.offset(13), cancelledView, 'Releasing the finger stops the drag');
console.log('Camera checks passed: orbit drag, independent fingers, distance, pitch limits, cancel/release.');

const { vehicleList, groundClearance } = loadGameModule('vehicles');
const { createJeep } = loadGameModule('jeep');
const THREE = require('three');
const measuredVehicles = {};
for (const spec of vehicleList) {
  const testCar = createPhysics(spec.id);
  simulate(testCar, 3);
  assert.equal(testCar.vehicle.numWheelsOnGround, 4, `${spec.name}: suspension supports all four wheels`);
  const clearance = testCar.chassis.position.y - 0.18 * spec.heightScale;
  assert(Math.abs(clearance - groundClearance(spec)) < 0.06, `${spec.name}: garage clearance matches the settled physics`);
  const topSpeed = simulate(testCar, 6, { throttle: true }).speed;
  assert(Math.abs(topSpeed - spec.high.forwardLimit * 3.6) < 2, `${spec.name}: reaches its own High speed limit`);
  const stopped = simulate(testCar, 4, { brake: true });
  assert(stopped.speed < 1, `${spec.name}: softened brakes still stop the vehicle`);
  testCar.reset(); simulate(testCar, 2);
  const lowTopSpeed = simulate(testCar, 5, { throttle: true }, 'low').speed;
  assert(Math.abs(lowTopSpeed - spec.low.forwardLimit * 3.6) < 2, `${spec.name}: Low uses its own speed limit`);
  testCar.startTrail(); simulate(testCar, 2);
  assert.equal(testCar.vehicle.numWheelsOnGround, 4, `${spec.name}: safely spawns on the test trail`);
  for (let tick = 0; tick < 6 * 60; tick++) {
    testCar.step(1 / 60, { ...emptyControls(), throttle: true }, 'low');
    assert(Number.isFinite(testCar.chassis.position.y), `${spec.name}: terrain simulation remains finite`);
  }
  const model = createJeep(spec);
  assert.equal(model.wheels.length, testCar.vehicle.wheelInfos.length, `${spec.name}: model and physics have the same wheel count`);
  model.wheels.forEach(wheel => {
    const size = new THREE.Box3().setFromObject(wheel).getSize(new THREE.Vector3());
    assert(Math.abs(size.y - spec.wheelRadius * 2) < 1e-6, `${spec.name}: visual tyre radius matches suspension raycasts`);
  });
  measuredVehicles[spec.id] = { clearance, topSpeed };
}
assert(measuredVehicles.crawler.clearance > measuredVehicles.jeep.clearance + 0.2, 'Crawler has meaningfully more ground clearance');
assert(measuredVehicles.jeep.clearance > measuredVehicles.rally.clearance + 0.2, 'Rally sacrifices ground clearance');
assert(measuredVehicles.rally.topSpeed > measuredVehicles.jeep.topSpeed + 25, 'Rally is meaningfully faster');
assert(measuredVehicles.jeep.topSpeed > measuredVehicles.crawler.topSpeed + 20, 'Crawler sacrifices top speed');
console.log('Vehicle comparison:', measuredVehicles);
console.log('Vehicle checks passed: distinct clearance/speed, brakes, Low/High, trail spawns, visual wheel sizes.');

// Exercise real scene objects and vehicle swaps without requiring a GPU in CI.
let renderedScene;
class TestRenderer {
  constructor() { this.shadowMap = {}; }
  setSize() {}
  setClearColor() {}
  render(scene) { renderedScene = scene; }
  dispose() {}
}
const { createScene } = loadGameModule('scene', { three: { ...THREE, WebGLRenderer: TestRenderer } });
const testScene = createScene({ drawingBufferWidth: 800, drawingBufferHeight: 400, endFrameEXP() {} });
testScene.frame(1 / 60, emptyControls());
assert(renderedScene.children.some(object => object.name === 'Serra 4×4'), 'Scene starts with the default model');
let disposedModels = 0;
for (const id of ['crawler', 'rally', 'jeep', 'crawler']) {
  renderedScene.traverse(object => {
    if (object.name === 'Serra 4×4' || object.name === 'Rocha Crawler' || object.name === 'Vale Rally') {
      object.traverse(part => part.geometry?.addEventListener('dispose', () => { disposedModels++; }));
    }
  });
  const previousDisposals = disposedModels;
  testScene.setVehicle(id, 'trail');
  testScene.frame(1 / 60, emptyControls(), 'low');
  assert(disposedModels > previousDisposals, 'Switching vehicle releases the previous model geometry');
  assert.equal(renderedScene.children.filter(object => vehicleList.some(spec => object.name === spec.name)).length, 1, 'Only the selected vehicle remains in the scene');
  assert(renderedScene.children.some(object => object.name === vehicleList.find(spec => spec.id === id).name), 'Scene displays the selected vehicle');
}
assert.equal(testScene.toggleCamera(), 1); assert.equal(testScene.toggleCamera(), 2);
testScene.setVehicle('rally', 'garage');
assert.equal(testScene.toggleCamera(), 0, 'Vehicle changes preserve the active camera mode');
testScene.frame(1 / 60, emptyControls());
function networkPlayer(id, vehicleId, x, revision = 1) {
  const simulation = createPhysics(vehicleId);
  simulation.reset({ x, y: 2, z: 0, yaw: 0 });
  const value = {
    id, name: id, vehicleId, gearing: 'high', revision, speed: 0, reverse: false,
    body: { position: { ...simulation.chassis.position }, quaternion: { ...simulation.chassis.quaternion } },
    wheels: simulation.getWheelTransforms(false).map(wheel => ({ position: { ...wheel.position }, quaternion: { ...wheel.quaternion } })),
  };
  simulation.dispose(); return value;
}
testScene.setNetworkSnapshot({ version: 1, tick: 10, players: [networkPlayer('own', 'jeep', 0), networkPlayer('friend', 'crawler', 8)] }, 'own');
testScene.frame(1 / 60, emptyControls());
assert(renderedScene.children.some(object => object.name === 'Rocha Crawler' && object.position.x === 8), 'Remote vehicle renders from server snapshots');
testScene.setNetworkSnapshot({ version: 1, tick: 11, players: [networkPlayer('own', 'rally', -35, 2), networkPlayer('friend', 'crawler', 8)] }, 'own');
testScene.frame(1 / 60, emptyControls());
assert(renderedScene.children.some(object => object.name === 'Vale Rally' && object.position.x === -35), 'Vehicle changes and teleports do not interpolate through the map');
testScene.setNetworkSnapshot({ version: 1, tick: 12, players: [networkPlayer('own', 'rally', -35, 2)] }, 'own');
testScene.frame(1 / 60, emptyControls());
assert(!renderedScene.children.some(object => object.name === 'Rocha Crawler'), 'Remote vehicle is removed after leaving');
testScene.leaveNetwork('jeep'); testScene.frame(1 / 60, emptyControls());
assert.equal(renderedScene.children.filter(object => vehicleList.some(spec => object.name === spec.name)).length, 1, 'Leaving multiplayer restores one local vehicle');
testScene.dispose();
console.log('Scene checks passed: repeated vehicle swaps, geometry disposal, one active model, camera preservation.');

for (const fps of [30, 60, 120, 144]) {
  const rollingCar = createPhysics();
  simulate(rollingCar, 2);
  simulate(rollingCar, 2, { throttle: true });
  let animatedBetweenTicks = 0;
  let previous = rollingCar.getWheelTransforms().map(pose => pose.quaternion.clone());
  for (let frame = 0; frame < fps; frame++) {
    const tick = rollingCar.world.stepnumber;
    rollingCar.step(1 / fps, emptyControls());
    const contacts = rollingCar.vehicle.wheelInfos.map(wheel => wheel.isInContact);
    const poses = rollingCar.getWheelTransforms();
    poses.forEach((pose, i) => {
      const local = rollingCar.chassis.interpolatedQuaternion.conjugate().vmult(pose.position.vsub(rollingCar.chassis.interpolatedPosition));
      const connection = rollingCar.vehicle.wheelInfos[i].chassisConnectionPointLocal;
      assert(Math.abs(local.x - connection.x) < 1e-6 && Math.abs(local.z - connection.z) < 1e-6, `Wheel stays aligned with the interpolated chassis at ${fps} fps`);
      assert.equal(rollingCar.vehicle.wheelInfos[i].isInContact, contacts[i], 'Rendering preserves wheel contact state');
      const q = pose.quaternion;
      const old = previous[i];
      const dot = Math.abs(q.x * old.x + q.y * old.y + q.z * old.z + q.w * old.w);
      if (tick === rollingCar.world.stepnumber && dot < 1 - 1e-8) animatedBetweenTicks++;
      previous[i] = q.clone();
    });
  }
  if (fps > 60) assert(animatedBetweenTicks > 0, `Wheel spin is interpolated between physics ticks at ${fps} fps`);
  rollingCar.reset();
  rollingCar.getWheelTransforms().forEach(pose => {
    assert(pose.position.distanceTo(rollingCar.chassis.position) < 2, 'Reset clears old wheel positions');
  });
}
console.log('Physics checks passed: suspension, acceleration, coasting wheel spin, braking, reverse, steering, reset, wheel interpolation at 30/60/120/144 fps.');
