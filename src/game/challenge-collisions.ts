import { Body, Box, Heightfield, Quaternion, Vec3, type Material, type World } from 'cannon-es';
import { challengeBlocks, challengeHeightAt, challengeRails, challengeTerrains, challengeTunnel } from './challenge-course';

export function addChallengeCollisions(world: World, material: Material) {
  for (const terrain of challengeTerrains) for (let row = 0; row < terrain.rows - 1; row += 16) {
    const body = new Body({ mass: 0, material, position: new Vec3(terrain.x, 0, terrain.z - row) });
    const shape = new Heightfield(terrain.heights.map(column => column.slice(row, row + 17)), { elementSize: 1 });
    shape.material = material; body.addShape(shape); body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(body);
  }
  const tunnel = challengeTunnel;
  const obstacles: { x: number; z: number; width: number; depth: number; height: number; yaw: number; bottom?: number }[] = [
    ...challengeRails.map(rail => ({ ...rail, width: .3, depth: rail.length, height: .7 })),
    ...challengeBlocks.map(block => ({ ...block, yaw: 0 })),
    ...[-1,1].map(side => ({ x: tunnel.x + side * tunnel.halfWidth, z: tunnel.z, width: .35, depth: tunnel.length, height: tunnel.clearance, yaw: 0 })),
    { x: tunnel.x, z: tunnel.z, width: tunnel.halfWidth * 2 + .35, depth: tunnel.length, height: .25, bottom: tunnel.clearance, yaw: 0 },
  ];
  for (let start = 0; start < obstacles.length; start += 16) {
    const items = obstacles.slice(start, start + 16); const origin = items[0];
    const body = new Body({ mass: 0, material, position: new Vec3(origin.x, 0, origin.z) });
    for (const item of items) {
      const shape = new Box(new Vec3(item.width / 2, item.height / 2, item.depth / 2)); shape.material = material;
      const rotation = new Quaternion(); rotation.setFromEuler(0, item.yaw, 0);
      body.addShape(shape, new Vec3(item.x - origin.x, (item.bottom ?? challengeHeightAt(item.x, item.z)) + item.height / 2, item.z - origin.z), rotation);
    }
    world.addBody(body);
  }
}
