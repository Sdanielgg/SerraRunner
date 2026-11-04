import * as THREE from 'three';
import type { VehicleSpec } from './vehicles';

type Materials = Record<'paint' | 'dark' | 'metal' | 'glass' | 'lamp' | 'red', THREE.MeshStandardMaterial>;
type Profile = number[][];

// Hermite sections keep the skin tangent continuous around the nose and arches.
function sample(profile: Profile, z: number, column: number) {
  let i = 0;
  while (i < profile.length - 2 && z > profile[i + 1][0]) i++;
  const a = profile[i]; const b = profile[i + 1];
  const previous = profile[Math.max(0, i - 1)]; const next = profile[Math.min(profile.length - 1, i + 2)];
  const length = b[0] - a[0]; const t = THREE.MathUtils.clamp((z - a[0]) / length, 0, 1);
  const m0 = (b[column] - previous[column]) / (b[0] - previous[0]);
  const m1 = (next[column] - a[column]) / (next[0] - a[0]);
  return (2 * t ** 3 - 3 * t * t + 1) * a[column] + (t ** 3 - 2 * t * t + t) * length * m0
    + (-2 * t ** 3 + 3 * t * t) * b[column] + (t ** 3 - t * t) * length * m1;
}

export function addGT3Body(body: THREE.Group, materials: Materials, spec: VehicleSpec) {
  const { paint, metal, lamp } = materials;
  paint.flatShading = false; paint.roughness = 0.28; paint.metalness = 0.22;
  const carbon = new THREE.MeshStandardMaterial({ color: '#151d22', roughness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: '#12232e', roughness: 0.14, metalness: 0.3 });
  const ivory = new THREE.MeshStandardMaterial({ color: '#f1ede0', roughness: 0.35 });
  const tail = new THREE.MeshStandardMaterial({ color: '#ed263c', emissive: '#d11326', emissiveIntensity: 0.8, roughness: 0.3 });
  const maxWidth = (spec.track + spec.wheelWidth / 2 + 0.025) / spec.widthScale;
  // z, width fraction, shoulder height, bonnet height.
  const sections = [
    [-1.88, .85, .24, .17], [-1.72, .88, .26, .25], [-1.46, .97, .43, .33],
    [-1.12, 1, .55, .39], [-.78, .94, .47, .45], [-.45, .87, .44, .48],
    [0, .86, .42, .44], [.55, .90, .46, .45], [.90, .98, .52, .47],
    [1.15, 1, .55, .49], [1.48, .97, .46, .45], [1.73, .89, .30, .32], [1.88, .85, .24, .23],
  ];
  const cabin = [[-.62, .49, .67], [-.43, .87, .65], [-.17, 1.12, .62],
    [.12, 1.18, .61], [.46, 1.14, .61], [.74, .98, .64], [1.09, .49, .70]];
  const widthAt = (z: number) => maxWidth * sample(sections, z, 1);
  const roundedEnd = (x: number, z: number) => z < -1.55
    ? z + .16 * (x / maxWidth) ** 2 * THREE.MathUtils.smoothstep(-z, 1.55, 1.88)
    : z - .07 * (x / maxWidth) ** 2 * THREE.MathUtils.smoothstep(z, 1.55, 1.88);
  const topAt = (z: number, u: number) => sample(sections, z, 3)
    + (sample(sections, z, 2) - sample(sections, z, 3)) * Math.abs(u) ** 1.7 - .08 * Math.abs(u) ** 8;
  const wheelY = -(spec.suspensionRest - 9.81 / (4 * spec.suspensionStiffness)) / spec.heightScale;
  const archY = (spec.wheelRadius + .045) / spec.heightScale;
  const archZ = (spec.wheelRadius + .045) / spec.lengthScale;
  function lowerEdge(z: number) {
    let y = -0.28;
    for (const axle of [-1.12, 1.15]) {
      const relative = (z - axle) / archZ;
      if (Math.abs(relative) < 1) y = Math.max(y, wheelY + archY * Math.sqrt(1 - relative * relative));
    }
    return y;
  }
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); return mesh;
  }
  function surface(name: string, rows: number, columns: number, point: (u: number, v: number) => THREE.Vector3, material: THREE.Material, reverse = false) {
    const positions: number[] = []; const indices: number[] = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
      const p = point(i / rows, j / columns); positions.push(p.x, p.y, p.z);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j; const b = a + columns + 1;
        if (reverse) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material = carbon) {
    const mesh = add('GT3 detail', new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); return mesh;
  }
  function tube(name: string, points: THREE.Vector3[], radius: number, material: THREE.Material, segments = 24) {
    return add(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false), material);
  }
  surface('GT3 continuous body shell', 144, 24, (t, v) => {
    const z = THREE.MathUtils.lerp(-1.88, 1.88, t); const u = v * 2 - 1;
    const x = widthAt(z) * u;
    return new THREE.Vector3(x, topAt(z, u), roundedEnd(x, z));
  }, paint);
  for (const side of [-1, 1]) {
    surface('GT3 integrated wheel arches', 192, 4, (t, v) => {
      const z = THREE.MathUtils.lerp(-1.88, 1.88, t);
      const x = side * widthAt(z) * (1 - .01 * v);
      return new THREE.Vector3(x, THREE.MathUtils.lerp(topAt(z, 1), lowerEdge(z), v), roundedEnd(x, z));
    }, paint, side < 0);
    for (const axle of [-1.12, 1.15]) {
      const points = Array.from({ length: 25 }, (_, i) => {
        const angle = i * Math.PI / 24; const z = axle + Math.cos(angle) * archZ;
        return new THREE.Vector3(side * widthAt(z) * .99, wheelY + Math.sin(angle) * archY, z);
      });
      tube('GT3 rolled arch lip', points, .009, paint);
    }
    box(.10, .045, 1.38, side * maxWidth * .85, -.278, .02);
  }
  box(1.25, .035, 3.50, 0, -.30, 0);
  // Roof, pillars and glazing all follow the same curved canopy surface.
  function canopy(z: number, angle: number, lift = 0) {
    return new THREE.Vector3(sample(cabin, z, 2) * Math.sin(angle), .43 + (sample(cabin, z, 1) - .43) * Math.cos(angle) + lift, z);
  }
  surface('GT3 wraparound glazing', 48, 32, (t, v) => canopy(THREE.MathUtils.lerp(-.62, 1.09, t), (v - .5) * Math.PI), glass);
  surface('GT3 curved roof', 24, 20, (t, v) => canopy(THREE.MathUtils.lerp(-.17, .52, t), (v - .5) * 1.72, .008), paint);
  surface('GT3 roof racing stripe', 24, 4, (t, v) => canopy(THREE.MathUtils.lerp(-.17, .52, t), (v - .5) * .22, .013), ivory);
  for (const side of [-1, 1]) {
    surface('GT3 sculpted rear roof pillar', 20, 12, (t, v) => {
      const angle = THREE.MathUtils.lerp(.86, Math.PI / 2, v) * side;
      const start = THREE.MathUtils.lerp(.53, .75, v);
      return canopy(THREE.MathUtils.lerp(start, 1.09, t), angle, .009);
    }, paint, side < 0);
    tube('GT3 A-pillar', Array.from({ length: 16 }, (_, i) => canopy(THREE.MathUtils.lerp(-.61, -.16, i / 15), side * .86, .009)), .022, paint);
    tube('GT3 C-pillar', Array.from({ length: 16 }, (_, i) => canopy(THREE.MathUtils.lerp(.51, 1.08, i / 15), side * .86, .009)), .025, paint);
    tube('GT3 window seal', Array.from({ length: 24 }, (_, i) => canopy(THREE.MathUtils.lerp(-.61, 1.08, i / 23), side * Math.PI / 2, .006)), .014, carbon);
    tube('GT3 door window frame', Array.from({ length: 8 }, (_, i) => canopy(.38, side * THREE.MathUtils.lerp(.86, Math.PI / 2, i / 7), .009)), .012, carbon, 10);
    const doorX = widthAt(.06) * .982;
    box(.012, .27, .43, side * (doorX + .007), .055, .06, ivory);
    box(.016, .035, .25, side * (doorX + .015), .145, .06, carbon);
    box(.016, .22, .033, side * (doorX + .015), .04, .035, carbon).rotation.x = -.38;
    box(.07, .035, .15, side * widthAt(.39) * .99, .28, .39, carbon);
    const seam = [[-.64,.32],[-.62,-.12],[-.47,-.23],[.51,-.23],[.65,-.14],[.65,.32]];
    tube('GT3 door shut line', seam.map(([z, y]) => new THREE.Vector3(side * widthAt(z) * .996, y, z)), .004, carbon, 28);
    const mirror = add('GT3 aerodynamic mirror', new THREE.SphereGeometry(1, 16, 8), carbon);
    mirror.scale.set(.13, .065, .095); mirror.position.set(side * .89, .65, -.40);
    tube('GT3 mirror stalk', [new THREE.Vector3(side * .67, .56, -.38), new THREE.Vector3(side * .80, .63, -.40), new THREE.Vector3(side * .88, .65, -.40)], .016, carbon, 8);
  }
  tube('GT3 windscreen wiper', [canopy(-.54, -.34, .018), canopy(-.38, -.04, .018), canopy(-.21, .25, .018)], .008, carbon, 12);
  for (const [from, to] of [[-1.80, -.62], [1.09, 1.80]]) {
    surface('GT3 body racing stripe', 32, 4, (t, v) => {
      const z = THREE.MathUtils.lerp(from, to, t); const u = (v - .5) * .18;
      return new THREE.Vector3(widthAt(z) * u, topAt(z, u) + .008, z);
    }, ivory);
  }
  function roundedRect(x: number, y: number, w: number, h: number, radius: number) {
    const shape = new THREE.Shape(); const l = x - w / 2; const r = x + w / 2; const b = y - h / 2; const t = y + h / 2;
    shape.moveTo(l + radius, b); shape.lineTo(r - radius, b); shape.quadraticCurveTo(r, b, r, b + radius);
    shape.lineTo(r, t - radius); shape.quadraticCurveTo(r, t, r - radius, t); shape.lineTo(l + radius, t);
    shape.quadraticCurveTo(l, t, l, t - radius); shape.lineTo(l, b + radius); shape.quadraticCurveTo(l, b, l + radius, b);
    return shape;
  }
  function bumper(rear: boolean) {
    const shape = roundedRect(0, -.055, maxWidth * 1.70, .43, .065);
    shape.holes.push(roundedRect(0, -.085, rear ? 1.20 : .78, .17, .035));
    if (!rear) for (const side of [-1, 1]) shape.holes.push(roundedRect(side * .62, -.085, .22, .17, .035));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .09, bevelEnabled: true, bevelSize: .014, bevelThickness: .012, bevelSegments: 2, curveSegments: 8 });
    if (rear) geometry.translate(0, 0, -.09);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const sweep = (rear ? -.07 : .16) * (positions.getX(i) / maxWidth) ** 2;
      positions.setZ(i, positions.getZ(i) + sweep);
    }
    geometry.computeVertexNormals();
    const mesh = add(rear ? 'GT3 sculpted rear bumper' : 'GT3 sculpted front bumper', geometry, paint);
    mesh.position.z = rear ? 1.88 : -1.88;
    surface('GT3 recessed grille', 32, 1, (u, v) => {
      const x = (u - .5) * maxWidth * 1.65;
      return new THREE.Vector3(x, THREE.MathUtils.lerp(-.20, .04, v), (rear ? 1.85 : -1.85) + (rear ? -.07 : .16) * (x / maxWidth) ** 2);
    }, carbon, !rear);
    const splitter = roundedRect(0, rear ? 1.76 : -1.76, maxWidth * 1.84, .40, .08);
    const splitterGeometry = new THREE.ExtrudeGeometry(splitter, { depth: .028, bevelEnabled: false, curveSegments: 8 });
    splitterGeometry.rotateX(Math.PI / 2); splitterGeometry.translate(0, -.267, 0);
    add(rear ? 'GT3 diffuser floor' : 'GT3 front splitter', splitterGeometry, carbon);
  }
  bumper(false); bumper(true);
  const headlightRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, .93, -.37).normalize());
  for (const side of [-1, 1]) {
    const headlight = new THREE.Group(); headlight.name = 'GT3 oval LED headlight';
    headlight.position.set(side * .73, topAt(-1.57, side * .73 / widthAt(-1.57)) + .035, -1.57);
    headlight.quaternion.copy(headlightRotation); body.add(headlight);
    headlight.scale.set(.85, .85, .70);
    const housing = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), carbon); housing.scale.set(.20, .235, .035); headlight.add(housing);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.MeshStandardMaterial({ color: '#34515d', roughness: .13, metalness: .35 }));
    lens.scale.set(.175, .209, .027); lens.position.z = .018; headlight.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 6, 32), lamp); ring.scale.set(.154, .183, .03); ring.position.z = .046; headlight.add(ring);
    for (const x of [-.062, .062]) for (const y of [-.068, .068]) {
      const projector = new THREE.Mesh(new THREE.SphereGeometry(.026, 10, 6), lamp); projector.scale.z = .4; projector.position.set(x, y, .047); headlight.add(projector);
    }
    for (let i = 0; i < 4; i++) {
      const z = -1.20 + i * .075; const x = side * .73;
      box(.18, .009, .026, x, topAt(z, x / widthAt(z)) + .009, z, carbon);
    }
  }
  tube('GT3 rear LED light bar', [new THREE.Vector3(-.82, .17, 1.82), new THREE.Vector3(-.64, .18, 1.90),
    new THREE.Vector3(0, .19, 1.905), new THREE.Vector3(.64, .18, 1.90), new THREE.Vector3(.82, .17, 1.82)], .018, tail, 40);
  for (let i = 0; i < 6; i++) {
    const z = 1.15 + i * .065; box(.81, .012, .025, 0, topAt(z, 0) + .008, z);
  }
  for (const x of [-.6, -.3, 0, .3, .6]) box(.026, .17, .29, x, -.20, 1.72);
  for (const x of [-.18, .18]) {
    const pipe = add('GT3 exhaust', new THREE.CylinderGeometry(.045, .05, .09, 16, 1, true), metal);
    pipe.rotation.x = Math.PI / 2; pipe.position.set(x, -.17, 1.91);
  }
  const wingProfile = new THREE.Shape();
  wingProfile.moveTo(.18, 0); wingProfile.quadraticCurveTo(.08, .055, -.14, .022);
  wingProfile.lineTo(-.18, .008); wingProfile.lineTo(-.18, -.013); wingProfile.quadraticCurveTo(.05, -.04, .18, 0);
  const span = maxWidth * 1.9;
  const wingGeometry = new THREE.ExtrudeGeometry(wingProfile, { depth: span, bevelEnabled: false, curveSegments: 12 });
  wingGeometry.rotateY(Math.PI / 2); wingGeometry.translate(-span / 2, 1.27, 1.45);
  add('GT3 rear airfoil', wingGeometry, carbon);
  for (const side of [-1, 1]) {
    const support = new THREE.Shape();
    const outline = [[1.50,.44], [1.42,.46], [1.23,1.13], [1.23,1.34], [1.49,1.35],
      [1.52,1.29], [1.43,1.29], [1.32,1.28], [1.32,1.15], [1.57,.46]];
    outline.forEach(([z, y], i) => { if (i === 0) support.moveTo(-z, y); else support.lineTo(-z, y); }); support.closePath();
    const geometry = new THREE.ExtrudeGeometry(support, { depth: .04, bevelEnabled: true, bevelSize: .006, bevelThickness: .005, bevelSegments: 2 });
    geometry.rotateY(Math.PI / 2); geometry.translate(side * .46 - .02, 0, 0);
    add('GT3 swan-neck wing support', geometry, carbon);
    box(.025, .19, .40, side * span / 2, 1.28, 1.45, carbon);
    const tow = add('GT3 tow eye', new THREE.TorusGeometry(.043, .009, 6, 16), tail); tow.position.set(side * .32, -.14, side * 1.94);
  }
  tube('GT3 roof antenna', [new THREE.Vector3(0, 1.17, .30), new THREE.Vector3(0, 1.34, .37)], .008, carbon, 4);
}

export function createGT3Wheel(spec: VehicleSpec, rubber: THREE.MeshStandardMaterial, metal: THREE.MeshStandardMaterial) {
  const wheel = new THREE.Group(); wheel.name = 'GT3 slick and centre-lock rim';
  rubber.flatShading = false;
  const r = spec.wheelRadius; const half = spec.wheelWidth / 2; const rimRadius = r * .70;
  const profile = [[.68,-1], [.89,-1], [.975,-.88], [1,-.60], [1,.60], [.975,.88], [.89,1], [.68,1], [.68,-1]];
  const tyreGeometry = new THREE.LatheGeometry(profile.map(([radius, width]) => new THREE.Vector2(r * radius, half * width)), 48);
  tyreGeometry.rotateZ(Math.PI / 2);
  const tyre = new THREE.Mesh(tyreGeometry, rubber); tyre.castShadow = true; wheel.add(tyre);
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#52636d', metalness: .65, roughness: .28 });
  const discMaterial = new THREE.MeshStandardMaterial({ color: '#717b80', metalness: .5, roughness: .65 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius, rimRadius, spec.wheelWidth * .85, 32, 1, true), rimMaterial);
  barrel.rotation.z = Math.PI / 2; wheel.add(barrel);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * .58, r * .58, spec.wheelWidth * .58, 32), discMaterial);
  disc.rotation.z = Math.PI / 2; wheel.add(disc);
  const spokePositions: number[] = []; const spokeIndices: number[] = [];
  const cube = new THREE.BoxGeometry(1, 1, 1); const vertices = cube.getAttribute('position'); const transform = new THREE.Object3D(); const p = new THREE.Vector3();
  function spoke(x: number, fromRadius: number, fromAngle: number, toRadius: number, toAngle: number) {
    const a = new THREE.Vector2(Math.cos(fromAngle) * fromRadius, Math.sin(fromAngle) * fromRadius);
    const b = new THREE.Vector2(Math.cos(toAngle) * toRadius, Math.sin(toAngle) * toRadius);
    transform.position.set(x, (a.x + b.x) / 2, (a.y + b.y) / 2);
    transform.rotation.set(Math.atan2(b.y - a.y, b.x - a.x), 0, 0); transform.scale.set(.025, a.distanceTo(b), .018); transform.updateMatrix();
    const base = spokePositions.length / 3;
    for (let i = 0; i < vertices.count; i++) { p.fromBufferAttribute(vertices, i).applyMatrix4(transform.matrix); spokePositions.push(p.x, p.y, p.z); }
    for (const index of cube.index!.array) spokeIndices.push(base + index);
  }
  for (const side of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, .010, 8, 40), metal); lip.rotation.y = Math.PI / 2; lip.position.x = side * (half + .003); wheel.add(lip);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      spoke(side * (half + .005), rimRadius * .13, angle, rimRadius * .49, angle);
      for (const branch of [-1, 1]) spoke(side * (half + .005), rimRadius * .46, angle, rimRadius * .95, angle + branch * .15);
    }
  }
  cube.dispose();
  const spokes = new THREE.BufferGeometry(); spokes.setAttribute('position', new THREE.Float32BufferAttribute(spokePositions, 3)); spokes.setIndex(spokeIndices); spokes.computeVertexNormals();
  wheel.add(new THREE.Mesh(spokes, rimMaterial));
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(r * .12, r * .12, spec.wheelWidth + .035, 6), metal); nut.rotation.z = Math.PI / 2; wheel.add(nut);
  return wheel;
}
