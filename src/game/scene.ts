import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { createJeep } from './jeep';
import { Controls, createPhysics, type Gearing } from './physics';
import { createOrbitCamera } from './orbit-camera';
import { terrainHeightAt, terrainHeights, trail } from './terrain';

export function createScene(gl: ExpoWebGLRenderingContext) {
  // Native GL has no DOM canvas. Three only needs this small surface adapter.
  const canvas = gl.canvas ?? {
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
    style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {},
    getContext: () => gl,
  };
  // Keep three pinned to r162: Expo Go can expose a WebGLRenderingContext
  // even on GLES 3 devices. r163+ rejects that native context at startup.
  const renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, context: gl, antialias: true });
  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#c8d7ce');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c8d7ce', 65, 180);
  const camera = new THREE.PerspectiveCamera(46, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 280);
  scene.add(new THREE.HemisphereLight('#fff7dc', '#677f67', 2.4));
  const sun = new THREE.DirectionalLight('#fff1cf', 3);
  sun.position.set(-16, 25, -12); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 70 });
  sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#a6ae85', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), new THREE.MeshStandardMaterial({ color: '#c1bb9e', roughness: 1 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.008; pad.receiveShadow = true; scene.add(pad);
  const grid = new THREE.GridHelper(42, 14, '#b1ad92', '#b1ad92');
  grid.position.y = 0.014;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.32; scene.add(grid);
  // The triangle diagonal matches Cannon's Heightfield, including uneven cells.
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  const earth = new THREE.Color('#a18b64'); const rock = new THREE.Color('#797e70');
  const vertexColor = new THREE.Color();
  for (let x = 0; x < trail.columns; x++) {
    for (let z = 0; z < trail.rows; z++) {
      const height = terrainHeights[x][z];
      positions.push(trail.x + x * trail.cellSize, height + 0.006, trail.z - z * trail.cellSize);
      vertexColor.copy(earth).lerp(rock, Math.min(1, height / 7));
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      if (x < trail.columns - 1 && z < trail.rows - 1) {
        const a = x * trail.rows + z; const b = a + trail.rows;
        indices.push(a, b, a + 1, b + 1, a + 1, b);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.setIndex(indices); terrainGeometry.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrainMesh.castShadow = true; terrainMesh.receiveShadow = true; scene.add(terrainMesh);
  // Flags mark the entrance and each challenge without invisible collision walls.
  const poleGeometry = new THREE.CylinderGeometry(0.045, 0.045, 2.5, 5);
  const flagGeometry = new THREE.BoxGeometry(0.7, 0.4, 0.06);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: '#4a5145' });
  for (const [z, color] of [[0, '#e6bd6a'], [-44, '#d48b4d'], [-72, '#bb6451']] as const) {
    const flagMaterial = new THREE.MeshStandardMaterial({ color });
    for (const x of [-40, -30]) {
      const pole = new THREE.Mesh(poleGeometry, poleMaterial); pole.position.set(x, 1.25, z);
      const flag = new THREE.Mesh(flagGeometry, flagMaterial); flag.position.set(x + 0.3, 2.15, z);
      scene.add(pole, flag);
    }
  }
  const border = new THREE.Mesh(new THREE.RingGeometry(23, 23.12, 64), new THREE.MeshBasicMaterial({ color: '#e5dfc0', side: THREE.DoubleSide }));
  border.rotation.x = -Math.PI / 2; border.position.y = 0.02; scene.add(border);
  const jeep = createJeep(); scene.add(jeep.body, ...jeep.wheels);
  const physics = createPhysics();
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const sunOffset = new THREE.Vector3(-16, 25, -12);
  let cameraMode = 0;
  const orbit = createOrbitCamera();
  let snapCamera = true;
  let width = gl.drawingBufferWidth;
  let height = gl.drawingBufferHeight;
  function liftAboveTerrain(position: THREE.Vector3) {
    position.y = Math.max(position.y, terrainHeightAt(position.x, position.z) + 1.2);
  }
  function frame(dt: number, controls: Controls, gearing: Gearing = 'high') {
    const telemetry = physics.step(dt, controls, gearing);
    const { chassis } = physics;
    jeep.body.position.copy(chassis.interpolatedPosition);
    jeep.body.quaternion.copy(chassis.interpolatedQuaternion);
    const wheelTransforms = physics.getWheelTransforms();
    jeep.wheels.forEach((wheel, i) => {
      const transform = wheelTransforms[i];
      wheel.position.copy(transform.position); wheel.quaternion.copy(transform.quaternion);
    });
    if (width !== gl.drawingBufferWidth || height !== gl.drawingBufferHeight) {
      width = gl.drawingBufferWidth; height = gl.drawingBufferHeight;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    }
    const portrait = width < height;
    if (cameraMode === 2) {
      const position = orbit.offset(portrait ? 17 : 13);
      offset.set(position.x, position.y, position.z);
    } else {
      offset.set(cameraMode === 0 ? 5.8 : 0, cameraMode === 0 ? 4.4 : 6.7, cameraMode === 0 ? 8.8 : 10.8);
      if (portrait) offset.multiplyScalar(1.25);
      offset.applyQuaternion(jeep.body.quaternion);
    }
    desired.copy(jeep.body.position).add(offset);
    desired.y = Math.max(desired.y, jeep.body.position.y + (cameraMode === 2 ? 1.5 : 3));
    // Lift both the desired and smoothed camera positions above the actual mesh.
    liftAboveTerrain(desired);
    camera.position.lerp(desired, snapCamera ? 1 : 1 - Math.exp(-dt * 4));
    liftAboveTerrain(camera.position);
    target.copy(jeep.body.position); target.y += 0.5;
    camera.lookAt(target); snapCamera = false;
    sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
    renderer.render(scene, camera); gl.endFrameEXP();
    return telemetry;
  }
  return {
    frame,
    reset() { physics.reset(); snapCamera = true; },
    startTrail() { physics.startTrail(); snapCamera = true; orbit.cancel(); },
    toggleCamera() { cameraMode = (cameraMode + 1) % 3; snapCamera = true; orbit.cancel(); return cameraMode; },
    beginCameraDrag(id: number, x: number, y: number) { if (cameraMode === 2) orbit.begin(id, x, y); },
    moveCameraDrag(id: number, x: number, y: number) { if (cameraMode === 2) orbit.move(id, x, y); },
    endCameraDrag(id: number) { orbit.end(id); },
    cancelCameraDrag() { orbit.cancel(); },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          geometries.add(object.geometry);
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach(material => materials.add(material));
        }
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      renderer.dispose(); physics.vehicle.removeFromWorld(physics.world);
    },
  };
}
