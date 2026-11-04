import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleSpec } from './vehicles';

type Materials = Record<'paint' | 'dark' | 'metal' | 'glass' | 'lamp' | 'red', THREE.MeshStandardMaterial>;
type Point = [number, number, number];

// Each model is authored in chassis space: front is -Z, wheels rotate about X.
// Bake static details into one mesh per material to keep multiplayer draw calls low.
export function batchModel(group: THREE.Group) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    // All primitives must expose the same attributes when merged.
    geometry.deleteAttribute('uv');
    const items = batches.get(object.material) ?? [];
    items.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    batches.set(object.material, items);
    object.geometry.dispose();
  });
  group.clear();
  batches.forEach((geometries, material) => {
    const merged = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) throw new Error('Unable to merge vehicle geometry');
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  });
}

function builder(body: THREE.Group) {
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: Point = [0, 0, 0]) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position); body.add(part); return part;
  }
  function box(size: Point, position: Point, material: THREE.Material, bevel = .015) {
    const [w, h, d] = size;
    if (!bevel) return mesh(new THREE.BoxGeometry(w, h, d), material, position);
    const r = Math.min(bevel, w / 4, h / 4, d / 4);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2 + r);
    shape.lineTo(w / 2 - r, -h / 2 + r); shape.lineTo(w / 2 - r, h / 2 - r);
    shape.lineTo(-w / 2 + r, h / 2 - r); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 2, steps: 1 });
    geometry.translate(0, 0, -d / 2 + r);
    return mesh(geometry, material, position);
  }
  function quad(points: Point[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
    return mesh(geometry, material);
  }
  function tube(points: Point[], radius: number, material: THREE.Material) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), Math.max(8, points.length * 2), radius, 6, false), material);
  }
  function disc(radius: number, depth: number, position: Point, material: THREE.Material) {
    const part = mesh(new THREE.CylinderGeometry(radius, radius, depth, 24), material, position);
    part.rotation.x = Math.PI / 2; return part;
  }
  return { box, quad, tube, disc, mesh };
}

function addRallyBody(body: THREE.Group, m: Materials, spec: VehicleSpec) {
  const { box, quad, tube, mesh } = builder(body);
  const white = new THREE.MeshStandardMaterial({ color: '#eeeee7', roughness: .32, metalness: .14, side: THREE.DoubleSide });
  m.lamp.side = THREE.DoubleSide; m.red.side = THREE.DoubleSide;
  // z, half-width, shoulder, bonnet/deck. Swollen arches blend into a short nose.
  const sections = [[-1.82,.73,.34,.38],[-1.62,.85,.49,.49],[-1.12,.98,.60,.57],[-.76,.88,.59,.64],
    [-.30,.83,.54,.58],[.30,.84,.54,.58],[.90,.97,.65,.62],[1.15,.99,.65,.66],[1.55,.89,.60,.67],[1.78,.79,.46,.56]];
  function sample(profile: number[][], z: number, column: number) {
    let i = 0; while (i < profile.length - 2 && z > profile[i + 1][0]) i++;
    const a = profile[i]; const b = profile[i + 1];
    const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    return THREE.MathUtils.lerp(a[column], b[column], t * t * (3 - 2 * t));
  }
  const scaleX = (spec.track + spec.wheelWidth * .48) / spec.widthScale;
  const widthAt = (z: number) => sample(sections, z, 1) * scaleX;
  const topAt = (z: number, u: number) => THREE.MathUtils.lerp(sample(sections, z, 3), sample(sections, z, 2), Math.abs(u) ** 1.6);
  const wheelY = -(spec.suspensionRest - 9.81 / (4 * spec.suspensionStiffness)) / spec.heightScale;
  const archY = (spec.wheelRadius + .045) / spec.heightScale;
  const archZ = (spec.wheelRadius + .055) / spec.lengthScale;
  function lower(z: number) {
    let y = -.13;
    for (const axle of [-1.12, 1.15]) {
      const t = (z - axle) / archZ;
      if (Math.abs(t) < 1) y = Math.max(y, wheelY + archY * Math.sqrt(1 - t * t));
    }
    return y;
  }
  function surface(rows: number, columns: number, point: (u: number, v: number) => Point, material: THREE.Material) {
    const positions: number[] = []; const indices: number[] = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
      positions.push(...point(i / rows, j / columns));
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j; const b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    return mesh(geometry, material);
  }
  surface(80, 12, (t, v) => {
    const z = THREE.MathUtils.lerp(-1.82, 1.78, t); const u = v * 2 - 1;
    return [widthAt(z) * u, topAt(z, u), z];
  }, white);
  for (const side of [-1, 1]) {
    surface(112, 5, (t, v) => {
      const z = THREE.MathUtils.lerp(-1.82, 1.78, t);
      return [side * widthAt(z) * (1 - .035 * v * v), THREE.MathUtils.lerp(topAt(z, 1), lower(z), v), z];
    }, white);
    for (const axle of [-1.12, 1.15]) tube(Array.from({ length: 25 }, (_, i): Point => {
      const angle = i * Math.PI / 24; const z = axle + archZ * Math.cos(angle);
      return [side * widthAt(z) * .965, wheelY + archY * Math.sin(angle), z];
    }), .025, white);
    box([.07, .065, 1.25], [side * .86, -.11, .03], m.dark);
  }
  const cabin = [[-.80,.64,.75],[-.57,1.08,.71],[-.29,1.51,.65],[.10,1.57,.64],[.61,1.51,.65],[.91,1.25,.69],[1.54,.66,.78]];
  function canopy(z: number, angle: number, lift = 0): Point {
    return [sample(cabin, z, 2) * Math.sin(angle), .55 + (sample(cabin, z, 1) - .55) * Math.pow(Math.max(0, Math.cos(angle)), .5) + lift, z];
  }
  surface(48, 24, (t, v) => canopy(THREE.MathUtils.lerp(-.80, 1.54, t), (v - .5) * Math.PI), m.glass);
  surface(28, 14, (t, v) => canopy(THREE.MathUtils.lerp(-.29, .65, t), (v - .5) * 1.85, .014), m.dark);
  for (const side of [-1, 1]) {
    tube(Array.from({ length: 12 }, (_, i) => canopy(THREE.MathUtils.lerp(-.79, -.28, i / 11), side * .98, .012)), .025, white);
    tube(Array.from({ length: 20 }, (_, i) => canopy(THREE.MathUtils.lerp(-.79, 1.53, i / 19), side * Math.PI / 2, .008)), .018, white);
    surface(20, 10, (t, v) => {
      const z = THREE.MathUtils.lerp(THREE.MathUtils.lerp(.67, .94, v), 1.54, t);
      return canopy(z, side * THREE.MathUtils.lerp(.92, Math.PI / 2, v), .016);
    }, white);
    tube(Array.from({ length: 8 }, (_, i) => canopy(.48, side * THREE.MathUtils.lerp(.96, Math.PI / 2, i / 7), .016)), .023, m.dark);
    tube([[-.71,.48,-.66],[-.74,-.05,-.51],[-.74,-.05,.62],[-.75,.49,.71]].map(([x,y,z]): Point => [side * -x * widthAt(z) / .83,y,z]), .005, m.dark);
    box([.035, .035, .17], [side * (widthAt(.50) + .014), .42, .50], m.dark);
    const mirror = mesh(new THREE.SphereGeometry(1, 12, 8), m.dark, [side * .89, .87, -.54]); mirror.scale.set(.14, .065, .10);
    tube([[side * .73,.75,-.55],[side * .87,.84,-.54]], .015, m.dark);
    quad([[side * .44,.43,-1.84],[side * .78,.45,-1.73],[side * .83,.59,-1.61],[side * .49,.55,-1.72]], m.lamp);
    quad([[side * .48,.51,1.795],[side * .78,.47,1.74],[side * .80,.61,1.70],[side * .49,.62,1.77]], m.red);
    surface(20, 4, (t, v) => {
      const z = THREE.MathUtils.lerp(.15 + .43 * v, 1.58, t);
      return [side * (widthAt(z) * (1 - .035 * (1-v)**2) + .006), THREE.MathUtils.lerp(Math.max(lower(z), -.06), sample(sections,z,2) - .015,v),z];
    }, m.paint);
    box([.032,.24,.28],[side * (widthAt(.02) + .014), .29,.02],m.dark);
    box([.036,.15,.035],[side * (widthAt(.02) + .019),.29,.02],white);
    box([.045,.32,.15],[side * .60,1.30,.98],m.dark);
    box([.25,.045,.45],[side * .79,-.14,1.48],m.dark);
  }
  // Deep central intake, sculpted cheeks, hatch spoiler and front splitter.
  quad([[-.73,-.08,-1.83],[.73,-.08,-1.83],[.74,.40,-1.82],[-.74,.40,-1.82]], white);
  quad([[-.57,-.055,-1.845],[.57,-.055,-1.845],[.45,.32,-1.845],[-.45,.32,-1.845]], m.dark);
  for (let i = -5; i <= 5; i++) box([.012,.24,.015],[i*.085,.12,-1.858],m.metal,0);
  for (const side of [-1,1]) box([.20,.19,.07],[side*.69,.14,-1.78],m.dark);
  box([1.58,.045,.20],[0,-.12,-1.75],m.dark);
  box([1.52,.30,.10],[0,.17,1.74],white);
  box([.85,.15,.025],[0,.13,1.80],m.dark);
  box([1.66,.07,.38],[0,1.46,.98],m.dark,.028);
  for (const side of [-1,1]) {
    box([.14,.015,.37],[side*.44,.59,-1.11],m.dark);
    tube([canopy(-.75,side*.7,.02),canopy(-.49,side*.25,.02)],.009,m.dark);
  }
  box([1.2,.10,2.7],[0,-.10,0],m.dark);
}

export function addTrailBody(body: THREE.Group, m: Materials, spec: VehicleSpec) {
  const crawler = spec.id === 'crawler';
  m.paint.flatShading = false; m.paint.roughness = .36; m.paint.metalness = .18;
  m.glass.color.set('#192f3b'); m.glass.roughness = .16;
  m.glass.side = THREE.DoubleSide; m.paint.side = THREE.DoubleSide;
  const trim = m.dark; trim.color.set('#191e21'); trim.flatShading = false; trim.side = THREE.DoubleSide;
  if (spec.id === 'rally') { addRallyBody(body, m, spec); return; }
  const bodyPaint = m.paint;
  const { box, quad, tube, disc } = builder(body);
  // Narrow cabin, wide shoulders and actual wheel cut-outs, sized to the physics axles.
  const width = (spec.track + spec.wheelWidth * .43) / spec.widthScale;
  const shoulder = .59;
  const wheelY = -(spec.suspensionRest - 9.81 / (4 * spec.suspensionStiffness)) / spec.heightScale;
  const archY = (spec.wheelRadius + .07) / spec.heightScale;
  const archZ = (spec.wheelRadius + .07) / spec.lengthScale;
  function lower(z: number) {
    let y = -.12;
    for (const axle of [-1.12, 1.15]) {
      const t = (z - axle) / archZ;
      if (Math.abs(t) < 1) y = Math.max(y, wheelY + archY * Math.sqrt(1 - t * t));
    }
    return y;
  }
  function widthAt(z: number) {
    return width * .96;
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 100; i++) {
      const a = -1.78 + i * 3.56 / 100; const b = -1.78 + (i + 1) * 3.56 / 100;
      quad([[side * widthAt(a), lower(a), a], [side * widthAt(b), lower(b), b],
        [side * widthAt(b), shoulder, b], [side * widthAt(a), shoulder, a]], bodyPaint);
    }
    for (const axle of [-1.12, 1.15]) {
      const points: Point[] = Array.from({ length: 25 }, (_, i) => {
        const t = i * Math.PI / 24; const z = axle + archZ * Math.cos(t);
        return [side * (widthAt(z) + .015), wheelY + archY * Math.sin(t), z];
      });
      tube(points, .055, trim);
    }
    box([.09, .09, 1.05], [side * width * .97, -.06, .02], trim);
  }
  quad([[-widthAt(-1.78), shoulder, -1.78], [widthAt(-1.78), shoulder, -1.78],
    [widthAt(1.78), shoulder, 1.78], [-widthAt(1.78), shoulder, 1.78]], bodyPaint);
  box([width * 1.8, .18, .13], [0, .03, -1.80], trim);
  box([width * 1.8, .17, .13], [0, .03, 1.80], trim);
  box([width * 1.78, shoulder + .06, .06], [0, shoulder / 2, -1.76], bodyPaint);
  box([width * 1.78, shoulder + .06, .06], [0, shoulder / 2, 1.76], bodyPaint);

  if (crawler) {
    // Wrangler TJ-inspired open tub, separate bonnet and exposed cage.
    box([1.35, .18, 1.13], [0, .64, -1.12], m.paint, .05);
    box([1.42, .23, 1.73], [0, .48, .55], m.paint);
    box([1.35, .32, .10], [0, .67, 1.63], m.paint);
    for (const side of [-1, 1]) {
      box([.10, .32, 1.19], [side * .68, .75, .94], m.paint);
      box([.47, .12, .49], [side * .35, .68, .19], trim);
      box([.47, .57, .13], [side * .35, .96, .47], trim).rotation.x = -.14;
      box([.27, .19, .14], [side * .35, 1.28, .50], trim, .05);
      tube([[side * .71, .60, -.45], [side * .68, 1.48, -.29], [side * .65, 1.57, .51], [side * .65, 1.12, 1.38]], .045, trim);
      tube([[side * .65, 1.57, .51], [side * .75, .64, 1.53]], .04, trim);
      tube([[side * .73, .57, -.36], [side * .78, .79, -.05], [side * .78, .79, .48], [side * .73, .57, .69]], .033, trim);
      disc(.135, .055, [side * .49, .52, -1.825], m.lamp);
      box([.13, .08, .04], [side * .69, .32, -1.82], m.red);
      box([.17, .15, .05], [side * .59, .68, 1.80], m.red);
      tube([[side * .73, -.13, -.62], [side * .92, -.13, -.50], [side * .92, -.13, .65], [side * .73, -.13, .76]], .04, trim);
    }
    quad([[-.67, .77, -.44], [.67, .77, -.44], [.64, 1.45, -.30], [-.64, 1.45, -.30]], m.glass);
    tube([[-.67, .74, -.45], [-.66, 1.49, -.30], [.66, 1.49, -.30], [.67, .74, -.45]], .045, m.paint);
    for (const z of [-.28, .51]) tube([[-.66, 1.53, z], [.66, 1.53, z]], .04, trim);
    tube([[-.65, .88, 1.37], [.65, 1.50, .51]], .028, trim);
    tube([[.65, .88, 1.37], [-.65, 1.50, .51]], .028, trim);
    for (let i = -3; i <= 3; i++) box([.055, .31, .035], [i * .105, .50, -1.81], trim);
    box([.50, .19, .23], [0, .21, -1.89], m.metal);
    disc(.10, .43, [0, .27, -1.90], trim).rotation.set(0, 0, Math.PI / 2);
    for (const side of [-1, 1]) tube([[side * .60, .08, -1.85], [side * .60, .40, -1.91], [side * .36, .46, -1.91]], .035, trim);
  } else {
    // Defender 90-inspired upright two-door body, inset bonnet and alpine roof.
    const ivory = new THREE.MeshStandardMaterial({ color: '#e5e4da', roughness: .38, side: THREE.DoubleSide });
    box([1.37, .15, 1.15], [0, .67, -1.10], m.paint, .025);
    const cabinX = .77; const topX = .69;
    for (const side of [-1, 1]) {
      quad([[side * cabinX, .59, -.48], [side * cabinX, .59, 1.65], [side * topX, 1.44, 1.65], [side * topX, 1.44, -.38]], m.paint);
      quad([[side * .769, .82, -.35], [side * .769, .82, .46], [side * .707, 1.35, .46], [side * .707, 1.35, -.29]], m.glass);
      quad([[side * .769, .84, .61], [side * .769, .84, 1.49], [side * .707, 1.33, 1.49], [side * .707, 1.33, .61]], m.glass);
      tube([[side * .78, .76, -.40], [side * .80, .05, -.40], [side * .80, .05, .52], [side * .78, 1.37, .52]], .005, trim);
      box([.035, .047, .15], [side * .785, .75, .32], trim);
      for (const y of [.30, .66]) box([.045, .06, .10], [side * .80, y, -.37], m.metal);
      tube([[side * .76, .84, -.37], [side * .97, .98, -.39]], .018, trim);
      box([.08, .22, .15], [side * 1.00, 1.01, -.39], trim, .025);
      disc(.135, .04, [side * .65, .54, -1.81], m.lamp);
      disc(.048, .045, [side * .86, .64, -1.81], m.lamp);
      disc(.044, .045, [side * .86, .45, -1.81], m.red);
      for (const y of [.31, .47]) disc(.055, .04, [side * .64, y, 1.81], m.red);
      box([.13, .035, 1.1], [side * .79, .60, -1.09], trim);
    }
    quad([[-.765, .77, -.49], [.765, .77, -.49], [.686, 1.40, -.38], [-.686, 1.40, -.38]], m.glass);
    tube([[-.77, .76, -.50], [-.69, 1.43, -.39], [.69, 1.43, -.39], [.77, .76, -.50]], .025, m.paint);
    box([1.57, .14, 2.16], [0, 1.49, .59], ivory, .045);
    box([1.50, .85, .06], [0, 1.02, 1.67], m.paint);
    box([1.24, .45, .02], [0, 1.15, 1.708], m.glass);
    box([.77, .40, .04], [0, .48, -1.80], trim);
    for (let i = -4; i <= 4; i++) box([.70, .012, .018], [0, .48 + i * .037, -1.83], m.metal, 0);
    for (const x of [-.48, .48]) tube([[x, .77, -.52], [x + .20, .99, -.49]], .008, trim);
  }
  // Modest underbody detail: geometry stays within the existing collision hull.
  box([1.20, .13, 2.63], [0, -.09, 0], trim);
}

export function createTrailWheel(spec: VehicleSpec, m: Materials) {
  const group = new THREE.Group(); const { mesh, box } = builder(group);
  const rally = spec.id === 'rally'; const r = spec.wheelRadius; const w = spec.wheelWidth;
  const profile = Array.from({ length: 17 }, (_, i) => {
    const angle = i * Math.PI * 2 / 16;
    return new THREE.Vector2(r * (.75 + .25 * Math.cos(angle)), w * .5 * Math.sin(angle));
  });
  mesh(new THREE.LatheGeometry(profile, 32), m.dark).rotation.z = Math.PI / 2;
  const rim = r * (rally ? .63 : .54);
  const metal = m.metal;
  const barrel = mesh(new THREE.CylinderGeometry(rim, rim, w * .83, 24), metal);
  barrel.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const x = side * w * .48;
    const well = mesh(new THREE.CylinderGeometry(rim * .89, rim * .89, .012, 24), m.dark, [x, 0, 0]);
    well.rotation.z = Math.PI / 2;
    for (let i = 0; i < (rally ? 10 : 5); i++) {
      const angle = i * Math.PI * 2 / (rally ? 10 : 5);
      const spoke = box([.02, rim * .76, rally ? .027 : .055], [x + side * .01, Math.cos(angle) * rim * .47, Math.sin(angle) * rim * .47], metal, 0);
      spoke.rotation.x = angle;
    }
    const cap = mesh(new THREE.CylinderGeometry(rim * .28, rim * .28, .035, 16), metal, [x + side * .02, 0, 0]);
    cap.rotation.z = Math.PI / 2;
    if (!rally) for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const bolt = mesh(new THREE.SphereGeometry(.013, 6, 4), metal, [x + side * .018, Math.cos(a) * rim * .92, Math.sin(a) * rim * .92]);
      bolt.scale.x = .5;
    }
  }
  for (let i = 0; i < (rally ? 28 : 24); i++) for (const side of [-1, 1]) {
    const a = i * Math.PI * 2 / (rally ? 28 : 24) + side * .04;
    const tread = box([w * .43, rally ? .014 : .035, r * (rally ? .10 : .18)], [side * w * .24, Math.cos(a) * r * .985, Math.sin(a) * r * .985], m.dark, 0);
    tread.rotation.x = a;
  }
  batchModel(group); return group;
}
