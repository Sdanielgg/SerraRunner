import * as THREE from 'three';
import { economyRamp, economyRampHeights, racePickups } from './economy-course';

export function createEconomyScene() {
  const group = new THREE.Group(); group.name = 'Economia do circuito v2'; group.visible = false;
  const positions: number[] = []; const indices: number[] = [];
  for (let i = 0; i < economyRamp.columns; i++) for (let j = 0; j < economyRamp.rows; j++) {
    positions.push(economyRamp.x + i * economyRamp.cellSize, economyRampHeights[i][j] + 0.012, economyRamp.z - j * economyRamp.cellSize);
    if (i < economyRamp.columns - 1 && j < economyRamp.rows - 1) { const a = i * economyRamp.rows + j; const b = a + economyRamp.rows; indices.push(a, b, a + 1, b + 1, a + 1, b); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const ramp = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#d0944f', roughness: 0.9 })); ramp.receiveShadow = true; group.add(ramp);
  const coinGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
  const fuelGeometry = new THREE.BoxGeometry(0.65, 0.8, 0.45);
  const coinMaterial = new THREE.MeshStandardMaterial({ color: '#ffd05c', metalness: 0.5, roughness: 0.35 });
  const fuelMaterial = new THREE.MeshStandardMaterial({ color: '#71d6b0', roughness: 0.65 });
  const pickups = racePickups.map(p => {
    const mesh = new THREE.Mesh(p.kind === 'coin' ? coinGeometry : fuelGeometry, p.kind === 'coin' ? coinMaterial : fuelMaterial);
    mesh.position.set(p.x, p.y, p.z); if (p.kind === 'coin') mesh.rotation.x = Math.PI / 2; group.add(mesh); return mesh;
  });
  let previous: string[] | null = null;
  return { group, update(collected: string[]) {
    if (previous && previous.length === collected.length && previous.every((id, i) => id === collected[i])) return;
    previous = collected;
    pickups.forEach((mesh, i) => { mesh.visible = !collected.includes(racePickups[i].id); });
  } };
}
