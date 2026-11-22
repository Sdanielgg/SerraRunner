import { Body, Heightfield, type Material, type World } from 'cannon-es';
import { raceSamples } from './race-track';
import { terrainHeightAt } from './terrain';

// Optional side lane, using the same heightfield/triangle technique as the trail.
// The normal centre line, the local challenge and all v1 timed runs stay intact.
const cellSize = 0.5;
export const economyRamp = { x: 70.5, z: -14, columns: 11, rows: 25, cellSize };
export const economyRampHeights = Array.from({ length: economyRamp.columns }, (_, i) => Array.from({ length: economyRamp.rows }, (_, j) => {
  const x = economyRamp.x + i * cellSize; const z = economyRamp.z - j * cellSize;
  const edge = Math.max(0, Math.min(1, (1.5 - Math.abs(x - 73.5)) / 0.4));
  const distance = -z - 16;
  return edge * Math.max(0, Math.min(1, distance / 6, (8 - distance) / 1)) * 2;
}));
export function economyHeightAt(x: number, z: number) {
  const gx = (x - economyRamp.x) / cellSize; const gz = (economyRamp.z - z) / cellSize;
  if (gx < 0 || gz < 0 || gx >= economyRamp.columns - 1 || gz >= economyRamp.rows - 1) return terrainHeightAt(x, z);
  const i = Math.floor(gx); const j = Math.floor(gz); const u = gx - i; const v = gz - j;
  const a = economyRampHeights[i][j]; const b = economyRampHeights[i + 1][j];
  const c = economyRampHeights[i][j + 1]; const d = economyRampHeights[i + 1][j + 1];
  return Math.max(terrainHeightAt(x, z), u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v));
}
const enabledWorlds = new WeakMap<World, Body[]>();
export function enableEconomyCourse(world: World, material?: Material) {
  if (enabledWorlds.has(world)) return;
  const bodies: Body[] = [];
  for (let row = 0; row < economyRamp.rows - 1; row += economyRamp.columns - 1) {
    const body = new Body({ mass: 0, material });
    body.addShape(new Heightfield(economyRampHeights.map(column => Array.from({ length: economyRamp.columns }, (_, j) => column[row + j] ?? 0)), { elementSize: cellSize }));
    body.position.set(economyRamp.x, 0, economyRamp.z - row * cellSize); body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(body); bodies.push(body);
  }
  enabledWorlds.set(world, bodies);
}
export function disableEconomyCourse(world: World) { for (const body of enabledWorlds.get(world) ?? []) world.removeBody(body); enabledWorlds.delete(world); }

export type RacePickup = { id: string; kind: 'coin' | 'fuel'; x: number; y: number; z: number };
export const racePickups: RacePickup[] = [
  ...[23, 45, 65, 85, 105, 130, 150, 175].map((index, i) => ({ id: `coin-${i}`, kind: 'coin' as const, ...raceSamples[index], y: 1 })),
  ...[55, 140].map((index, i) => ({ id: `fuel-${i}`, kind: 'fuel' as const, ...raceSamples[index], y: 1 })),
];
