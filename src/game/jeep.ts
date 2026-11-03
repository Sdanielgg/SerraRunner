import * as THREE from 'three';
import { vehicles, type VehicleSpec } from './vehicles';
import { addGT3Body } from './gt3-model';

export function createJeep(spec: VehicleSpec = vehicles.jeep) {
  const body = new THREE.Group();
  body.name = spec.name;
  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.85, flatShading: true });
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
  if (spec.id === 'gt3') {
    addGT3Body(body, { paint, dark, metal, glass, lamp, red });
  } else if (spec.id === 'rally') {
    const stripe = new THREE.MeshStandardMaterial({ color: '#f5e5c6', roughness: 0.7 });
    box(1.75, 0.44, 3.3, 0, 0.2, 0);
    box(1.65, 0.22, 1.2, 0, 0.51, -1.02);
    box(1.5, 0.65, 1.8, 0, 0.82, 0.32, dark);
    box(1.53, 0.12, 1.8, 0, 1.19, 0.32);
    box(1.32, 0.46, 0.05, 0, 0.88, -0.61, glass).rotation.x = -0.22;
    box(1.3, 0.4, 0.05, 0, 0.88, 1.23, glass).rotation.x = 0.15;
    box(0.25, 0.025, 1.17, 0, 0.632, -1.02, stripe);
    box(0.25, 0.025, 1.8, 0, 1.263, 0.32, stripe);
    box(1.8, 0.1, 0.4, 0, 1.23, 1.5, dark);
    box(1.75, 0.16, 0.2, 0, 0.02, -1.73, dark);
    for (const side of [-1, 1]) {
      box(0.04, 0.43, 1.4, side * 0.76, 0.89, 0.32, glass);
      box(0.04, 0.5, 0.08, side * 0.79, 0.89, 0.24);
      box(0.44, 0.17, 0.07, side * 0.55, 0.47, -1.67, lamp);
      box(0.25, 0.16, 0.07, side * 0.63, 0.35, 1.67, red);
      for (const z of [-1.12, 1.15]) box(0.3, 0.1, 1.1, side * 0.87, 0.37, z, dark);
    }
  } else {
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
    if (spec.id === 'crawler') {
      // Roof rack, snorkel and reinforced bumpers distinguish the lifted model.
      box(1.55, 0.12, 1.8, 0, 1.55, 0.4, metal);
      for (const x of [-0.77, 0.77]) box(0.07, 0.2, 1.86, x, 1.68, 0.4, dark);
      box(0.13, 1.1, 0.13, 0.9, 1.08, -0.49, dark);
      box(0.25, 0.13, 0.23, 0.9, 1.65, -0.49, dark);
      box(1.6, 0.1, 0.12, 0, 0.53, -1.85, metal);
      for (const x of [-0.65, 0.65]) box(0.1, 0.5, 0.12, x, 0.29, -1.85, metal);
    }
  }
  function wheel() {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 12), rubber);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; group.add(tire);
    const hubRadius = spec.wheelRadius * (spec.id === 'rally' || spec.id === 'gt3' ? 0.68 : 0.52);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, spec.wheelWidth + 0.017, 6), spec.id === 'gt3' ? dark : metal);
    hub.rotation.z = Math.PI / 2; group.add(hub);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelRadius * 0.24, spec.wheelRadius * 0.24, spec.wheelWidth + 0.03, 6), dark);
    cap.rotation.z = Math.PI / 2; group.add(cap);
    if (spec.id === 'gt3') for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spec.wheelWidth + 0.022, hubRadius * 0.8, 0.025), metal);
      spoke.position.set(0, Math.cos(angle) * hubRadius * 0.48, Math.sin(angle) * hubRadius * 0.48);
      spoke.rotation.x = angle; group.add(spoke);
    }
    return group;
  }
  if (spec.id === 'jeep' || spec.id === 'crawler') {
    const spare = wheel(); spare.rotation.y = Math.PI / 2; spare.position.set(0, 0.78, 1.83); body.add(spare);
  }
  body.scale.set(spec.widthScale, spec.heightScale, spec.lengthScale);
  return { body, wheels: Array.from({ length: 4 }, wheel) };
}
