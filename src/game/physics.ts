import { Body, Box, ContactMaterial, Cylinder, GSSolver, Heightfield, Material, Plane, Quaternion, Vec3, World } from 'cannon-es';
import { terrainHeights, terrainHeightAt, trail, trailStart } from './terrain';
import { TerrainVehicle } from './terrain-vehicle';
import { vehicles, type VehicleId } from './vehicles';
import { fitWheelToTerrain } from './wheel-terrain';
import { createChassisShape } from './chassis-shape';
import { addRaceTrackCollisions, raceSpawn } from './race-track';
import { addChallengeCollisions } from './challenge-collisions';
import { challengeHeightAt } from './challenge-course';
import { economyRules, fuelRules } from './economy-config';
import { enableEconomyCourse, disableEconomyCourse, economyHeightAt } from './economy-course';
import type { StuntSample } from './stunts';
import { baseUpgrades, upgradedParameters, validateUpgrades, type UpgradeLevels } from './upgrades';

export type Controls = { left: boolean; right: boolean; throttle: boolean; reverse: boolean; brake: boolean; flipForward?: boolean; flipBackward?: boolean };
export const controlKeys: (keyof Controls)[] = ['left', 'right', 'throttle', 'reverse', 'brake', 'flipForward', 'flipBackward'];
export const emptyControls = (): Controls => ({ left: false, right: false, throttle: false, reverse: false, brake: false });

export type Gearing = 'low' | 'high';
type StateVector = { x: number; y: number; z: number };
export type VehiclePhysicsState = { position: StateVector; quaternion: StateVector & { w: number }; velocity: StateVector; angularVelocity: StateVector; steering: number; competitionFuel?: number; competitionUpgrades?: UpgradeLevels; wheels: { rotation: number; deltaRotation: number; suspensionLength: number; steering: number; isInContact?: boolean }[] };
const terrainMaterial = new Material('terrain');
const skidMaterial = new Material('chassis-skid');
const tyreStopMaterial = new Material('tyre-bump-stop');

function skiddingBody(a: Body, b: Body) {
  if (a.material === skidMaterial && b.material === terrainMaterial) return a;
  if (b.material === skidMaterial && a.material === terrainMaterial) return b;
}

class TerrainSolver extends GSSolver {
  private readonly contactCounts = new Map<Body, number>();

  override solve(dt: number, world: World) {
    this.contactCounts.clear();
    for (const equation of world.frictionEquations) {
      const body = skiddingBody(equation.bi, equation.bj);
      if (body) this.contactCounts.set(body, (this.contactCounts.get(body) ?? 0) + 1);
    }
    for (const equation of world.frictionEquations) {
      const body = skiddingBody(equation.bi, equation.bj);
      if (!body) continue;
      // Cannon 0.20 creates force limits but GSSolver clamps impulses. Convert
      // F to F*dt and share the weight across terrain patches (two tangents each),
      // so triangulation or a tile seam cannot multiply the scraping friction.
      const scale = dt * 2 / this.contactCounts.get(body)!;
      equation.minForce *= scale;
      equation.maxForce *= scale;
    }
    return super.solve(dt, world);
  }
}

export function createPhysicsWorld(includeChallenge = false) {
  const world = new World({ gravity: new Vec3(0, -9.81, 0), solver: new TerrainSolver() });
  world.defaultContactMaterial.friction = 0.65;
  // One friction constraint per contact patch, rather than multiplying drag by
  // the number of touching hull vertices.
  world.narrowphase.enableFrictionReduction = true;
  // Bodywork should scrape along the terrain. Rigid tyre bump stops must not
  // add a second, locked tyre friction force to the raycast vehicle's grip.
  world.addContactMaterial(new ContactMaterial(skidMaterial, terrainMaterial, { friction: 0.08, restitution: 0 }));
  world.addContactMaterial(new ContactMaterial(tyreStopMaterial, terrainMaterial, { friction: 0, restitution: 0 }));
  const ground = new Body({ mass: 0, material: terrainMaterial });
  const plane = new Plane(); plane.material = terrainMaterial;
  ground.addShape(plane);
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // Cannon's heightfield raycasts assume square tiles. Share edge samples so
  // suspension rays hit every section of the long course without gaps.
  for (let row = 0; row < trail.rows - 1; row += trail.columns - 1) {
    const terrain = new Body({ mass: 0, material: terrainMaterial });
    const tile = terrainHeights.map(column => column.slice(row, row + trail.columns));
    const heightfield = new Heightfield(tile, { elementSize: trail.cellSize });
    heightfield.material = terrainMaterial;
    terrain.addShape(heightfield);
    terrain.position.set(trail.x, 0, trail.z - row * trail.cellSize);
    terrain.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(terrain);
  }
  addRaceTrackCollisions(world, terrainMaterial);
  if (includeChallenge) addChallengeCollisions(world, terrainMaterial);
  return world;
}

export function createPhysics(vehicleId: VehicleId = 'jeep', sharedWorld?: World, includeChallenge = false) {
  const spec = vehicles[vehicleId];
  let competitionFuel: number | null = null;
  let competitionUpgrades = baseUpgrades();
  let tuning = upgradedParameters(vehicleId, competitionUpgrades);
  const fixedTimeStep = 1 / 60;
  const world = sharedWorld ?? createPhysicsWorld(includeChallenge);
  const chassis = new Body({ mass: spec.mass, material: skidMaterial, linearDamping: 0.15, angularDamping: 0.5 });
  chassis.addShape(createChassisShape(spec));
  chassis.addShape(new Box(new Vec3(0.72 * spec.widthScale, 0.45 * spec.heightScale, 0.9 * spec.lengthScale)), new Vec3(0, 0.75 * spec.heightScale, 0.4 * spec.lengthScale));
  const vehicle = new TerrainVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 }, spec.wheelWidth);
  const tyreShapeIndices: number[] = [];
  const axleRotation = new Quaternion(); axleRotation.setFromEuler(0, 0, Math.PI / 2);
  for (const [x, z] of [[-spec.track, -1.12], [spec.track, -1.12], [-spec.track, 1.15], [spec.track, 1.15]]) {
    vehicle.addWheel({
      radius: spec.wheelRadius, directionLocal: new Vec3(0, -1, 0), axleLocal: new Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new Vec3(x, 0, z * spec.lengthScale), suspensionStiffness: spec.suspensionStiffness,
      suspensionRestLength: spec.suspensionRest, frictionSlip: spec.grip, dampingRelaxation: 2.3,
      dampingCompression: 4.4, maxSuspensionForce: 16000, rollInfluence: spec.rollInfluence,
      maxSuspensionTravel: spec.suspensionTravel,
    });
    // A ray has no volume when the vehicle is on its side. Rigid tyres at full
    // compression support a rollover and act as suspension bump stops, while
    // leaving the spring free to move during ordinary driving.
    tyreShapeIndices.push(chassis.shapes.length);
    const tyreStop = new Cylinder(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 12);
    tyreStop.material = tyreStopMaterial;
    chassis.addShape(tyreStop,
      new Vec3(x, -Math.max(0, spec.suspensionRest - spec.suspensionTravel), z * spec.lengthScale), axleRotation);
  }
  vehicle.addToWorld(world);
  // Sample wheel motion at physics ticks, then render it on the same timeline
  // as the interpolated chassis. Keep spin as an unwrapped angle.
  const wheelStates = vehicle.wheelInfos.map(wheel => ({
    previousRotation: 0, rotation: 0,
    previousSuspension: wheel.suspensionRestLength, suspension: wheel.suspensionRestLength,
    previousSteering: 0, steering: 0,
    position: new Vec3(), quaternion: new Quaternion(),
  }));
  const recordWheels = () => {
    vehicle.wheelInfos.forEach((wheel, i) => {
      const state = wheelStates[i];
      state.previousRotation = state.rotation; state.rotation = wheel.rotation;
      state.previousSuspension = state.suspension; state.suspension = wheel.suspensionLength;
      state.previousSteering = state.steering; state.steering = wheel.steering;
    });
  };
  world.addEventListener('postStep', recordWheels);
  const localPosition = new Vec3();
  const upAxis = new Vec3(0, 1, 0);
  const steeringRotation = new Quaternion();
  const spinRotation = new Quaternion();
  function getWheelTransforms(interpolate = true) {
    const alpha = interpolate ? world.accumulator / fixedTimeStep : 1;
    const bodyRotation = interpolate ? chassis.interpolatedQuaternion : chassis.quaternion;
    const bodyPosition = interpolate ? chassis.interpolatedPosition : chassis.position;
    vehicle.wheelInfos.forEach((wheel, i) => {
      const state = wheelStates[i];
      const suspension = state.previousSuspension + (state.suspension - state.previousSuspension) * alpha;
      const spin = state.previousRotation + (state.rotation - state.previousRotation) * alpha;
      const steer = state.previousSteering + (state.steering - state.previousSteering) * alpha;
      wheel.directionLocal.scale(suspension, localPosition);
      localPosition.vadd(wheel.chassisConnectionPointLocal, localPosition);
      bodyRotation.vmult(localPosition, state.position);
      state.position.vadd(bodyPosition, state.position);
      steeringRotation.setFromAxisAngle(upAxis, steer);
      spinRotation.setFromAxisAngle(wheel.axleLocal, spin);
      bodyRotation.mult(steeringRotation, state.quaternion);
      state.quaternion.mult(spinRotation, state.quaternion);
      state.quaternion.normalize();
      fitWheelToTerrain(state.position, state.quaternion, bodyRotation, spec.wheelRadius, spec.wheelWidth, includeChallenge ? challengeHeightAt : competitionFuel !== null ? economyHeightAt : undefined);
    });
    return wheelStates;
  }
  let steering = 0;
  function reset(spawn = { x: 0, y: 1.2, z: 0, yaw: -0.35 }) {
    chassis.position.set(spawn.x, Math.max(spawn.y, spec.wheelRadius + spec.suspensionRest + 0.3), spawn.z); chassis.quaternion.setFromEuler(0, spawn.yaw, 0);
    chassis.velocity.setZero(); chassis.angularVelocity.setZero(); chassis.force.setZero(); chassis.torque.setZero();
    chassis.previousPosition.copy(chassis.position); chassis.interpolatedPosition.copy(chassis.position);
    chassis.previousQuaternion.copy(chassis.quaternion); chassis.interpolatedQuaternion.copy(chassis.quaternion);
    chassis.aabbNeedsUpdate = true; steering = 0;
    if (!sharedWorld) world.accumulator = 0;
    vehicle.wheelInfos.forEach((wheel, i) => {
      wheel.rotation = 0; wheel.deltaRotation = 0;
      wheel.suspensionLength = wheel.suspensionRestLength;
      const state = wheelStates[i];
      state.previousRotation = state.rotation = 0;
      state.previousSuspension = state.suspension = wheel.suspensionRestLength;
      state.previousSteering = state.steering = 0;
      vehicle.setSteeringValue(0, i); vehicle.setBrake(0, i); vehicle.applyEngineForce(0, i);
      chassis.shapeOrientations[tyreShapeIndices[i]].copy(axleRotation);
    });
    chassis.wakeUp();
  }
  reset();
  const forward = new Vec3();
  const airTorque = new Vec3(); const localAngular = new Vec3();
  function bodyContact() { return world.contacts.some(c => c.bi === chassis || c.bj === chassis); }
  const aeroUp = new Vec3(); const aeroForce = new Vec3();
  const applyAerodynamics = () => {
    if (!spec.downforceCoefficient || !vehicle.wheelInfos.some(wheel => wheel.isInContact)) return;
    chassis.quaternion.vmult(upAxis, aeroUp);
    if (aeroUp.y < 0.5) return;
    chassis.quaternion.vmult(new Vec3(0, 0, -1), forward);
    const speed = Math.abs(chassis.velocity.dot(forward));
    aeroUp.scale(-Math.min(spec.mass * 9.81 * 0.65, speed * speed * spec.downforceCoefficient), aeroForce);
    chassis.applyForce(aeroForce);
  };
  // Apply once per physics tick in solo and shared server worlds, independently
  // of the render frame rate. Airborne or overturned cars receive no downforce.
  if (spec.downforceCoefficient) world.addEventListener('preStep', applyAerodynamics);
  function applyControls(dt: number, input: Controls, gearing: Gearing = 'high') {
    const range = spec[gearing];
    chassis.quaternion.vmult(new Vec3(0, 0, -1), forward);
    const signedSpeed = chassis.velocity.dot(forward);
    const target = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * spec.steering / (1 + chassis.velocity.length() * 0.035);
    steering += (target - steering) * Math.min(1, dt * 8);
    vehicle.setSteeringValue(steering, 0); vehicle.setSteeringValue(steering, 1);
    steeringRotation.setFromAxisAngle(upAxis, steering);
    for (let i = 0; i < 2; i++) steeringRotation.mult(axleRotation, chassis.shapeOrientations[tyreShapeIndices[i]]);
    chassis.aabbNeedsUpdate = true;
    let drive = (input.throttle ? 1 : 0) - (input.reverse ? 1 : 0);
    if (input.brake) drive = signedSpeed > 0.8 ? 0 : -1;
    const braking = input.brake && signedSpeed > 0.8;
    const opposing = !input.brake && drive !== 0 && signedSpeed * drive < -0.6;
    const limited = drive > 0 ? signedSpeed > range.forwardLimit : signedSpeed < -range.reverseLimit;
    let fuelScale = 1;
    if (competitionFuel !== null) {
      const use = drive && !input.brake ? fuelRules[vehicleId].litresPerSecond * dt : 0;
      fuelScale = competitionFuel <= 0 ? 0 : use > 0 ? Math.min(1, competitionFuel / use) : 1;
      competitionFuel = Math.max(0, competitionFuel - use);
    }
    if (chassis.position.y - terrainHeightAt(chassis.position.x, chassis.position.z) > 2.5 && !vehicle.wheelInfos.some(w => w.isInContact) && !bodyContact()) {
      chassis.vectorToLocalFrame(chassis.angularVelocity, localAngular);
      const pitch = (input.flipBackward ? 1 : 0) - (input.flipForward ? 1 : 0)
        + (input.brake ? 0.15 : 0) - (input.throttle ? 0.15 : 0);
      if (pitch) {
        const acceleration = Math.max(-tuning.airAcceleration, Math.min(tuning.airAcceleration, (pitch * economyRules.maxAirPitchSpeed - localAngular.x) / dt));
        chassis.quaternion.vmult(new Vec3(chassis.inertia.x * acceleration, 0, 0), airTorque); chassis.applyTorque(airTorque);
      }
    }
    for (let i = 0; i < 4; i++) {
      const engineForce = competitionFuel !== null ? gearing === 'low' ? tuning.lowForce : tuning.highForce : range.engineForce;
      vehicle.applyEngineForce(braking || opposing || limited ? 0 : drive * engineForce * fuelScale, i);
      vehicle.setBrake((braking ? (spec.brakeForce ?? 25) : opposing ? 35 : 0) * spec.mass / 700, i);
    }
  }
  function getTelemetry() {
    chassis.quaternion.vmult(new Vec3(0, 0, -1), forward);
    return { speed: chassis.velocity.length() * 3.6, reverse: chassis.velocity.dot(forward) < -0.3 };
  }
  function step(dt: number, input: Controls, gearing: Gearing = 'high') {
    applyControls(dt, input, gearing);
    world.step(fixedTimeStep, Math.min(dt, 0.05), 4);
    // Cannon's small-angle interpolation can leave a slightly non-unit rotation.
    chassis.interpolatedQuaternion.normalize();
    if (chassis.position.y < -10 || Math.abs(chassis.position.x) > 240 || Math.abs(chassis.position.z) > 240) reset();
    return getTelemetry();
  }
  return {
    world, chassis, vehicle, step, reset, getWheelTransforms, applyControls, getTelemetry,
    beginCompetitionEconomy(levels: UpgradeLevels = baseUpgrades()) { competitionUpgrades = validateUpgrades(levels); tuning = upgradedParameters(vehicleId, competitionUpgrades); competitionFuel = tuning.capacity; enableEconomyCourse(world, terrainMaterial); },
    endCompetitionEconomy() { competitionFuel = null; competitionUpgrades = baseUpgrades(); tuning = upgradedParameters(vehicleId, competitionUpgrades); if (!sharedWorld) disableEconomyCourse(world); },
    getFuel() { return { fuel: competitionFuel ?? 0, capacity: competitionFuel !== null ? tuning.capacity : fuelRules[vehicleId].capacity, enabled: competitionFuel !== null }; },
    addFuel(amount: number) { if (competitionFuel !== null && Number.isFinite(amount) && amount > 0) competitionFuel = Math.min(tuning.capacity, competitionFuel + amount); },
    getStuntSample(): StuntSample {
      const contacts = world.contacts.filter(c => c.bi === chassis || c.bj === chassis);
      return { position: { ...chassis.position }, quaternion: { ...chassis.quaternion }, velocity: { ...chassis.velocity }, angularSpeed: chassis.angularVelocity.length(),
        wheels: vehicle.wheelInfos.filter(w => w.isInContact).length, bodyContact: contacts.length > 0,
        impact: contacts.reduce((peak, c) => Math.max(peak, Math.abs(c.getImpactVelocityAlongNormal())), 0),
        clearance: chassis.position.y - (competitionFuel !== null ? economyHeightAt(chassis.position.x, chassis.position.z) : 0) - spec.wheelRadius - spec.suspensionRest };
    },
    getState(): VehiclePhysicsState {
      return { position: { ...chassis.position }, quaternion: { ...chassis.quaternion }, velocity: { ...chassis.velocity }, angularVelocity: { ...chassis.angularVelocity }, steering,
        ...(competitionFuel !== null ? { competitionFuel, competitionUpgrades: { ...competitionUpgrades } } : {}),
        wheels: vehicle.wheelInfos.map(w => ({ rotation: w.rotation, deltaRotation: w.deltaRotation, suspensionLength: w.suspensionLength, steering: w.steering, isInContact: w.isInContact })) };
    },
    restoreState(state: VehiclePhysicsState) {
      competitionUpgrades = state.competitionFuel !== undefined ? validateUpgrades(state.competitionUpgrades ?? baseUpgrades()) : baseUpgrades(); tuning = upgradedParameters(vehicleId, competitionUpgrades);
      if (state.competitionFuel !== undefined) { competitionFuel = Math.max(0, Math.min(tuning.capacity, state.competitionFuel)); enableEconomyCourse(world, terrainMaterial); }
      else { competitionFuel = null; if (!sharedWorld) disableEconomyCourse(world); }
      chassis.position.set(state.position.x, state.position.y, state.position.z);
      chassis.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w); chassis.quaternion.normalize();
      chassis.velocity.set(state.velocity.x, state.velocity.y, state.velocity.z);
      chassis.angularVelocity.set(state.angularVelocity.x, state.angularVelocity.y, state.angularVelocity.z);
      chassis.force.setZero(); chassis.torque.setZero(); chassis.aabbNeedsUpdate = true;
      chassis.previousPosition.copy(chassis.position); chassis.interpolatedPosition.copy(chassis.position);
      chassis.previousQuaternion.copy(chassis.quaternion); chassis.interpolatedQuaternion.copy(chassis.quaternion);
      steering = state.steering;
      vehicle.wheelInfos.forEach((wheel, i) => {
        const s = state.wheels[i]; if (!s) return;
        wheel.rotation = s.rotation; wheel.deltaRotation = s.deltaRotation; wheel.suspensionLength = s.suspensionLength; wheel.isInContact = s.isInContact ?? false;
        wheelStates[i].previousRotation = wheelStates[i].rotation = s.rotation;
        wheelStates[i].previousSuspension = wheelStates[i].suspension = s.suspensionLength;
        wheelStates[i].previousSteering = wheelStates[i].steering = s.steering;
        vehicle.setSteeringValue(s.steering, i);
        if (i < 2) { steeringRotation.setFromAxisAngle(upAxis, s.steering); steeringRotation.mult(axleRotation, chassis.shapeOrientations[tyreShapeIndices[i]]); }
      });
      if (!sharedWorld) world.accumulator = 0;
      chassis.wakeUp();
    },
    startTrail() { reset(trailStart); },
    startRace(slot = 0) { reset(raceSpawn(slot)); },
    dispose() { world.removeEventListener('postStep', recordWheels); world.removeEventListener('preStep', applyAerodynamics); vehicle.removeFromWorld(world); },
  };
}
