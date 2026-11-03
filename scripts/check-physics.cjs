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
  const clearance = testCar.chassis.position.y - (spec.bellyDepth ?? 0.18) * spec.heightScale;
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
assert(measuredVehicles.gt3.topSpeed > measuredVehicles.rally.topSpeed + 40, 'GT3 has a distinct circuit top speed');
assert(measuredVehicles.gt3.clearance < measuredVehicles.rally.clearance - 0.1, 'GT3 trades ground clearance for its circuit setup');
console.log('Vehicle comparison:', measuredVehicles);
console.log('Vehicle checks passed: distinct clearance/speed, brakes, Low/High, trail spawns, visual wheel sizes.');

let gt3Reference;
for (const fps of [30, 60, 120, 144]) {
  const gt3 = createPhysics('gt3'); simulate(gt3, 3);
  const restingHeight = gt3.chassis.position.y;
  const endTick = gt3.world.stepnumber + 180;
  while (gt3.world.stepnumber < endTick) gt3.step(1 / fps, { ...emptyControls(), throttle: true });
  assert(gt3.chassis.position.y < restingHeight - 0.004, 'GT3 downforce loads the suspension as speed increases');
  if (!gt3Reference) gt3Reference = { position: gt3.chassis.position.clone(), velocity: gt3.chassis.velocity.clone() };
  else {
    assert(gt3.chassis.position.distanceTo(gt3Reference.position) < 0.01, `GT3 aerodynamics stay consistent at ${fps} fps`);
    assert(gt3.chassis.velocity.distanceTo(gt3Reference.velocity) < 0.01, `GT3 acceleration stays consistent at ${fps} fps`);
  }
  const oldBody = gt3.chassis; gt3.dispose(); gt3.world.step(1 / 60);
  assert.equal(oldBody.force.length(), 0, 'Removing the GT3 also removes its aerodynamic force callback');
}
const airborneGT3 = createPhysics('gt3'); const airborneJeep = createPhysics();
for (const airborne of [airborneGT3, airborneJeep]) {
  airborne.reset({ x: 0, y: 10, z: 0, yaw: 0 }); airborne.chassis.velocity.set(0, 0, -30);
  simulate(airborne, 1);
}
assert(Math.abs(airborneGT3.chassis.velocity.y - airborneJeep.chassis.velocity.y) < 1e-6, 'Airborne GT3 falls under gravity without artificial downforce');
airborneGT3.dispose(); airborneJeep.dispose();
console.log('GT3 checks passed: circuit speed/clearance tradeoff, grounded downforce, frame-rate consistency, airborne behaviour, callback cleanup.');

// Check the physical contact independently of the visual terrain correction.
// On a bank the uphill shoulder touches before the centre of a finite tyre.
const { Body, Box, Plane, Quaternion, World } = require('cannon-es');
for (const spec of vehicleList) {
  // Isolate production collision shapes from the suspension: a sliding belly
  // loses speed gradually, while a tyre bump stop adds no locked-wheel drag.
  const donor = createPhysics(spec.id);
  const { world, chassis } = donor;
  const hull = chassis.shapes[0]; const tyre = chassis.shapes[2];
  const tyreOrientation = chassis.shapeOrientations[2].clone();
  donor.dispose();
  const sled = new Body({ mass: spec.mass, material: chassis.material, fixedRotation: true, linearDamping: 0 });
  sled.addShape(hull);
  sled.position.set(0, (spec.bellyDepth ?? 0.18) * spec.heightScale + 0.005, 0); sled.velocity.set(0, 0, -4);
  world.addBody(sled);
  const tyreSled = new Body({ mass: spec.mass, material: chassis.material, fixedRotation: true, linearDamping: 0 });
  tyreSled.addShape(tyre, new Vec3(), tyreOrientation);
  tyreSled.position.set(10, spec.wheelRadius + 0.005, 0); tyreSled.velocity.set(0, 0, -4);
  world.addBody(tyreSled);
  const terrainSled = new Body({ mass: spec.mass, material: chassis.material, fixedRotation: true, linearDamping: 0 });
  terrainSled.addShape(loadGameModule('chassis-shape').createChassisShape(spec));
  terrainSled.position.set(-35, (spec.bellyDepth ?? 0.18) * spec.heightScale + 0.005, 5); terrainSled.velocity.set(0, 0, -4);
  world.addBody(terrainSled);
  for (let tick = 0; tick < 60; tick++) world.step(1 / 60);
  assert(-sled.velocity.z > 2.8 && sled.position.z < -3.2, `${spec.name}: belly scrapes without stopping abruptly (velocity ${sled.velocity.toString()}, position ${sled.position.toString()}, friction ${world.frictionEquations.map(eq => eq.maxForce)})`);
  assert(Math.abs(sled.velocity.y) < 0.1, `${spec.name}: scraping bodywork does not bounce off the terrain`);
  assert(-tyreSled.velocity.z > 3.9, `${spec.name}: rigid tyre stops support the car without duplicating tyre friction`);
  assert(Math.abs(terrainSled.velocity.z - sled.velocity.z) < 0.1, `${spec.name}: terrain triangles do not multiply scraping friction`);

  const trailScrape = createPhysics(spec.id);
  trailScrape.reset({ x: -35, y: 1.5, z: -43, yaw: 0 });
  simulate(trailScrape, 2); simulate(trailScrape, 8, { throttle: true }, 'low');
  assert(trailScrape.chassis.position.z < -75, `${spec.name}: progresses through the bump section while scraping`);
  trailScrape.dispose();

  const wallCar = createPhysics(spec.id);
  wallCar.reset({ x: 0, y: 1.5, z: 0, yaw: 0 });
  const wall = new Body({ mass: 0, material: wallCar.world.bodies[0].material });
  const wallShape = new Box(new Vec3(4, 2, 0.2)); wallShape.material = wall.material;
  wall.addShape(wallShape); wall.position.set(0, 2, -6); wallCar.world.addBody(wall);
  simulate(wallCar, 2);
  let hitWall = false;
  for (let tick = 0; tick < 180; tick++) {
    wallCar.step(1 / 60, { ...emptyControls(), throttle: true }, 'low');
    hitWall ||= wallCar.world.contacts.some(contact => (contact.bi === wall && contact.bj === wallCar.chassis) || (contact.bj === wall && contact.bi === wallCar.chassis));
    assert(wallCar.chassis.position.z > wall.position.z + wallShape.halfExtents.z - 0.05, `${spec.name}: a direct impact remains blocked by a solid wall`);
  }
  assert(hitWall, `${spec.name}: solid frontal collision is exercised`);
  wallCar.dispose();
}
console.log('Bumper checks passed: gradual scraping, no extra tyre-stop drag, bump traversal, solid frontal collisions for all vehicles.');
for (const spec of vehicleList) {
  for (const bank of [-0.35, 0.35]) for (const steering of [0, 0.3]) {
    const world = new World({ gravity: new Vec3(0, -9.81, 0) });
    const ground = new Body({ mass: 0 }); ground.addShape(new Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    const bankRotation = new Quaternion(); bankRotation.setFromEuler(0, 0, bank);
    bankRotation.mult(ground.quaternion, ground.quaternion); world.addBody(ground);
    const bankCar = createPhysics(spec.id, world);
    const wheel = bankCar.vehicle.wheelInfos[0];
    const normal = new Vec3(-Math.sin(bank), Math.cos(bank), 0);
    const axle = new Vec3(-Math.cos(steering), 0, Math.sin(steering));
    const axleDot = normal.dot(axle);
    const support = spec.wheelRadius * Math.sqrt(1 - axleDot * axleDot) + spec.wheelWidth / 2 * Math.abs(axleDot);
    const expectedLength = spec.suspensionRest * 0.65;
    bankCar.reset({ x: 0, y: 2, z: 0, yaw: 0 });
    bankCar.chassis.position.y = Math.tan(bank) * wheel.chassisConnectionPointLocal.x + support / normal.y + expectedLength;
    bankCar.vehicle.setSteeringValue(steering, 0);
    bankCar.vehicle.castRay(wheel);
    assert(wheel.isInContact, `${spec.name}: tilted tyre maintains contact with the bank`);
    assert(Math.abs(wheel.suspensionLength - expectedLength) < 0.012, `${spec.name}: suspension accounts for tyre width and steering on both sides of a bank`);
    assert.equal(bankCar.chassis.collisionResponse, true, 'Contact queries restore chassis collisions');
    bankCar.dispose();
  }
}
function lowestTyreClearance(poses, spec) {
  let lowest = Infinity;
  for (const pose of poses) for (const across of [-0.5, 0, 0.5]) for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI / 24;
    const point = pose.quaternion.vmult(new Vec3(across * spec.wheelWidth, spec.wheelRadius * Math.cos(angle), spec.wheelRadius * Math.sin(angle))).vadd(pose.position);
    lowest = Math.min(lowest, point.y - terrainHeightAt(point.x, point.z));
  }
  return lowest;
}
for (const spec of vehicleList) for (const fps of [30, 60, 144]) {
  for (const [x, z] of [[-22, -86], [-35, -56]]) {
    const tiltedCar = createPhysics(spec.id);
    tiltedCar.reset({ x, z, y: terrainHeightAt(x, z) + 2, yaw: Math.PI / 2 });
    for (let frame = 0; frame < fps * 3; frame++) {
      tiltedCar.step(1 / fps, { ...emptyControls(), brake: true });
      const displayedClearance = lowestTyreClearance(tiltedCar.getWheelTransforms(), spec);
      assert(displayedClearance > -0.02, `${spec.name}: interpolated tyres stay above banks and crests at ${fps} fps (frame ${frame}, ${x}, ${z}, clearance ${displayedClearance})`);
      assert(lowestTyreClearance(tiltedCar.getWheelTransforms(false), spec) > -0.02, `${spec.name}: server wheel poses stay above banks and crests`);
    }
    tiltedCar.dispose();
  }
}
for (const spec of vehicleList) for (const roll of [-Math.PI / 2, Math.PI / 2]) {
  for (const left of [false, true]) {
    const rolledCar = createPhysics(spec.id);
    rolledCar.reset({ x: 0, y: 2, z: 0, yaw: 0 });
    rolledCar.chassis.quaternion.setFromEuler(0, 0, roll);
    simulate(rolledCar, 3, { brake: true, left });
    for (let tick = 0; tick < 60; tick++) {
      rolledCar.step(1 / 60, { ...emptyControls(), brake: true, left });
      assert(lowestTyreClearance(rolledCar.getWheelTransforms(false), spec) > -0.025, `${spec.name}: tyre colliders support the vehicle on either side, including with steering`);
    }
    rolledCar.dispose();
  }
}
console.log('Uneven terrain checks passed: physical tyre width, bank contact with steering, crests, rollover tyre collisions, local/server poses at 30/60/144 fps.');

const { raceSamples, raceBarriers, raceSpawn, raceLength, raceTrack } = loadGameModule('race-track');
assert(raceLength > 350 && raceLength < 500, 'Circuit has a full-length closed lap');
for (let i = 0; i < raceSamples.length; i++) {
  const point = raceSamples[i]; const next = raceSamples[(i + 1) % raceSamples.length];
  assert(Math.hypot(next.x - point.x, next.z - point.z) < 4, 'Road joins continuously, including the closing segment');
  const angle = Math.acos(Math.max(-1, Math.min(1, point.dx * next.dx + point.dz * next.dz)));
  const radius = angle < 1e-6 ? Infinity : Math.hypot(next.x - point.x, next.z - point.z) / angle;
  assert(radius > raceTrack.barrierOffset + 1, 'Tight curves leave room for both road edges and barriers');
}
for (const spec of vehicleList) {
  const racer = createPhysics(spec.id); racer.startRace(); simulate(racer, 2);
  assert.equal(racer.vehicle.numWheelsOnGround, 4, `${spec.name}: circuit grid supports all wheels`);
  for (const rail of raceBarriers.filter((_, i) => i % 30 === 0)) {
    const hit = new RaycastResult();
    assert(racer.world.raycastClosest(new Vec3(rail.x, 5, rail.z), new Vec3(rail.x, -1, rail.z), {}, hit));
    assert(Math.abs(hit.hitPointWorld.y - rail.height) < 1e-5, 'Rendered barriers have matching physical collision heights');
  }
  // Follow the actual road with normal steering/throttle commands. This catches
  // gaps, pinched curves and collisions intruding into the racing surface.
  let previous = 0; let progress = 0; let maximumError = 0; let barrierContacts = 0;
  for (let tick = 0; tick < 60 * 80 && progress < raceSamples.length; tick++) {
    let nearest = 0; let distance = Infinity;
    raceSamples.forEach((point, i) => {
      const error = Math.hypot(point.x - racer.chassis.position.x, point.z - racer.chassis.position.z);
      if (error < distance) { nearest = i; distance = error; }
    });
    const advance = (nearest - previous + raceSamples.length) % raceSamples.length;
    if (advance < 10) progress += advance;
    previous = nearest; maximumError = Math.max(maximumError, distance);
    const target = raceSamples[(nearest + 4) % raceSamples.length];
    const local = racer.chassis.quaternion.conjugate().vmult(new Vec3(target.x - racer.chassis.position.x, 0, target.z - racer.chassis.position.z));
    const steeringError = Math.atan2(local.x, -local.z); const speed = racer.chassis.velocity.length();
    racer.step(1 / 60, { ...emptyControls(), left: steeringError < -0.04, right: steeringError > 0.04, throttle: speed < 7, brake: speed > 8 });
    if (racer.world.contacts.some(contact => contact.bi === racer.chassis || contact.bj === racer.chassis)) barrierContacts++;
  }
  assert(progress >= raceSamples.length, `${spec.name}: completes a full circuit lap under normal vehicle physics`);
  assert(maximumError < 4 && barrierContacts === 0, `${spec.name}: the full lap stays on the road without striking barriers`);
  racer.dispose();
}
for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
  const first = raceSpawn(a); const second = raceSpawn(b);
  assert(Math.hypot(first.x - second.x, first.z - second.z) > 5, 'Four-player grid spaces vehicles safely apart');
}
console.log(`Race circuit checks passed: ${Math.round(raceLength)} m lap, barrier geometry, four grid slots, full clean laps with all ${vehicleList.length} vehicles.`);

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
assert(renderedScene.children.some(object => object.name === 'Circuito da Serra'), 'Scene includes the circuit geometry');
testScene.startRace(); testScene.frame(1 / 60, emptyControls());
assert(renderedScene.children.some(object => object.name === 'Serra 4×4' && object.position.x > 60), 'Circuit action moves the current model to the grid');
let disposedModels = 0;
for (const id of ['crawler', 'rally', 'gt3', 'jeep', 'gt3', 'crawler']) {
  renderedScene.traverse(object => {
    if (vehicleList.some(spec => object.name === spec.name)) {
      object.traverse(part => part.geometry?.addEventListener('dispose', () => { disposedModels++; }));
    }
  });
  const previousDisposals = disposedModels;
  testScene.setVehicle(id, id === 'rally' || id === 'gt3' ? 'race' : 'trail');
  testScene.frame(1 / 60, emptyControls(), 'low');
  assert(disposedModels > previousDisposals, 'Switching vehicle releases the previous model geometry');
  assert.equal(renderedScene.children.filter(object => vehicleList.some(spec => object.name === spec.name)).length, 1, 'Only the selected vehicle remains in the scene');
  assert(renderedScene.children.some(object => object.name === vehicleList.find(spec => spec.id === id).name), 'Scene displays the selected vehicle');
  if (id === 'rally') assert(renderedScene.children.some(object => object.name === 'Vale Rally' && object.position.x > 60), 'Garage vehicle changes can enter the racing circuit');
  if (id === 'gt3') assert(renderedScene.children.some(object => object.name === 'Serra GT3' && object.position.x > 60), 'GT3 renders at the circuit after a vehicle change');
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
testScene.setNetworkSnapshot({ version: 1, tick: 11, players: [networkPlayer('own', 'gt3', -35, 2), networkPlayer('friend', 'crawler', 8)] }, 'own');
testScene.frame(1 / 60, emptyControls());
assert(renderedScene.children.some(object => object.name === 'Serra GT3' && object.position.x === -35), 'GT3 changes and teleports do not interpolate through the map');
testScene.setNetworkSnapshot({ version: 1, tick: 12, players: [networkPlayer('own', 'gt3', -35, 2)] }, 'own');
testScene.frame(1 / 60, emptyControls());
assert(!renderedScene.children.some(object => object.name === 'Rocha Crawler'), 'Remote vehicle is removed after leaving');
// Contacts on opposite sides of a crest interpolate below its peak.
testScene.leaveNetwork('jeep');
const realNow = Date.now;
let networkTime = 1000;
Date.now = () => networkTime;
try {
  for (const z of [-88.5, -89.5]) {
    const player = networkPlayer('own', 'jeep', -35, 5);
    player.body.position = { x: -35, y: 8, z };
    player.wheels.forEach(wheel => {
      wheel.position = { x: -35, y: terrainHeightAt(-35, z) + vehicleList[0].wheelRadius + 0.008, z };
      wheel.quaternion = { x: 0, y: 0, z: 0, w: 1 };
    });
    testScene.setNetworkSnapshot({ version: 1, tick: networkTime, players: [player] }, 'own');
    networkTime += 100;
  }
  networkTime = 1130; // Render time is 80 ms earlier: halfway between snapshots.
  testScene.frame(1 / 60, emptyControls());
  const model = renderedScene.children.find(object => object.name === vehicleList[0].name);
  assert(Math.abs(model.position.z + 89) < 1e-6, 'Online regression test renders the middle of the crest');
  const wheels = renderedScene.children.filter(object => object.children[0]?.geometry?.type === 'CylinderGeometry');
  assert.equal(wheels.length, 4, 'Online regression test inspects all displayed tyres');
  const poses = wheels.map(wheel => ({ position: wheel.position, quaternion: new Quaternion(wheel.quaternion.x, wheel.quaternion.y, wheel.quaternion.z, wheel.quaternion.w) }));
  assert(lowestTyreClearance(poses, vehicleList[0]) > -0.02, 'Online interpolation keeps tyres above the crest');
} finally {
  Date.now = realNow;
}
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
