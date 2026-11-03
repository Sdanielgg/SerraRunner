import { Body, Box, Heightfield, Plane, Quaternion, RaycastVehicle, Vec3, World } from 'cannon-es';
import { terrainHeights, trail, trailStart } from './terrain';

export type Controls = { left: boolean; right: boolean; throttle: boolean; reverse: boolean; brake: boolean };
export const emptyControls = (): Controls => ({ left: false, right: false, throttle: false, reverse: false, brake: false });

export type Gearing = 'low' | 'high';
const gearRanges = {
  low: { engineForce: 3000, forwardLimit: 9, reverseLimit: 4 },
  high: { engineForce: 1850, forwardLimit: 23, reverseLimit: 8 },
};

export function createPhysics() {
  const fixedTimeStep = 1 / 60;
  const world = new World({ gravity: new Vec3(0, -9.81, 0) });
  world.defaultContactMaterial.friction = 0.65;
  const ground = new Body({ mass: 0 });
  ground.addShape(new Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  // Cannon's heightfield raycasts assume square tiles. Share edge samples so
  // suspension rays hit every section of the long course without gaps.
  for (let row = 0; row < trail.rows - 1; row += trail.columns - 1) {
    const terrain = new Body({ mass: 0 });
    const tile = terrainHeights.map(column => column.slice(row, row + trail.columns));
    terrain.addShape(new Heightfield(tile, { elementSize: trail.cellSize }));
    terrain.position.set(trail.x, 0, trail.z - row * trail.cellSize);
    terrain.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(terrain);
  }
  const chassis = new Body({ mass: 700, linearDamping: 0.15, angularDamping: 0.5 });
  chassis.addShape(new Box(new Vec3(0.86, 0.3, 1.65)), new Vec3(0, 0.12, 0));
  chassis.addShape(new Box(new Vec3(0.72, 0.45, 0.9)), new Vec3(0, 0.75, 0.4));
  const vehicle = new RaycastVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  for (const [x, z] of [[-0.96, -1.12], [0.96, -1.12], [-0.96, 1.15], [0.96, 1.15]]) {
    vehicle.addWheel({
      radius: 0.46, directionLocal: new Vec3(0, -1, 0), axleLocal: new Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new Vec3(x, 0, z), suspensionStiffness: 30,
      suspensionRestLength: 0.34, frictionSlip: 3.8, dampingRelaxation: 2.3,
      dampingCompression: 4.4, maxSuspensionForce: 16000, rollInfluence: 0.08,
      maxSuspensionTravel: 0.23,
    });
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
  world.addEventListener('postStep', () => {
    vehicle.wheelInfos.forEach((wheel, i) => {
      const state = wheelStates[i];
      state.previousRotation = state.rotation; state.rotation = wheel.rotation;
      state.previousSuspension = state.suspension; state.suspension = wheel.suspensionLength;
      state.previousSteering = state.steering; state.steering = wheel.steering;
    });
  });
  const localPosition = new Vec3();
  const upAxis = new Vec3(0, 1, 0);
  const steeringRotation = new Quaternion();
  const spinRotation = new Quaternion();
  function getWheelTransforms() {
    const alpha = world.accumulator / fixedTimeStep;
    vehicle.wheelInfos.forEach((wheel, i) => {
      const state = wheelStates[i];
      const suspension = state.previousSuspension + (state.suspension - state.previousSuspension) * alpha;
      const spin = state.previousRotation + (state.rotation - state.previousRotation) * alpha;
      const steer = state.previousSteering + (state.steering - state.previousSteering) * alpha;
      wheel.directionLocal.scale(suspension, localPosition);
      localPosition.vadd(wheel.chassisConnectionPointLocal, localPosition);
      chassis.interpolatedQuaternion.vmult(localPosition, state.position);
      state.position.vadd(chassis.interpolatedPosition, state.position);
      steeringRotation.setFromAxisAngle(upAxis, steer);
      spinRotation.setFromAxisAngle(wheel.axleLocal, spin);
      chassis.interpolatedQuaternion.mult(steeringRotation, state.quaternion);
      state.quaternion.mult(spinRotation, state.quaternion);
      state.quaternion.normalize();
    });
    return wheelStates;
  }
  let steering = 0;
  function reset(spawn = { x: 0, y: 1.2, z: 0, yaw: -0.35 }) {
    chassis.position.set(spawn.x, spawn.y, spawn.z); chassis.quaternion.setFromEuler(0, spawn.yaw, 0);
    chassis.velocity.setZero(); chassis.angularVelocity.setZero(); chassis.force.setZero(); chassis.torque.setZero();
    chassis.previousPosition.copy(chassis.position); chassis.interpolatedPosition.copy(chassis.position);
    chassis.previousQuaternion.copy(chassis.quaternion); chassis.interpolatedQuaternion.copy(chassis.quaternion);
    chassis.aabbNeedsUpdate = true; steering = 0; world.accumulator = 0;
    vehicle.wheelInfos.forEach((wheel, i) => {
      wheel.rotation = 0; wheel.deltaRotation = 0;
      wheel.suspensionLength = wheel.suspensionRestLength;
      const state = wheelStates[i];
      state.previousRotation = state.rotation = 0;
      state.previousSuspension = state.suspension = wheel.suspensionRestLength;
      state.previousSteering = state.steering = 0;
      vehicle.setSteeringValue(0, i); vehicle.setBrake(0, i); vehicle.applyEngineForce(0, i);
    });
    chassis.wakeUp();
  }
  reset();
  const forward = new Vec3();
  function step(dt: number, input: Controls, gearing: Gearing = 'high') {
    const range = gearRanges[gearing];
    chassis.quaternion.vmult(new Vec3(0, 0, -1), forward);
    const signedSpeed = chassis.velocity.dot(forward);
    const target = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * 0.46 / (1 + chassis.velocity.length() * 0.035);
    steering += (target - steering) * Math.min(1, dt * 8);
    vehicle.setSteeringValue(steering, 0); vehicle.setSteeringValue(steering, 1);
    const drive = (input.throttle ? 1 : 0) - (input.reverse ? 1 : 0);
    const opposing = drive !== 0 && signedSpeed * drive < -0.6;
    const limited = drive > 0 ? signedSpeed > range.forwardLimit : signedSpeed < -range.reverseLimit;
    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce(input.brake || opposing || limited ? 0 : drive * range.engineForce, i);
      vehicle.setBrake(input.brake ? 25 : opposing ? 35 : 0, i);
    }
    world.step(fixedTimeStep, Math.min(dt, 0.05), 4);
    if (chassis.position.y < -10 || Math.abs(chassis.position.x) > 240 || Math.abs(chassis.position.z) > 240) reset();
    return { speed: chassis.velocity.length() * 3.6, reverse: signedSpeed < -0.3 };
  }
  return { world, chassis, vehicle, step, reset, getWheelTransforms, startTrail() { reset(trailStart); } };
}
