// Both the renderer and collision shape use this exact grid (one metre per cell).
export const trail = { x: -56, z: 12, columns: 43, rows: 127, cellSize: 1 };
export const trailStart = { x: -35, y: 1.2, z: 5, yaw: 0 };

function heightAt(x: number, z: number) {
  const lateral = Math.max(0, Math.min(1, (21 - Math.abs(x + 35)) / 7));
  const ramp = Math.max(0, Math.min(1, (z + 44) / 12, (-12 - z) / 12)) * 4;
  const bumpsEnvelope = Math.max(0, Math.min(1, (-46 - z) / 3, (z + 70) / 3));
  const bumps = bumpsEnvelope * (0.5 + 0.42 * Math.sin(z * 1.25 + (x + 35) * 1.5));
  const hill = Math.max(0, 1 - Math.abs(z + 89) / 17) * 7;
  const sideSlope = Math.max(0, 1 - Math.abs(z + 89) / 17) * (x + 35) * 0.13;
  return lateral * Math.max(0, ramp + bumps + hill + sideSlope);
}

export const terrainHeights = Array.from({ length: trail.columns }, (_, x) =>
  Array.from({ length: trail.rows }, (_, z) => heightAt(trail.x + x * trail.cellSize, trail.z - z * trail.cellSize)));

export function terrainHeightAt(x: number, z: number) {
  const gx = (x - trail.x) / trail.cellSize; const gz = (trail.z - z) / trail.cellSize;
  if (gx < 0 || gz < 0 || gx >= trail.columns - 1 || gz >= trail.rows - 1) return 0;
  const i = Math.floor(gx); const j = Math.floor(gz); const u = gx - i; const v = gz - j;
  const a = terrainHeights[i][j]; const b = terrainHeights[i + 1][j];
  const c = terrainHeights[i][j + 1]; const d = terrainHeights[i + 1][j + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
