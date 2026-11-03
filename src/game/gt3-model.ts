import * as THREE from 'three';

type Materials = Record<'paint' | 'dark' | 'metal' | 'glass' | 'lamp' | 'red', THREE.MeshStandardMaterial>;

// Original GT-style coupe built from local geometry, with no downloaded models
// or textures. Coordinates share the chassis frame and the standard wheelbase.
export function addGT3Body(body: THREE.Group, materials: Materials) {
  const { paint, dark, metal, lamp, red } = materials;
  paint.roughness = 0.4; paint.metalness = 0.2;
  const carbon = new THREE.MeshStandardMaterial({ color: '#182526', roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: '#173b47', roughness: 0.22, metalness: 0.3, flatShading: true });
  const ivory = new THREE.MeshStandardMaterial({ color: '#f3edda', roughness: 0.6 });
  const fenderMaterial = paint.clone(); fenderMaterial.side = THREE.DoubleSide;
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material = paint) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); return mesh;
  }
  function panel(width: number, front: number, back: number, frontY: number, backY: number, thickness: number, material = paint) {
    const geometry = new THREE.BoxGeometry(width, thickness, back - front);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const t = positions.getZ(i) / (back - front) + 0.5;
      positions.setY(i, frontY + (backY - frontY) * t + (positions.getY(i) > 0 ? 0 : -thickness));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = (front + back) / 2;
    mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); return mesh;
  }
  // A narrow centre section leaves genuine openings for the wide front/rear
  // tyres. Side skirts and arch strips widen the body without covering them.
  box(1.38, 0.4, 3.48, 0, -0.12, 0);
  for (const side of [-1, 1]) {
    box(0.32, 0.4, 1.42, side * 0.82, -0.1, 0.03);
    box(0.18, 0.045, 1.55, side * 0.96, -0.28, 0.03, carbon);
    for (const z of [-1.12, 1.15]) {
      const archPositions: number[] = []; const archIndices: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const angle = i * Math.PI / 16;
        for (const x of [0.70, 1.10]) archPositions.push(side * x, -0.08 + Math.sin(angle) * 0.48, z + Math.cos(angle) * 0.30);
        if (i < 16) { const a = i * 2; archIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const archGeometry = new THREE.BufferGeometry();
      archGeometry.setAttribute('position', new THREE.Float32BufferAttribute(archPositions, 3));
      archGeometry.setIndex(archIndices); archGeometry.computeVertexNormals();
      const fender = new THREE.Mesh(archGeometry, fenderMaterial); fender.castShadow = true; body.add(fender);
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
        const angle = i * Math.PI / 12;
        return new THREE.Vector3(side * 1.10, -0.08 + Math.sin(angle) * 0.48, z + Math.cos(angle) * 0.30);
      }));
      const arch = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 4, false), paint);
      arch.castShadow = true; body.add(arch);
    }
    // Side intake, mirrors, number panels and a geometric racing number 7.
    box(0.03, 0.18, 0.32, side * 0.991, 0.03, 0.60, carbon);
    box(0.12, 0.05, 0.09, side * 0.83, 0.65, -0.44, carbon);
    box(0.22, 0.11, 0.15, side * 0.98, 0.68, -0.44, dark);
    box(0.012, 0.31, 0.46, side * 0.986, 0.03, -0.02, ivory);
    box(0.017, 0.04, 0.25, side * 0.994, 0.13, -0.03, carbon);
    box(0.017, 0.24, 0.04, side * 0.994, 0.02, -0.06, carbon).rotation.x = -0.4;
    // Vent slats above each front wheel and brake ducts in the nose.
    for (let i = 0; i < 3; i++) box(0.22, 0.014, 0.045, side * 0.68, 0.35 + i * 0.015, -1.16 + i * 0.09, carbon);
    box(0.23, 0.14, 0.04, side * 0.65, -0.10, -1.835, carbon);
    box(0.43, 0.17, 0.05, side * 0.62, 0.17, -1.83, carbon);
    box(0.34, 0.05, 0.057, side * 0.62, 0.21, -1.833, lamp).rotation.z = side * 0.12;
    box(0.31, 0.035, 0.058, side * 0.62, 0.14, -1.834, lamp);
    box(0.48, 0.05, 0.04, side * 0.60, 0.13, 1.835, red);
  }
  box(1.82, 0.39, 0.26, 0, -0.025, -1.70);
  box(1.82, 0.39, 0.24, 0, -0.025, 1.71);
  panel(1.42, -1.76, -0.62, 0.16, 0.46, 0.1);
  panel(1.52, 0.98, 1.76, 0.44, 0.18, 0.1);
  panel(0.18, -1.75, -0.63, 0.172, 0.472, 0.006, ivory);
  panel(0.18, 0.98, 1.75, 0.452, 0.192, 0.006, ivory);

  // Raked windscreen and fastback rear window, rather than the off-road cabin.
  const cabin = new THREE.BufferGeometry();
  cabin.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.75, 0.43, -0.60, 0.75, 0.43, -0.60,
    -0.61, 1.15, -0.08, 0.61, 1.15, -0.08,
    -0.61, 1.12, 0.65, 0.61, 1.12, 0.65,
    -0.75, 0.43, 1.12, 0.75, 0.43, 1.12,
  ], 3));
  cabin.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 6, 7, 4, 7, 5, 4,
    0, 6, 2, 6, 4, 2, 1, 3, 7, 7, 3, 5, 0, 1, 6, 1, 7, 6]);
  cabin.computeVertexNormals(); const windows = new THREE.Mesh(cabin, glass); windows.castShadow = true; body.add(windows);
  panel(1.27, -0.09, 0.66, 1.17, 1.14, 0.07, carbon);
  panel(0.18, -0.09, 0.66, 1.182, 1.152, 0.006, ivory);
  for (const side of [-1, 1]) box(0.04, 0.56, 0.055, side * 0.67, 0.77, 0.32, carbon);

  // Splitter, rear diffuser and a large supported rear wing.
  box(1.94, 0.045, 0.24, 0, -0.265, -1.74, carbon);
  box(1.35, 0.14, 0.045, 0, -0.025, -1.837, carbon);
  box(1.85, 0.045, 0.26, 0, -0.265, 1.72, carbon);
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) box(0.035, 0.19, 0.30, x, -0.16, 1.68, carbon);
  for (const side of [-1, 1]) {
    box(0.075, 1.04, 0.12, side * 0.62, 0.82, 1.40, carbon);
    box(0.045, 0.25, 0.50, side * 1.02, 1.40, 1.40, paint);
    box(0.13, 0.09, 0.07, side * 0.18, -0.12, 1.85, metal);
  }
  box(2.05, 0.075, 0.42, 0, 1.38, 1.40, carbon).rotation.x = 0.10;
}
