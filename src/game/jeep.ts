import * as THREE from 'three';
import { vehicles, type VehicleSpec } from './vehicles';
import { addGT3Body, createGT3Wheel } from './gt3-model';
import { addTrailBody, batchModel, createTrailWheel } from './trail-models';

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
  const materials = { paint, dark, metal, glass, lamp, red };
  if (spec.id === 'gt3') addGT3Body(body, materials, spec);
  else addTrailBody(body, materials, spec);
  function wheel() {
    return spec.id === 'gt3' ? createGT3Wheel(spec, rubber, metal) : createTrailWheel(spec, materials);
  }
  if (spec.id === 'jeep' || spec.id === 'crawler') {
    const spare = wheel(); spare.rotation.y = Math.PI / 2; spare.position.set(0, 0.78, 1.83); body.add(spare);
  }
  if (spec.id !== 'gt3') batchModel(body);
  body.scale.set(spec.widthScale, spec.heightScale, spec.lengthScale);
  return { body, wheels: Array.from({ length: 4 }, wheel) };
}
