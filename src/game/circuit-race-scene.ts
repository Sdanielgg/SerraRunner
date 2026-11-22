import * as THREE from 'three';
import { circuitCheckpoints } from './circuit-race';
import { batchModel } from './trail-models';

export function createCircuitMarkers() {
  const group = new THREE.Group(); group.name = 'Checkpoints do circuito'; group.visible = false;
  const active = new THREE.MeshBasicMaterial({ color: '#ffd05c' });
  const passed = new THREE.MeshBasicMaterial({ color: '#71b891' });
  const waiting = new THREE.MeshBasicMaterial({ color: '#647d7c' });
  const post = new THREE.BoxGeometry(0.16, 3.5, 0.16);
  const beam = new THREE.BoxGeometry(14, 0.15, 0.15);
  const gates = circuitCheckpoints.slice(0, -1).map(p => {
    const gate = new THREE.Group(); gate.position.set(p.x, 0, p.z); gate.rotation.y = Math.atan2(-p.dx, -p.dz);
    for (const side of [-1, 1]) { const mesh = new THREE.Mesh(post, waiting); mesh.position.set(side * 7, 1.75, 0); gate.add(mesh); }
    const top = new THREE.Mesh(beam, waiting); top.position.y = 3.5; gate.add(top);
    batchModel(gate); gate.children.forEach(mesh => { mesh.castShadow = false; });
    group.add(gate); return gate;
  });
  let previous = -1;
  return { group, materials: [active, passed, waiting], update(next: number) {
    if (previous === next) return; previous = next;
    gates.forEach((gate, i) => { const material = next < circuitCheckpoints.length && i === next % gates.length ? active : i < next ? passed : waiting; gate.children.forEach(mesh => { (mesh as THREE.Mesh).material = material; }); });
  } };
}
