import * as THREE from 'three';

export function createJeep() {
  const body = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: '#d5a14e', roughness: 0.85, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#25302b', roughness: 0.9, flatShading: true });
  const rubber = new THREE.MeshStandardMaterial({ color: '#202523', roughness: 1, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: '#a9b1a2', roughness: 0.65, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#789c9a', roughness: 0.25, metalness: 0.25 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff2bd', emissive: '#eac77b', emissiveIntensity: 0.35 });
  const red = new THREE.MeshStandardMaterial({ color: '#ba4c38' });
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material = paint) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh);
    return mesh;
  }
  box(1.7, 0.48, 3.25, 0, 0.22, 0);
  box(1.58, 0.27, 1.23, 0, 0.57, -1.02);
  box(1.57, 0.87, 1.86, 0, 0.88, 0.43, dark);
  box(1.72, 0.14, 2.05, 0, 1.39, 0.4);
  box(1.34, 0.57, 0.045, 0, 0.98, -0.52, glass).rotation.x = -0.12;
  box(1.33, 0.52, 0.04, 0, 1, 1.38, glass);
  for (const side of [-1, 1]) {
    for (const z of [-0.04, 0.88]) {
      box(0.045, 0.54, 0.72, side * 0.8, 1.01, z, glass);
      box(0.06, 0.36, 0.79, side * 0.81, 0.55, z);
      box(0.035, 0.045, 0.18, side * 0.85, 0.71, z + 0.19, dark);
    }
    box(0.17, 0.74, 0.1, side * 0.73, 1, -0.5);
    box(0.11, 0.72, 0.1, side * 0.77, 1, 0.4);
    box(0.3, 0.13, 1.5, side * 0.91, 0.02, 0.4, dark);
    box(0.23, 0.18, 0.15, side * 0.99, 0.91, -0.45, dark);
    for (const z of [-1.12, 1.15]) box(0.4, 0.12, 1.15, side * 0.86, 0.46, z);
    box(0.23, 0.22, 0.06, side * 0.61, 0.54, -1.66, lamp);
    box(0.21, 0.19, 0.06, side * 0.64, 0.39, 1.66, red);
  }
  box(1.98, 0.2, 0.23, 0, 0.05, -1.76, dark);
  box(1.95, 0.18, 0.22, 0, 0.05, 1.76, dark);
  for (let i = -3; i <= 3; i++) box(0.06, 0.29, 0.04, i * 0.125, 0.46, -1.657, dark);
  function wheel() {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 12), rubber);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; group.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.337, 6), metal);
    hub.rotation.z = Math.PI / 2; group.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.35, 6), dark);
    cap.rotation.z = Math.PI / 2; group.add(cap);
    return group;
  }
  const spare = wheel(); spare.rotation.y = Math.PI / 2; spare.position.set(0, 0.78, 1.83); body.add(spare);
  return { body, wheels: Array.from({ length: 4 }, wheel) };
}
