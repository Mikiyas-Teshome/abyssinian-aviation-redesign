import * as THREE from 'three';
import { rng, type Kit } from './kit';

const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, y: number, octaves = 5) => {
  let a = 0.5, s = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * vnoise(x, y);
    x = x * 2.03 + 17.7;
    y = y * 2.03 + 9.1;
    a *= 0.5;
  }
  return s;
};

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 1 inside the rectangle, falling to 0 over `fall` units outside it. */
const pad = (x: number, z: number, cx: number, cz: number, hx: number, hz: number, fall: number) => {
  const dx = Math.max(Math.abs(x - cx) - hx, 0);
  const dz = Math.max(Math.abs(z - cz) - hz, 0);
  return 1 - smooth(0, fall, Math.hypot(dx, dz));
};

/**
 * Highland relief: ridges either side of a broad valley that the route flies
 * down, levelled where the home airfield and the bush strip sit.
 */
export function groundHeight(x: number, z: number): number {
  const n = fbm(x * 0.0042, z * 0.0042);
  const r = 1 - Math.abs(2 * fbm(x * 0.0075 + 9, z * 0.0075 + 3, 4) - 1);
  let h = (n * 0.7 + r * r * 0.55) * 92;
  const valley = smooth(70, 300, Math.abs(x + 40 * Math.sin(z * 0.004)));
  h *= 0.1 + 0.9 * valley;
  const flat = Math.max(pad(x, z, 12, -150, 95, 215, 90), pad(x, z, 6, -1055, 34, 80, 60));
  return h * (1 - flat);
}

export function buildTerrain(kit: Kit) {
  const step = kit.lite ? 13 : 8;
  const x0 = -560, x1 = 560, z0 = 260, z1 = -1340;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z0 - z1) / step);
  const geo = kit.own(new THREE.PlaneGeometry(x1 - x0, z0 - z1, nx, nz));
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color('#4c4a33'), green = new THREE.Color('#2e3826'), earth = new THREE.Color('#5c4534');
  const rock = new THREE.Color('#4e4a48'), pale = new THREE.Color('#6d654f');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(groundHeight(x + 4, z) - h) + Math.abs(groundHeight(x, z + 4) - h);
    const v = fbm(x * 0.03, z * 0.03, 3);
    c.copy(grass).lerp(pale, v * 0.7);
    c.lerp(green, smooth(4, 26, h) * (0.5 + v * 0.5));
    c.lerp(earth, smooth(30, 62, h));
    c.lerp(rock, Math.max(smooth(2.2, 5.5, slope), smooth(70, 100, h)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, kit.std('#ffffff', 1, 0, { vertexColors: true }));
  mesh.receiveShadow = !kit.lite;
  return mesh;
}

/** Flat-topped acacias, scattered clear of the runways. */
export function buildTrees(kit: Kit) {
  const spots: [number, number, number][] = [];
  const r = rng(77);
  const tryPlace = (cx: number, cz: number, spread: number, n: number, keepOut: (x: number, z: number) => boolean) => {
    for (let i = 0, guard = 0; i < n && guard < n * 20; guard++) {
      const x = cx + (r() - 0.5) * spread * 2, z = cz + (r() - 0.5) * spread * 2;
      if (keepOut(x, z)) continue;
      spots.push([x, z, 0.75 + r() * 0.5]);
      i++;
    }
  };
  // home airfield: clear of runway, hangar apron and campus
  tryPlace(0, -150, 210, kit.lite ? 16 : 30, (x, z) => (Math.abs(x) < 24 && z < 60) || (x > 20 && x < 72 && z < -60 && z > -205) || (Math.abs(x) < 34 && z > 0 && z < 60));
  // bush strip
  tryPlace(0, -1055, 90, kit.lite ? 7 : 13, (x, z) => Math.abs(x) < 16 || (x > 8 && x < 30 && z < -1070 && z > -1112));

  const trunk = kit.own(new THREE.CylinderGeometry(0.1, 0.2, 4.4, 6));
  const crown = kit.own(new THREE.SphereGeometry(1, 9, 6));
  const trunks = new THREE.InstancedMesh(trunk, kit.mats.bark, spots.length);
  const crowns = new THREE.InstancedMesh(crown, kit.mats.leaf, spots.length * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z, k], i) => {
    const y = groundHeight(x, z);
    m.compose(p.set(x, y + 2.2 * k, z), q.identity(), s.set(k, k, k));
    trunks.setMatrixAt(i, m);
    m.compose(p.set(x, y + 4.7 * k, z), q, s.set(4.4 * k, 0.42 * k, 4.4 * k));
    crowns.setMatrixAt(i * 2, m);
    m.compose(p.set(x + 1.6 * k, y + 5.5 * k, z - 0.9 * k), q, s.set(2.7 * k, 0.32 * k, 2.7 * k));
    crowns.setMatrixAt(i * 2 + 1, m);
  });
  trunks.castShadow = crowns.castShadow = !kit.lite;
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}
