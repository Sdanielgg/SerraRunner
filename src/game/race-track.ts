import { Body, Box, Quaternion, Vec3, type Material, type World } from 'cannon-es';

const corners = [
  [70, 25], [70, -10], [70, -55], [85, -85], [120, -90], [155, -75],
  [170, -45], [160, -20], [165, 5], [150, 35], [120, 45], [90, 40],
];
const samplesPerCorner = 16;
const sampleCount = corners.length * samplesPerCorner;
export const raceTrack = { name: 'Circuito da Serra', width: 12, kerbWidth: 0.8, barrierOffset: 8, finish: { x: 70, z: -10 } };

// A closed Catmull-Rom curve, shared by the road, markings and physical rails.
// Keep this module independent of the renderer so the server uses the same map.
function pointAt(t: number) {
  const segment = Math.floor(t); const u = t - segment;
  const points = [-1, 0, 1, 2].map(offset => corners[(segment + offset + corners.length) % corners.length]);
  const interpolate = (axis: number) => {
    const [a, b, c, d] = points.map(point => point[axis]);
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  };
  return { x: interpolate(0), z: interpolate(1) };
}
export const raceSamples = Array.from({ length: sampleCount }, (_, i) => {
  const t = i / samplesPerCorner;
  const point = pointAt(t);
  const before = pointAt((t - 0.001 + corners.length) % corners.length);
  const after = pointAt((t + 0.001) % corners.length);
  const length = Math.hypot(after.x - before.x, after.z - before.z);
  const dx = (after.x - before.x) / length; const dz = (after.z - before.z) / length;
  return { ...point, dx, dz, nx: -dz, nz: dx };
});
export const raceLength = raceSamples.reduce((length, point, i) => {
  const next = raceSamples[(i + 1) % sampleCount];
  return length + Math.hypot(next.x - point.x, next.z - point.z);
}, 0);

export function raceSpawn(slot = 0) {
  return { x: 70 + (slot % 2 === 0 ? -2.6 : 2.6), y: 1.5, z: 1 + Math.floor(slot / 2) * 7, yaw: 0 };
}

export const raceBarriers = raceSamples.flatMap((point, i) => {
  const next = raceSamples[(i + 1) % sampleCount];
  return [-1, 1].flatMap(side => {
    const offset = side * raceTrack.barrierOffset;
    const a = { x: point.x + point.nx * offset, z: point.z + point.nz * offset };
    const b = { x: next.x + next.nx * offset, z: next.z + next.nz * offset };
    const x = (a.x + b.x) / 2; const z = (a.z + b.z) / 2;
    // An opening on the outer edge connects the circuit to the garage.
    if (side === -1 && x < 80 && z > 8 && z < 22) return [];
    return [{ x, z, yaw: Math.atan2(b.x - a.x, b.z - a.z), length: Math.hypot(b.x - a.x, b.z - a.z) + 0.06, width: 0.35, height: 0.8 }];
  });
});

export function addRaceTrackCollisions(world: World, material: Material) {
  // Small compound bodies let raycasts reject distant sections of the circuit.
  // One body for the whole circuit would test hundreds of shapes per wheel ray.
  for (let start = 0; start < raceBarriers.length; start += 24) {
    const section = raceBarriers.slice(start, start + 24);
    const x = section.reduce((sum, rail) => sum + rail.x, 0) / section.length;
    const z = section.reduce((sum, rail) => sum + rail.z, 0) / section.length;
    const body = new Body({ mass: 0, material, position: new Vec3(x, 0, z) });
    for (const rail of section) {
      const shape = new Box(new Vec3(rail.width / 2, rail.height / 2, rail.length / 2));
      shape.material = material;
      const rotation = new Quaternion(); rotation.setFromEuler(0, rail.yaw, 0);
      body.addShape(shape, new Vec3(rail.x - x, rail.height / 2, rail.z - z), rotation);
    }
    world.addBody(body);
  }
}
