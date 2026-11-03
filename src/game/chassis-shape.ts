import { ConvexPolyhedron, Vec3 } from 'cannon-es';
import type { VehicleSpec } from './vehicles';

export function createChassisShape(spec: VehicleSpec) {
  // Keep the belly clearance, but slope the underside up to both bumpers.
  // A full-length box leaves a low vertical lip that catches shallow obstacles.
  const profile = [
    [-0.18, -1.15], [-0.18, 1.15], [-0.04, 1.82],
    [0.42, 1.82], [0.42, -1.82], [-0.04, -1.82],
  ];
  const vertices = [-1, 1].flatMap(side => profile.map(([y, z]) =>
    new Vec3(side * 0.86 * spec.widthScale, y * spec.heightScale, z * spec.lengthScale)));
  const count = profile.length;
  const faces = [profile.map((_, i) => i), profile.map((_, i) => count * 2 - 1 - i)];
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count;
    faces.push([i, i + count, next + count, next]);
  }
  return new ConvexPolyhedron({ vertices, faces });
}
