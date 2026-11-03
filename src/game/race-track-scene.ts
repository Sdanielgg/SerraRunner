import * as THREE from 'three';
import { raceBarriers, raceSamples, raceSpawn, raceTrack } from './race-track';

export function createRaceTrack() {
  const group = new THREE.Group(); group.name = 'Circuito da Serra';
  const asphalt = new THREE.MeshStandardMaterial({ color: '#454b4b', roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2eddb', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#263535', roughness: 0.8 });
  function ribbon(from: number, to: number, y: number, material: THREE.Material, striped = false) {
    const positions: number[] = []; const indices: number[] = []; const colors: number[] = [];
    const red = new THREE.Color('#bb4c3d'); const pale = new THREE.Color('#f2eddb');
    for (let i = 0; i < raceSamples.length; i++) {
      const a = raceSamples[i]; const b = raceSamples[(i + 1) % raceSamples.length];
      const base = positions.length / 3;
      for (const [point, offset] of [[a, from], [a, to], [b, from], [b, to]] as const) {
        positions.push(point.x + point.nx * offset, y, point.z + point.nz * offset);
        const color = Math.floor(i / 2) % 2 === 0 ? red : pale; colors.push(color.r, color.g, color.b);
      }
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    if (striped) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh);
  }
  const half = raceTrack.width / 2;
  ribbon(-half, half, 0.012, asphalt);
  const kerb = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  ribbon(-half - raceTrack.kerbWidth, -half, 0.016, kerb, true);
  ribbon(half, half + raceTrack.kerbWidth, 0.016, kerb, true);
  ribbon(-half + 0.15, -half + 0.27, 0.02, white);
  ribbon(half - 0.27, half - 0.15, 0.02, white);

  // Bake static boxes into one mesh per material. This keeps draw calls low and
  // works with native Expo Go contexts that do not expose WebGL instancing.
  function coloredBoxes(name: string, items: { x: number; y: number; z: number; w: number; h: number; d: number; yaw: number; color: string }[]) {
    const cube = new THREE.BoxGeometry(1, 1, 1); const attribute = cube.getAttribute('position');
    const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
    const transform = new THREE.Object3D(); const vertex = new THREE.Vector3();
    for (const item of items) {
      const base = positions.length / 3; const color = new THREE.Color(item.color);
      transform.position.set(item.x, item.y, item.z); transform.rotation.set(0, item.yaw, 0);
      transform.scale.set(item.w, item.h, item.d); transform.updateMatrix();
      for (let i = 0; i < attribute.count; i++) {
        vertex.fromBufferAttribute(attribute, i).applyMatrix4(transform.matrix);
        positions.push(vertex.x, vertex.y, vertex.z); colors.push(color.r, color.g, color.b);
      }
      for (const index of cube.index!.array) indices.push(base + index);
    }
    cube.dispose();
    const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    mesh.name = name; mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  coloredBoxes('Barreiras do circuito', raceBarriers.map((rail, i) => ({
    x: rail.x, y: rail.height / 2, z: rail.z, w: rail.width, h: rail.height, d: rail.length, yaw: rail.yaw,
    color: Math.floor(i / 6) % 2 === 0 ? '#ddd7c5' : '#b65345',
  }))).castShadow = true;

  function box(w: number, h: number, d: number, x: number, y: number, z: number, material = white) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  // A level access road meets the opening in the outer rail.
  box(43, 0.004, 10, 42.5, 0.01, 15, asphalt);
  const finish = raceTrack.finish;
  coloredBoxes('Linha de partida', Array.from({ length: 64 }, (_, i) => {
    const row = Math.floor(i / 16); const column = i % 16;
    return { x: finish.x - half + 0.375 + column * 0.75, y: 0.022, z: finish.z - 1.125 + row * 0.75,
      w: 0.75, h: 0.004, d: 0.75, yaw: 0, color: (row + column) % 2 ? '#263535' : '#f2eddb' };
  }));
  // Four staggered grid boxes, matching the authoritative multiplayer spawns.
  for (let slot = 0; slot < 4; slot++) {
    const spawn = raceSpawn(slot);
    box(2.8, 0.004, 0.12, spawn.x, 0.022, spawn.z - 2.2);
    for (const side of [-1, 1]) box(0.12, 0.004, 4.4, spawn.x + side * 1.4, 0.022, spawn.z);
  }
  for (const side of [-1, 1]) box(0.3, 5, 0.3, finish.x + side * 9, 2.5, finish.z, dark).castShadow = true;
  const yellow = new THREE.MeshStandardMaterial({ color: '#e6bd6a', roughness: 0.7 });
  box(18.3, 0.65, 0.4, finish.x, 5, finish.z, dark).castShadow = true;
  box(5, 0.36, 0.44, finish.x, 5, finish.z, yellow);

  // Direction arrows make the intended racing line easy to follow.
  const arrowGeometry = new THREE.BufferGeometry();
  arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.8, 0, -0.6, 0, 0, 1.6, 0.8, 0, -0.6], 3));
  arrowGeometry.computeVertexNormals();
  for (let i = 8; i < raceSamples.length; i += 24) {
    const point = raceSamples[i]; const arrow = new THREE.Mesh(arrowGeometry, white);
    arrow.position.set(point.x, 0.022, point.z); arrow.rotation.y = Math.atan2(point.dx, point.dz); group.add(arrow);
  }
  return group;
}
