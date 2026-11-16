import * as THREE from 'three';
import type { Kit } from './kit';

/**
 * A long-range twin-engine business jet, modelled procedurally as a stand-in
 * until the client supplies an approved aircraft and livery.
 *
 * One coordinate system throughout, with no corrective rotations:
 *   X  span (right wing +X, left wing −X)
 *   Y  up
 *   Z  length (nose −Z, tail +Z)
 *
 * The surfaces are lofted, not assembled: the fuselage from elliptical
 * cross-sections, the wings, tailplane, fin and pylons from airfoil sections,
 * the nacelles and tyres as bodies of revolution.
 */

/** Height of the aircraft origin (fuselage centreline) above the ground on its wheels. */
export const GEAR = 2.0;

const PEARL = '#f2f0ea';
const GRAPHITE = '#22262b';
const CHAMPAGNE = '#c8a56a';
const NOSE = -8.5, LENGTH = 17;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Make triangle winding face outwards (positive enclosed volume), then compute normals. */
function finish(geo: THREE.BufferGeometry, weld: [number, number][] = []) {
  const pos = geo.attributes.position, idx = geo.index!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
  }
  geo.computeVertexNormals();
  // vertices duplicated along a texture seam share one normal, so the seam does not show
  const n = geo.attributes.normal;
  for (const [i, j] of weld) {
    a.fromBufferAttribute(n, i).add(b.fromBufferAttribute(n, j)).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
    n.setXYZ(j, a.x, a.y, a.z);
  }
  return geo;
}

/* ── Fuselage: elliptical cross-sections from nose to tail cone ── */

function fuselageGeometry() {
  // [z, half-width, half-height, centre height]
  const keys: [number, number, number, number][] = [
    [-8.5, 0.012, 0.012, -0.3], [-8.36, 0.13, 0.13, -0.29], [-8.0, 0.3, 0.3, -0.25], [-7.4, 0.5, 0.52, -0.18],
    [-6.6, 0.7, 0.76, -0.1], [-5.6, 0.86, 0.93, -0.03], [-4.6, 0.94, 0.98, 0], [-3, 0.955, 0.985, 0],
    [0, 0.955, 0.985, 0], [2.4, 0.95, 0.98, 0.01], [4, 0.87, 0.91, 0.07], [5.4, 0.7, 0.75, 0.18],
    [6.8, 0.46, 0.5, 0.31], [7.8, 0.24, 0.27, 0.41], [8.3, 0.1, 0.12, 0.46], [8.5, 0.012, 0.012, 0.48],
  ];
  const shape = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, 'centripetal');
  const lift = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[3], 0)), false, 'centripetal');
  const RINGS = 96, SEG = 48;
  const pos: number[] = [], uv: number[] = [], index: number[] = [], weld: [number, number][] = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let r = 0; r <= RINGS; r++) {
    shape.getPoint(r / RINGS, p);
    lift.getPoint(r / RINGS, q);
    const z = p.x, w = Math.max(p.y, 0.01), h = Math.max(p.z, 0.01);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2; // 0 roof · ¼ right · ½ belly · ¾ left
      pos.push(w * Math.sin(a), q.y + h * Math.cos(a), z);
      uv.push(s / SEG, (z - NOSE) / LENGTH);
    }
    weld.push([r * (SEG + 1), r * (SEG + 1) + SEG]);
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s, b = a + SEG + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return finish(geo, weld);
}

/* ── Lifting surfaces: lofted airfoil sections ── */

interface Section {
  /** Leading-edge point. The chord runs aft (+Z) from here. */
  le: THREE.Vector3Tuple;
  chord: number;
  /** Thickness as a fraction of chord. */
  t: number;
  /** Direction the airfoil's thickness is measured in. */
  up: THREE.Vector3Tuple;
}

/** Closed airfoil outline: upper surface trailing→leading edge, then lower back again. */
function airfoil(n: number, t: number, camber: number): [number, number][] {
  const pts: [number, number][] = [];
  const at = (x: number, side: number): [number, number] => {
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = camber * 4 * x * (1 - x);
    return [x, yc + side * yt];
  };
  for (let i = 0; i < n; i++) pts.push(at((1 + Math.cos((Math.PI * i) / (n - 1))) / 2, 1));
  for (let i = 1; i < n - 1; i++) pts.push(at((1 - Math.cos((Math.PI * i) / (n - 1))) / 2, -1));
  return pts;
}

function loft(sections: Section[], { steps = 6, camber = 0.018, n = 15 } = {}) {
  // subdivide between the given sections so the surface is smooth
  const dense: Section[] = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), UA = new THREE.Vector3(), UB = new THREE.Vector3();
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      dense.push({
        le: A.fromArray(a.le).lerp(B.fromArray(b.le), f).toArray(),
        chord: a.chord + (b.chord - a.chord) * f,
        t: a.t + (b.t - a.t) * f,
        up: UA.fromArray(a.up).lerp(UB.fromArray(b.up), f).normalize().toArray(),
      });
    }
  }
  dense.push(sections[sections.length - 1]);
  const pos: number[] = [], index: number[] = [];
  let ring = 0;
  for (const s of dense) {
    const outline = airfoil(n, s.t, camber);
    ring = outline.length;
    for (const [x, y] of outline) pos.push(s.le[0] + s.up[0] * y * s.chord, s.le[1] + s.up[1] * y * s.chord, s.le[2] + x * s.chord + s.up[2] * y * s.chord);
  }
  for (let r = 0; r < dense.length - 1; r++) {
    for (let s = 0; s < ring; s++) {
      const a = r * ring + s, b = r * ring + ((s + 1) % ring), c = a + ring, d = b + ring;
      index.push(a, c, b, b, c, d);
    }
  }
  // close both ends
  for (const r of [0, dense.length - 1]) {
    const s = dense[r], centre = pos.length / 3;
    pos.push(s.le[0], s.le[1], s.le[2] + s.chord * 0.5);
    for (let i = 0; i < ring; i++) {
      const a = r * ring + i, b = r * ring + ((i + 1) % ring);
      if (r === 0) index.push(centre, a, b);
      else index.push(centre, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  return finish(geo);
}

const mirror = (sections: Section[]): Section[] => sections.map((s) => ({ ...s, le: [-s.le[0], s.le[1], s.le[2]], up: [-s.up[0], s.up[1], s.up[2]] }));

/** A body of revolution about the Z axis from [radius, z] points. */
function revolve(profile: [number, number][], segments = 48) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return finish(geo);
}

export interface Aircraft {
  group: THREE.Group;
  /** The two engine fans; they turn about Z. */
  fans: THREE.Object3D[];
  /** 0 gear down … 1 retracted. */
  setGear(k: number): void;
}

export function createAircraftFactory(kit: Kit) {
  const { own, put, std } = kit;

  /* ── Paint: pearl, a graphite underside that sweeps up the tail, one champagne line ── */
  const cabinWindows = (g: CanvasRenderingContext2D, W: number, H: number, rim: string | null, glass: string) => {
    const Y = (z: number) => (1 - (z - NOSE) / LENGTH) * H;
    for (let i = 0; i < 10; i++) {
      const z = -4.45 + i * 0.68;
      for (const u of [0.218, 0.782]) {
        if (rim) {
          g.fillStyle = rim;
          g.beginPath();
          g.ellipse(u * W, Y(z), 0.0285 * W, 0.0145 * H, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = glass;
        g.beginPath();
        g.ellipse(u * W, Y(z), 0.0245 * W, 0.0122 * H, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  const livery = kit.paint(1024, 2048, (g, W, H) => {
    const Y = (z: number) => (1 - (z - NOSE) / LENGTH) * H;
    const Z = (y: number) => NOSE + (1 - y / H) * LENGTH;
    g.fillStyle = PEARL;
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const z = Z(y);
      const hb = (0.138 + 0.17 * smooth(3.2, 8.2, z)) * smooth(-8.3, -6.4, z);
      const band = (du0: number, du1: number, fill: string) => {
        g.fillStyle = fill;
        g.fillRect((0.5 - du1) * W, y, (du1 - du0) * W, 1.5);
        g.fillRect((0.5 + du0) * W, y, (du1 - du0) * W, 1.5);
      };
      band(0, hb, GRAPHITE);
      band(hb + 0.011, hb + 0.0165, CHAMPAGNE);
      band(hb + 0.027, hb + 0.0292, '#3a3f46');
    }
    // panel lines: frames, stringers, radome joint, doors
    g.strokeStyle = 'rgba(38, 44, 52, 0.17)';
    g.lineWidth = 1.6;
    for (const z of [-5.45, -4.85, -3.5, -2.14, -0.78, 0.58, 1.94, 3.3, 4.66, 6.0]) {
      g.beginPath(); g.moveTo(0, Y(z)); g.lineTo(W, Y(z)); g.stroke();
    }
    for (const u of [0.03, 0.97, 0.335, 0.665]) {
      g.beginPath(); g.moveTo(u * W, Y(-6.2)); g.lineTo(u * W, Y(5.6)); g.stroke();
    }
    g.strokeStyle = 'rgba(38, 44, 52, 0.4)';
    g.beginPath(); g.moveTo(0, Y(-7.78)); g.lineTo(W, Y(-7.78)); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.roundRect(0.705 * W, Y(-4.72), 0.105 * W, Y(-5.36) - Y(-4.72), 16); g.stroke(); // cabin door, left
    for (const u of [0.185, 0.757]) { g.beginPath(); g.roundRect(u * W, Y(0.86), 0.058 * W, Y(0.3) - Y(0.86), 8); g.stroke(); } // overwing exits
    cabinWindows(g, W, H, '#b6b9bd', '#0a0e14');
    // wrap-round cockpit glazing, drawn across the roof seam
    const screen: [number, number][] = [
      [-0.142, -5.74], [-0.147, -6.22], [-0.108, -6.74], [-0.04, -6.99], [0.04, -6.99], [0.108, -6.74], [0.147, -6.22], [0.142, -5.74], [0.07, -5.62], [-0.07, -5.62],
    ];
    for (const off of [0, 1]) {
      g.fillStyle = '#080b10';
      g.strokeStyle = '#080b10';
      g.lineJoin = 'round';
      g.lineWidth = 16;
      g.beginPath();
      screen.forEach(([du, z], i) => (i ? g.lineTo((du + off) * W, Y(z)) : g.moveTo((du + off) * W, Y(z))));
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = PEARL;
      for (const du of [0, -0.078, 0.078]) g.fillRect((du + off) * W - 3, Y(-5.6), 6, Y(du ? -6.82 : -7.02) - Y(-5.6));
    }
  });
  const cabin = kit.paint(512, 1024, (g, W, H) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    cabinWindows(g, W, H, null, '#ffd9a8');
  });

  const coat = { roughness: 0.36, metalness: 0.14, clearcoat: 0.6, clearcoatRoughness: 0.16 };
  const skin = own(new THREE.MeshPhysicalMaterial({ ...coat, map: livery, emissive: '#ffffff', emissiveMap: cabin, emissiveIntensity: 0 }));
  const pearl = own(new THREE.MeshPhysicalMaterial({ ...coat, color: PEARL }));
  const graphite = own(new THREE.MeshPhysicalMaterial({ ...coat, color: GRAPHITE, roughness: 0.38 }));
  const titanium = std('#aeb3b8', 0.32, 0.95);
  const polished = std('#d5d9dc', 0.24, 1);
  const dark = std('#0b0d10', 0.55, 0.6);
  const tyre = std('#101114', 0.92);
  const champagne = std(CHAMPAGNE, 0.26, 0.95);
  const beaconMat = kit.emissive('#ff2a1f', 1);
  const strobeMat = kit.emissive('#ffffff', 1);
  const portMat = kit.emissive('#ff3b30', 2.2);
  const starMat = kit.emissive('#39e58a', 2.2);

  /* ── Geometry ── */
  const UP: THREE.Vector3Tuple = [0, 1, 0];
  // right wing: root inside the fuselage, a kink, the tip, then a blended winglet
  const wing: Section[] = [
    { le: [0.55, -0.66, -1.75], chord: 4.5, t: 0.125, up: UP },
    { le: [2.7, -0.52, -0.25], chord: 2.9, t: 0.11, up: UP },
    { le: [7.35, -0.16, 3.05], chord: 1.25, t: 0.095, up: UP },
    { le: [7.72, -0.02, 3.42], chord: 1.02, t: 0.09, up: [-0.5, 0.87, 0] },
    { le: [7.98, 0.42, 3.82], chord: 0.8, t: 0.085, up: [-0.93, 0.36, 0] },
    { le: [8.08, 1.12, 4.4], chord: 0.46, t: 0.08, up: [-0.99, 0.12, 0] },
  ];
  const tailplane: Section[] = [
    { le: [0, 4.36, 5.6], chord: 1.95, t: 0.09, up: UP },
    { le: [3.35, 4.3, 7.35], chord: 0.82, t: 0.08, up: UP },
  ];
  const pylon: Section[] = [
    { le: [0.62, 0.5, 3.75], chord: 2.5, t: 0.1, up: UP },
    { le: [1.5, 0.6, 3.95], chord: 2.2, t: 0.1, up: UP },
  ];
  const SIDE: THREE.Vector3Tuple = [1, 0, 0];
  const g = {
    fuselage: own(fuselageGeometry()),
    wingR: own(loft(wing)),
    wingL: own(loft(mirror(wing))),
    tailR: own(loft(tailplane, { camber: 0 })),
    tailL: own(loft(mirror(tailplane), { camber: 0 })),
    fin: own(loft([
      { le: [0, 0.5, 2.7], chord: 5.0, t: 0.085, up: SIDE },
      { le: [0, 1.45, 3.75], chord: 3.9, t: 0.09, up: SIDE },
      { le: [0, 4.3, 5.75], chord: 2.15, t: 0.085, up: SIDE },
    ], { camber: 0 })),
    pylonR: own(loft(pylon, { steps: 2, camber: 0 })),
    pylonL: own(loft(mirror(pylon), { steps: 2, camber: 0 })),
    // nacelle shell: intake duct, lip, cowl, nozzle, and back inside the exhaust
    nacelle: own(revolve([
      [0.5, 0.62], [0.525, 0.2], [0.55, 0.05], [0.59, 0], [0.64, 0.05], [0.7, 0.3], [0.755, 0.95], [0.76, 1.6],
      [0.72, 2.5], [0.62, 3.3], [0.52, 3.9], [0.47, 4.02], [0.44, 3.96], [0.43, 3.4],
    ])),
    lip: own(revolve([[0.528, 0.19], [0.552, 0.045], [0.59, -0.004], [0.642, 0.045], [0.672, 0.19]])),
    nozzle: own(revolve([[0.628, 3.26], [0.525, 3.88], [0.472, 4.024], [0.438, 3.962], [0.428, 3.5]])),
    spinner: own(revolve([[0.004, 0.2], [0.07, 0.25], [0.14, 0.36], [0.19, 0.52], [0.2, 0.64]], 28)),
    plug: own(revolve([[0.3, 3.3], [0.27, 3.7], [0.14, 4.2], [0.01, 4.42]], 28)),
    fanFace: own(new THREE.CircleGeometry(0.52, 40)),
    bullet: own(revolve([[0.004, -1.1], [0.1, -0.86], [0.17, -0.4], [0.18, 0.2], [0.13, 0.9], [0.004, 1.5]], 24)),
    canoe: own(revolve([[0.004, -0.75], [0.09, -0.45], [0.12, 0], [0.09, 0.5], [0.004, 0.95]], 16)),
    tyre: own((() => {
      const t = new THREE.LatheGeometry([[0.2, -0.13], [0.33, -0.13], [0.375, -0.085], [0.385, 0], [0.375, 0.085], [0.33, 0.13], [0.2, 0.13]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
      t.rotateZ(Math.PI / 2);
      return finish(t);
    })()),
    hub: own((() => {
      const h = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 24);
      h.rotateZ(Math.PI / 2);
      return h;
    })()),
    oleo: own(new THREE.CylinderGeometry(0.05, 0.075, 0.9, 16)),
    brace: own(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 10)),
    lamp: kit.sphere(0.06, 12, 8),
  };

  const template = new THREE.Group();
  put(g.fuselage, skin, template);
  put(g.wingR, pearl, template);
  put(g.wingL, pearl, template);
  // flap-track fairings under each wing
  for (const s of [1, -1]) for (const [x, y, z] of [[2.1, -0.74, 2.0], [3.9, -0.58, 2.75], [5.7, -0.43, 3.5]]) put(g.canoe, graphite, template, s * x, y, z);

  // T-tail
  put(g.fin, pearl, template);
  put(g.tailR, pearl, template);
  put(g.tailL, pearl, template);
  put(g.bullet, graphite, template, 0, 4.36, 6.5);
  put(g.lamp, beaconMat, template, 0, 4.56, 6.3, false);

  // engines
  const fanBlade = own(new THREE.BoxGeometry(0.018, 0.34, 0.15));
  fanBlade.translate(0, 0.34, 0);
  const m4 = new THREE.Matrix4(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4();
  for (const s of [1, -1]) {
    put(s > 0 ? g.pylonR : g.pylonL, pearl, template);
    const eng = new THREE.Group();
    eng.position.set(s * 2.02, 0.62, 3.15);
    put(g.nacelle, pearl, eng);
    put(g.lip, polished, eng, 0, 0, -0.004, false);
    put(g.nozzle, titanium, eng, 0, 0, 0.004, false);
    put(g.plug, titanium, eng, 0, 0, 0, false);
    put(g.fanFace, dark, eng, 0, 0, 0.66, false).rotation.y = Math.PI;
    const fan = new THREE.Group();
    fan.name = s > 0 ? 'fanR' : 'fanL';
    fan.position.z = 0.58;
    const blades = new THREE.InstancedMesh(fanBlade, titanium, 22);
    for (let i = 0; i < 22; i++) {
      m4.copy(rz.makeRotationZ((i / 22) * Math.PI * 2)).multiply(ry.makeRotationY(0.62));
      blades.setMatrixAt(i, m4);
    }
    fan.add(blades);
    put(g.spinner, polished, fan, 0, 0, -0.52, false);
    eng.add(fan);
    template.add(eng);
  }

  // lights
  put(g.lamp, starMat, template, 7.42, -0.14, 3.2, false);
  put(g.lamp, portMat, template, -7.42, -0.14, 3.2, false);
  for (const s of [1, -1]) put(g.lamp, strobeMat, template, s * 8.08, 1.16, 4.72, false).scale.setScalar(0.8);
  put(g.lamp, beaconMat, template, 0, -1.0, 0.4, false);
  put(kit.box(0.012, 0.03, 1.7), champagne, template, 0.075, 3.0, 5.9, false).rotation.x = -0.62;
  put(kit.box(0.012, 0.03, 1.7), champagne, template, -0.075, 3.0, 5.9, false).rotation.x = -0.62;

  // landing gear — twin wheels on every leg; mains fold inwards, the nose leg folds forwards
  const legAssembly = (name: string, x: number, y: number, z: number, scale: number) => {
    const hinge = new THREE.Group();
    hinge.name = name;
    hinge.position.set(x, y, z);
    put(g.oleo, polished, hinge, 0, -0.42 * scale, 0).scale.setScalar(scale);
    put(g.brace, titanium, hinge, 0, -0.36 * scale, 0.2 * scale).rotation.x = 0.62;
    for (const w of [1, -1]) {
      put(g.tyre, tyre, hinge, w * 0.19 * scale, -0.87 * scale, 0).scale.setScalar(scale);
      put(g.hub, titanium, hinge, w * 0.19 * scale, -0.87 * scale, 0).scale.set(scale * 0.9, scale, scale);
    }
    template.add(hinge);
  };
  legAssembly('gearR', 1.55, -0.74, 1.15, 1);
  legAssembly('gearL', -1.55, -0.74, 1.15, 1);
  legAssembly('gearN', 0, -0.92, -6.3, 0.86);

  return {
    skin,
    beaconMat,
    strobeMat,
    /** Instances share geometry and materials. */
    create(): Aircraft {
      const group = template.clone(true);
      const r = group.getObjectByName('gearR')!, l = group.getObjectByName('gearL')!, n = group.getObjectByName('gearN')!;
      return {
        group,
        fans: [group.getObjectByName('fanR')!, group.getObjectByName('fanL')!],
        setGear(k: number) {
          const e = k * k * (3 - 2 * k);
          r.rotation.z = -e * 1.5;
          l.rotation.z = e * 1.5;
          n.rotation.x = e * 1.5;
          r.visible = l.visible = n.visible = k < 0.985;
        },
      };
    },
  };
}
