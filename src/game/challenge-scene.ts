import * as THREE from 'three';
import { batchModel } from './trail-models';
import { challengeBlocks, challengeGates, challengeHalfWidthAt, challengeHeightAt, challengeRacingLine, challengeRails, challengeSamples, challengeTunnel } from './challenge-course';

export function createChallengeScene() {
  const group = new THREE.Group(); group.name = 'Desafio da Serra'; group.visible = false;
  const scenery = new THREE.Group(); group.add(scenery);
  const asphalt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide });
  const pale = new THREE.MeshStandardMaterial({ color: '#e5e2d4', roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#273235', roughness: .9 });
  const amber = new THREE.MeshStandardMaterial({ color: '#edb45b', roughness: .7 });
  const red = new THREE.MeshStandardMaterial({ color: '#be5241', roughness: .9 });
  const positions: number[] = []; const colors: number[] = []; const indices: number[] = [];
  for (let i = 0; i <= challengeSamples.length; i++) {
    const p = challengeSamples[i % challengeSamples.length];
    const color = new THREE.Color(i >= 346 && i <= 596 ? '#94765a' : '#454c4d');
    for (let col = 0; col <= 14; col++) {
      const offset = (col - 7) / 7 * challengeHalfWidthAt(p);
      const x = p.x + p.nx * offset; const z = p.z + p.nz * offset;
      positions.push(x, challengeHeightAt(x, z) + .025, z); colors.push(color.r, color.g, color.b);
      if (i < challengeSamples.length && col < 14) {
        const a = i * 15 + col; const b = a + 15; indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const roadGeometry = new THREE.BufferGeometry(); roadGeometry.setIndex(indices);
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, asphalt); road.receiveShadow = true; group.add(road);
  function box(parent: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material, yaw = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position); mesh.rotation.y = yaw;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  challengeRails.forEach((rail, i) => {
    box(scenery, [.3, .7, rail.length], [rail.x, challengeHeightAt(rail.x, rail.z) + .35, rail.z], Math.floor(i / 10) % 2 ? pale : dark, rail.yaw);
  });
  for (const block of challengeBlocks) {
    box(scenery, [block.width, block.height, block.depth], [block.x, block.height / 2, block.z], red);
    for (const x of [-2, 0, 2]) box(scenery, [.65, .13, block.depth + .015], [block.x + x, .48, block.z], pale);
  }
  // Ground arrows show the route, including the open side of each slalom block.
  const arrowMaterial = new THREE.MeshStandardMaterial({ color: '#e8dfc2', side: THREE.DoubleSide });
  for (let i = 8; i < challengeSamples.length; i += 9) {
    const p = challengeRacingLine[i]; const next = challengeRacingLine[(i + 3) % challengeRacingLine.length]; const arrow = new THREE.Shape();
    arrow.moveTo(-.55, -.8); arrow.lineTo(0, .65); arrow.lineTo(.55, -.8); arrow.closePath();
    const geometry = new THREE.ShapeGeometry(arrow); geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, arrowMaterial);
    mesh.position.set(p.x, challengeHeightAt(p.x, p.z) + .045, p.z); mesh.rotation.y = Math.atan2(next.x - p.x, next.z - p.z) + Math.PI;
    scenery.add(mesh);
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
    box(scenery, [1, .01, .65], [-206.5 + col, .04, 124 + row * .65], (row + col) % 2 ? pale : dark);
  }
  // Broad shoulders around the ramp make its height readable from the chase camera.
  for (const z of [-112,-102,-92,44,64,84,94,106,118]) for (const side of [-1, 1]) {
    box(scenery, [.2, 1, .2], [-90 + side * 7, challengeHeightAt(-90 + side * 7, z) + .5, z], amber);
  }
  const tunnel = challengeTunnel;
  for (const side of [-1,1]) box(scenery, [.35,tunnel.clearance,tunnel.length], [tunnel.x + side*tunnel.halfWidth,tunnel.clearance/2,tunnel.z], dark);
  box(scenery, [tunnel.halfWidth*2+.35,.25,tunnel.length], [tunnel.x,tunnel.clearance+.125,tunnel.z], dark);
  for (const z of [-47,-23]) {
    for (const side of [-1,1]) box(scenery, [.45,tunnel.clearance,.2], [tunnel.x+side*tunnel.halfWidth,tunnel.clearance/2,z], amber);
    box(scenery, [tunnel.halfWidth*2+.45,.3,.2], [tunnel.x,tunnel.clearance,z], amber);
  }
  for (const z of [-70,-82,-94]) for (const side of [-1,1]) {
    box(scenery, [.25,1.1,.3], [-200+side*2.9,.55,z], dark);
  }
  batchModel(scenery);
  const gateMaterials = challengeGates.map((gate, index) => {
    const frame = new THREE.Group(); frame.position.set(gate.x, challengeHeightAt(gate.x, gate.z), gate.z);
    frame.rotation.y = Math.atan2(gate.dx, gate.dz); group.add(frame);
    const material = new THREE.MeshStandardMaterial({ color: '#566366', roughness: .65, emissive: '#000000' });
    for (const side of [-1, 1]) box(frame, [.16, 4.2, .16], [side * gate.halfWidth, 2.1, 0], material);
    box(frame, [gate.halfWidth * 2 + .16, .25, .24], [0, 4.2, 0], material);
    // Small geometric numerals work in native GL without canvas/font textures.
    const segments = [[0,.24,.21,.035],[.12,.12,.035,.21],[.12,-.12,.035,.21],[0,-.24,.21,.035],[-.12,-.12,.035,.21],[-.12,.12,.035,.21],[0,0,.21,.035]];
    const digits = ['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
    String(index + 1).split('').forEach((digit, digitIndex, all) => {
      [...digits[Number(digit)]].forEach((on, segment) => {
        if (on !== '1') return;
        const [x,y,w,h] = segments[segment]; box(frame, [w,h,.03], [x + (digitIndex - (all.length - 1) / 2) * .38, 4.65 + y, 0], material);
      });
    });
    batchModel(frame); return material;
  });
  let previous = -1;
  return {
    group,
    update(passed: number) {
      if (passed === previous) return;
      previous = passed;
      gateMaterials.forEach((material, index) => {
        material.color.set(index < passed ? '#78a47a' : index === passed ? '#ffd17c' : '#647071');
        material.emissive.set(index === passed ? '#8c5b1b' : '#000000');
      });
    },
  };
}
