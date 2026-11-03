import { terrainHeightAt } from './terrain';

type Position = { x: number; y: number; z: number };
type Rotation = Position & { w: number };
const rim = Array.from({ length: 32 }, (_, i) => ({
  y: Math.cos(i * Math.PI / 16), z: Math.sin(i * Math.PI / 16),
}));

// Integration and snapshot interpolation move the chassis after suspension was
// sampled. Refit only a penetrating tyre, along its suspension axis, so that
// drawing it never uses an outdated terrain contact. This doesn't change forces.
export function fitWheelToTerrain(position: Position, rotation: Rotation, bodyRotation: Rotation, radius: number, width: number) {
  const q = rotation;
  const axle = { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.w * q.z), z: 2 * (q.x * q.z - q.w * q.y) };
  const up = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
  const forward = { x: 2 * (q.x * q.z + q.w * q.y), y: 2 * (q.y * q.z - q.w * q.x), z: 1 - 2 * (q.x * q.x + q.y * q.y) };
  const b = bodyRotation;
  const suspensionUp = { x: 2 * (b.x * b.y - b.w * b.z), y: 1 - 2 * (b.x * b.x + b.z * b.z), z: 2 * (b.y * b.z + b.w * b.x) };
  // A rolled-over vehicle rests on its chassis and tyre colliders; there is no
  // suspension correction when its axis points sideways or into the ground.
  if (suspensionUp.y < 0.25) return;
  for (let iteration = 0; iteration < 4; iteration++) {
    let lift = 0;
    for (const across of [-0.5, -0.25, 0, 0.25, 0.5]) {
      for (const point of rim) {
        const x = position.x + axle.x * across * width + radius * (up.x * point.y + forward.x * point.z);
        const y = position.y + axle.y * across * width + radius * (up.y * point.y + forward.y * point.z);
        const z = position.z + axle.z * across * width + radius * (up.z * point.y + forward.z * point.z);
        // The displayed terrain is raised 6 mm to avoid z-fighting.
        lift = Math.max(lift, (terrainHeightAt(x, z) + 0.008 - y) / suspensionUp.y);
      }
    }
    if (lift < 0.0001) break;
    position.x += suspensionUp.x * lift;
    position.y += suspensionUp.y * lift;
    position.z += suspensionUp.z * lift;
  }
}
