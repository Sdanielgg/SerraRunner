// Renderer-independent layout: all physical obstacles use this same data.
export const challengeCourse = { name: 'Desafio da Serra', width: 14, countdown: 3, recoveryPenalty: 5 };
export type CoursePoint = { x: number; z: number; dx: number; dz: number; nx: number; nz: number };
export const challengeSamples: CoursePoint[] = Array.from({ length: 692 }, (_, i) => {
  let x: number; let z: number; let dx: number; let dz: number;
  if (i < 250) { x = -200; z = 125 - i; dx = 0; dz = -1; }
  else if (i < 346) {
    const angle = Math.PI + (i - 250) / 96 * Math.PI;
    x = -145 + 55 * Math.cos(angle); z = -125 + 55 * Math.sin(angle); dx = -Math.sin(angle); dz = Math.cos(angle);
  } else if (i < 596) { x = -90; z = -125 + i - 346; dx = 0; dz = 1; }
  else {
    const angle = (i - 596) / 96 * Math.PI;
    x = -145 + 55 * Math.cos(angle); z = 125 + 55 * Math.sin(angle); dx = -Math.sin(angle); dz = Math.cos(angle);
  }
  return { x, z, dx, dz, nx: -dz, nz: dx };
});
export const challengeLength = challengeSamples.reduce((sum, p, i) => {
  const next = challengeSamples[(i + 1) % challengeSamples.length]; return sum + Math.hypot(next.x - p.x, next.z - p.z);
}, 0);
export function challengeHalfWidthAt(p: { x: number; z: number }) {
  const bridge = p.x < -195 ? Math.max(0, Math.min(1, (-50 - p.z) / 15, (p.z + 120) / 15)) : 0;
  return 7 - bridge * 3.8;
}
const gates = [
  [30,0,'Reta de lançamento'],[60,0,'Travagem para a chicane'],
  [82,3.3,'Chicane · direita'],[106,-3.3,'Chicane · esquerda'],[130,3.3,'Saída da chicane'],
  [150,0,'Entrada do túnel'],[173,0,'Saída do túnel'],[201,0,'Ponte estreita'],[235,0,'Descida da ponte'],
  [250,0,'Curva norte'],[274,0,'Curva norte · entrada'],[298,0,'Curva norte · vértice'],[322,0,'Curva norte · saída'],
  [346,0,'Zona de terra'],[366,0,'Lombas'],[386,0,'Travagem para o slalom'],
  [410,-3.3,'Slalom 1 · direita'],[434,3.3,'Slalom 2 · esquerda'],[458,-3.3,'Slalom 3 · direita'],
  [482,3.3,'Slalom 4 · esquerda'],[506,-3.3,'Slalom 5 · direita'],
  [515,0,'Subida panorâmica'],[535,0,'Topo da rampa'],[555,0,'Descida da rampa'],[577,0,'Segunda rampa'],
  [596,0,'Curva da meta'],[620,0,'Última curva · entrada'],[644,0,'Última curva · vértice'],[668,0,'Reta da meta'],[692,0,'Meta'],
] as const;
export const challengeGates = gates.map(([index, offset, name]) => {
  const p = challengeSamples[index % challengeSamples.length];
  const halfWidth = offset ? 2.7 : Math.min(7, challengeHalfWidthAt(p));
  return { ...p, x: p.x + p.nx * offset, z: p.z + p.nz * offset, name, halfWidth, index };
});
export const challengeSpawn = { x: -200, y: 1.4, z: 133, yaw: 0 };
export const challengeBlocks = [
  ...[48,24,0].map((z,i) => ({ x: -200 + (i % 2 === 0 ? -3.6 : 3.6), z, width: 6, depth: 1.2, height: .65 })),
  ...[-66,-42,-18,6,30].map((z,i) => ({ x: -90 + (i % 2 === 0 ? -3.6 : 3.6), z, width: 6, depth: 1.2, height: .65 })),
];
export const challengeTunnel = { x: -200, z: -35, length: 24, halfWidth: 3.8, clearance: 3.6 };
export function challengeInTunnel(x: number, z: number) { return Math.abs(x + 200) < 12 && z < -12 && z > -60; }
export const challengeRails = challengeSamples.flatMap((p, i) => {
  const next = challengeSamples[(i + 1) % challengeSamples.length];
  return [-1, 1].map(side => {
    const a = side * (challengeHalfWidthAt(p) + .6); const b = side * (challengeHalfWidthAt(next) + .6);
    const ax = p.x + p.nx * a; const az = p.z + p.nz * a;
    const bx = next.x + next.nx * b; const bz = next.z + next.nz * b;
    return { x: (ax + bx) / 2, z: (az + bz) / 2, yaw: Math.atan2(bx - ax, bz - az), length: Math.hypot(bx - ax, bz - az) + .04 };
  });
});
function smooth(t: number) { const u = Math.max(0,Math.min(1,t)); return u*u*(3-2*u); }
function hump(z: number, from: number, to: number, height: number) {
  return z > from && z < to ? height * (1 - Math.cos((z - from) / (to - from) * Math.PI * 2)) / 2 : 0;
}
type TerrainPatch = { x: number; z: number; columns: number; rows: number; heights: number[][] };
function patch(x: number, z: number, rows: number, height: (x: number, z: number) => number): TerrainPatch {
  return { x, z, columns: 17, rows, heights: Array.from({ length: 17 }, (_, i) => Array.from({ length: rows }, (_, j) => height(x + i, z - j))) };
}
export const challengeTerrains = [
  patch(-208,-46,81,(x,z) => {
    const edge = 1 - smooth((Math.abs(x + 200) - 4.1) / 2);
    return edge * 1.1 * smooth((-z-55)/15) * (1-smooth((-z-97)/15));
  }),
  patch(-98,130,257,(x,z) => {
    const edge = Math.max(0,Math.min(1,8-Math.abs(x+90)));
    return edge * (hump(z,-112,-104,.12) + hump(z,-102,-94,.12) + hump(z,-92,-84,.12)
      + hump(z,44,84,1.5) + hump(z,94,118,.65));
  }),
];
export function challengeHeightAt(x: number, z: number) {
  const terrain = challengeTerrains.find(p => x >= p.x && x < p.x + 16 && z <= p.z && z > p.z - p.rows + 1);
  if (!terrain) return 0;
  const gx = x - terrain.x; const gz = terrain.z - z;
  const i = Math.floor(gx); const j = Math.floor(gz); const u = gx - i; const v = gz - j;
  const a = terrain.heights[i][j]; const b = terrain.heights[i+1][j];
  const c = terrain.heights[i][j+1]; const d = terrain.heights[i+1][j+1];
  return u+v <= 1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
}

// The ground arrows follow the open lanes, rather than pointing into barriers.
function lineOffset(z: number, points: number[][]) {
  if (z < points[0][0] || z > points[points.length-1][0]) return 0;
  let i=0; while (i<points.length-2 && z>points[i+1][0]) i++;
  const a=points[i]; const b=points[i+1]; return a[1]+(b[1]-a[1])*smooth((z-a[0])/(b[0]-a[0]));
}
const westLine = [[-15,0],[-5,3.3],[5,3.3],[19,-3.3],[29,-3.3],[43,3.3],[53,3.3],[65,0]];
const eastLine = [[-80,0],[-71,3.3],[-61,3.3],[-47,-3.3],[-37,-3.3],[-23,3.3],[-13,3.3],[1,-3.3],[11,-3.3],[25,3.3],[35,3.3],[44,0]];
export const challengeRacingLine = challengeSamples.map((p,i) => ({ ...p,
  x: p.x + (i<250 ? lineOffset(p.z,westLine) : i>=346 && i<596 ? lineOffset(p.z,eastLine) : 0),
}));
export function challengeTechnicalSection(index: number) {
  return (index >= 65 && index < 240) || (index >= 355 && index < 590);
}