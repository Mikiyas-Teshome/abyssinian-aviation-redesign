import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  // gullies and benches: the detail that stops a hill reading as a smooth dome
  h += (fbm(x * 0.021, z * 0.021, 4) - 0.5) * 7 * smooth(3, 26, h);
  h += (fbm(x * 0.075, z * 0.075, 3) - 0.5) * 1.8;
  const flat = Math.max(pad(x, z, 12, -150, 95, 215, 90), pad(x, z, 6, -1055, 34, 80, 60));
  return h * (1 - flat);
}

/**
 * The ground's heights, sampled once on the mesh grid. Everything that has to
 * sit on the visible surface (grass, rocks, trees, the cloud deck's clearance)
 * reads this instead of re-evaluating the noise stack, and gets the height of
 * the triangles actually drawn rather than of the smooth function behind them.
 */
let surface: { x0: number; z0: number; dx: number; dz: number; nx: number; nz: number; h: Float32Array } | null = null;

/** Height of the drawn ground at (x, z); exact noise outside the meshed area. */
export function surfaceHeight(x: number, z: number): number {
  if (!surface) return groundHeight(x, z);
  const { x0, z0, dx, dz, nx, nz, h } = surface;
  const fx = (x - x0) / dx, fz = (z0 - z) / dz;
  if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return groundHeight(x, z);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const row = nx + 1;
  const a = h[iz * row + ix], b = h[iz * row + ix + 1], c = h[(iz + 1) * row + ix], d = h[(iz + 1) * row + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function buildTerrain(kit: Kit) {
  const step = kit.lite ? 13 : 8;
  const x0 = -560, x1 = 560, z0 = 260, z1 = -1340;
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z0 - z1) / step);
  const dx = (x1 - x0) / nx, dz = (z0 - z1) / nz;
  const row = nx + 1;

  // one evaluation of the noise stack per grid point — the slow part, done once
  const H = new Float32Array(row * (nz + 1));
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) H[iz * row + ix] = groundHeight(x0 + ix * dx, z0 - iz * dz);
  surface = { x0, z0, dx, dz, nx, nz, h: H };
  const at = (ix: number, iz: number) => H[Math.min(nz, Math.max(0, iz)) * row + Math.min(nx, Math.max(0, ix))];
  const reach = Math.max(1, Math.round(14 / step));

  const geo = kit.own(new THREE.PlaneGeometry(x1 - x0, z0 - z1, nx, nz));
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // highland dry season: bleached grass over red earth, basalt where it is steep
  const straw = new THREE.Color('#6b6144'), scrub = new THREE.Color('#3f4530'), earth = new THREE.Color('#6b4733');
  const basalt = new THREE.Color('#4a4642'), dust = new THREE.Color('#857a5e');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ix = Math.round((x - x0) / dx), iz = Math.round((z0 - z) / dz);
    const h = at(ix, iz);
    pos.setY(i, h);
    // slope from the neighbouring grid points, scaled to the same 4-unit baseline as before
    const slope = (Math.abs(at(ix + 1, iz) - h) + Math.abs(at(ix, iz - 1) - h)) * (4 / step);
    // patchiness at three scales, so no two hillsides look alike
    const v = fbm(x * 0.03, z * 0.03, 3);
    const w = fbm(x * 0.006 + 31, z * 0.006 + 7, 3);
    const fine = fbm(x * 0.14, z * 0.14, 2);
    c.copy(straw).lerp(dust, v * 0.55 + fine * 0.2);
    c.lerp(scrub, smooth(0.25, 0.68, w) * (0.35 + v * 0.5));
    c.lerp(earth, smooth(26, 58, h) * 0.8);
    c.lerp(basalt, Math.max(smooth(2.6, 6.5, slope), smooth(72, 104, h)));
    // valleys hold a little more shade than ridges: a cheap ambient occlusion
    const around = (at(ix + reach, iz) + at(ix - reach, iz) + at(ix, iz + reach) + at(ix, iz - reach)) / 4;
    c.multiplyScalar(0.84 + 0.16 * smooth(-5, 5, h - around) + fine * 0.07);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const spanX = x1 - x0, spanZ = z0 - z1;
  const detail = kit.bump(spanX / 26, true, spanZ / spanX);
  const rough = kit.grain(spanX / 19, spanZ / spanX);
  const mesh = new THREE.Mesh(geo, kit.std('#ffffff', 1, 0, {
    vertexColors: true,
    normalMap: detail,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: rough,
    dithering: true,
  }));
  mesh.receiveShadow = !kit.lite;
  ;(mesh.material as THREE.MeshStandardMaterial).onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvUp = objectNormal.y;')
      .replace('varying vec3 vGround;', 'varying vec3 vGround;\nvarying float vUp;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGround;
        float gh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }
        float gf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * gn(p); p = p * 2.07 + 11.3; a *= 0.5; } return s / 0.875; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // three scales of break-up: field-sized patches, clumps, and grit
        float g1 = gf(vGround.xz * 0.032);
        float g2 = gf(vGround.xz * 0.24 + 7.0);
        float g3 = gn(vGround.xz * 1.9);
        diffuseColor.rgb *= 0.8 + 0.34 * g1 + 0.18 * (g2 - 0.5) + 0.12 * (g3 - 0.5);
        // greener hollows and paler, sun-bleached patches
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.94, 0.7), smoothstep(0.56, 0.76, g2) * 0.45);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.92), smoothstep(0.62, 0.8, g1) * 0.35);
        // exposed rock on steep ground: bedding planes, and darker joints between them
        float steep = smoothstep(0.9, 0.66, vUp);
        float bed = gn(vec2(vGround.y * 1.3 + gn(vGround.xz * 0.08) * 3.0, (vGround.x + vGround.z) * 0.04));
        float joint = smoothstep(0.08, 0.0, abs(fract(vGround.y * 0.32 + g2 * 2.2 + g1 * 1.5) - 0.5) - 0.44) * smoothstep(0.35, 0.7, g2);
        vec3 rock = vec3(0.4, 0.37, 0.33) * (0.85 + 0.3 * bed) * (1.0 - 0.14 * joint);
        diffuseColor.rgb = mix(diffuseColor.rgb, rock * (0.9 + 0.2 * g3), steep * 0.7);`)
      .replace('varying vec3 vGround;\n        float gh', 'varying vec3 vGround;\n        varying float vUp;\n        float gh');
  };
  return mesh;
}

/** Flat-topped acacias, scattered clear of the runways. */
/**
 * Dry-season highland grass: tufts of straw and olive blades, three crossed
 * cards each, alpha-tested, lit as if they were the ground they grow from and
 * stirring slightly in the wind. Placed in patches, thick along the runway and
 * strip edges where the camera sits low.
 */
export function buildGrass(kit: Kit) {
  const r = rng(909);
  const tex = kit.paint(256, 256, (ctx, W, H) => {
    const p = rng(77);
    ctx.clearRect(0, 0, W, H);
    const tones = [[168, 145, 90], [194, 173, 120], [128, 120, 70], [98, 104, 62], [150, 128, 78]];
    for (let i = 0; i < 90; i++) {
      const x0 = W * 0.5 + (p() - 0.5) * W * 0.8;
      const lean = (p() - 0.5) * W * 0.42;
      const h = H * (0.35 + p() * 0.62);
      const w = 1.6 + p() * 3.4;
      const [cr, cg, cb] = tones[Math.floor(p() * tones.length)];
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, `rgb(${cr * 0.74 | 0},${cg * 0.72 | 0},${cb * 0.66 | 0})`);
      g.addColorStop(0.55, `rgb(${cr},${cg},${cb})`);
      g.addColorStop(1, `rgb(${Math.min(255, cr * 1.18) | 0},${Math.min(255, cg * 1.15) | 0},${cb * 1.05 | 0})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - w, H);
      ctx.quadraticCurveTo(x0 + lean * 0.25, H - h * 0.62, x0 + lean, H - h);
      ctx.quadraticCurveTo(x0 + lean * 0.25 + w * 0.4, H - h * 0.6, x0 + w, H);
      ctx.fill();
    }
  });
  tex.colorSpace = THREE.SRGBColorSpace;

  // three cards crossed at 60°, normals pointing up so a tuft lights like the ground under it
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let v = 0; v < 4; v++) nrm.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = kit.own(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);

  const time = { value: 0 };
  const mat = kit.std('#ffffff', 0.95, 0, { map: tex, alphaTest: 0.42, side: THREE.DoubleSide, alphaToCoverage: !kit.lite, emissive: '#ffe7b8', emissiveMap: tex, emissiveIntensity: 0.12 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float bend = transformed.y * transformed.y;
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float phase = root.x * 0.31 + root.z * 0.23;
        transformed.x += sin(uWind * 1.5 + phase) * 0.07 * bend;
        transformed.z += cos(uWind * 1.2 + phase * 1.4) * 0.05 * bend;`);
  };

  const spots: [number, number, number][] = [];
  const field = (x0: number, x1: number, z0: number, z1: number, n: number, keep: (x: number, z: number) => number) => {
    for (let i = 0, guard = 0; i < n && guard < n * 25; guard++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      const k = keep(x, z);
      if (k <= 0 || r() > k) continue;
      spots.push([x, z, 0.45 + r() * 0.75]);
      i++;
    }
  };
  // patchiness, so grass grows in clumps rather than an even carpet
  const patch = (x: number, z: number) => smooth(0.35, 0.62, fbm(x * 0.06 + 13, z * 0.06 + 2, 3));
  const homeClear = (x: number, z: number) =>
    (Math.abs(x) < 11.5 && z < 12 && z > -342) || // runway
    (Math.abs(x) < 33 && z > 7 && z < 53) || // apron and hangar
    (x > 15 && x < 75 && z < -71 && z > -209) || // campus
    (Math.abs(x + 13.5) < 3.5 && z < -54 && z > -226 && Math.abs(((z + 60) % 40 + 40) % 40) < 6); // programme boards
  const nearRunway = (x: number) => 1 - smooth(14, 70, Math.abs(x));
  field(-150, 150, -360, 95, kit.lite ? 4000 : 9000, (x, z) => (homeClear(x, z) ? 0 : (0.35 + 0.65 * nearRunway(x)) * (0.4 + 0.6 * patch(x, z))));
  field(-60, 60, -1135, -975, kit.lite ? 1600 : 3600, (x, z) =>
    Math.abs(x) < 9 || (x > 11 && x < 27 && z > -1112 && z < -1080) || (x > 12 && x < 17 && z > -1014 && z < -1006) ? 0 : 0.5 + 0.5 * patch(x, z));

  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(spots.length, 1));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  spots.forEach(([x, z, k], i) => {
    q.setFromEuler(e.set((r() - 0.5) * 0.18, r() * Math.PI, (r() - 0.5) * 0.18));
    m.compose(v.set(x, surfaceHeight(x, z) - 0.04, z), q, sc.set(k * (1.1 + r() * 0.6), k * (0.75 + r() * 0.5), k * (1.1 + r() * 0.6)));
    mesh.setMatrixAt(i, m);
    const t = 0.72 + r() * 0.45;
    mesh.setColorAt(i, c.setRGB(t * (0.95 + r() * 0.1), t, t * (0.85 + r() * 0.15)));
  });
  mesh.receiveShadow = !kit.lite;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  return {
    mesh,
    /** Translucency: dry blades glow a little in daylight, not at all at night. */
    update(t: number, light: number) {
      time.value = t;
      mat.emissiveIntensity = 0.16 * light;
    },
  };
}

/** Loose rock and low scrub, scattered where the camera actually passes. */
export function buildScatter(kit: Kit) {
  const r = rng(404);
  const group = new THREE.Group();
  const rockGeo = kit.own(new THREE.IcosahedronGeometry(1, 1));
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const n = 0.68 + fbm(rp.getX(i) * 2.2 + 5, rp.getZ(i) * 2.2 + 9, 2) * 0.72;
    rp.setXYZ(i, rp.getX(i) * n, rp.getY(i) * n * 0.7, rp.getZ(i) * n);
  }
  rockGeo.computeVertexNormals();
  const bushGeo = kit.own(new THREE.IcosahedronGeometry(1, 1));
  const bp = bushGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const n = 0.62 + fbm(bp.getX(i) * 3.4 + 2, bp.getZ(i) * 3.4 + 4, 2) * 0.86;
    bp.setXYZ(i, bp.getX(i) * n, bp.getY(i) * n * 0.55, bp.getZ(i) * n);
  }
  bushGeo.computeVertexNormals();

  const spots: [number, number, number, number][] = []; // x, z, scale, kind
  const field = (cx: number, cz: number, sx: number, sz: number, n: number, clear: (x: number, z: number) => boolean) => {
    for (let i = 0, guard = 0; i < n && guard < n * 18; guard++) {
      const x = cx + (r() - 0.5) * 2 * sx, z = cz + (r() - 0.5) * 2 * sz;
      if (clear(x, z)) continue;
      spots.push([x, z, 0.5 + r() * 1.5, r() < 0.45 ? 0 : 1]);
      i++;
    }
  };
  const nearHome = (x: number, z: number) => (Math.abs(x) < 17 && z < 40 && z > -350) || (x > 16 && x < 72 && z < -60 && z > -200);
  field(0, -150, 170, 240, kit.lite ? 90 : 240, nearHome);
  field(0, -1050, 80, 110, kit.lite ? 40 : 110, (x) => Math.abs(x) < 11);

  const rocks = spots.filter((s) => s[3] === 0), bushes = spots.filter((s) => s[3] === 1);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, list: typeof spots, lift: number, flat: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), c = new THREE.Color();
    list.forEach(([x, z, k], i) => {
      q.setFromEuler(e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5));
      m.compose(v.set(x, surfaceHeight(x, z) + k * lift, z), q, v.clone().set(k, k * flat, k));
      mesh.setMatrixAt(i, m);
      const t = 0.72 + r() * 0.56;
      mesh.setColorAt(i, c.setRGB(t, t * (0.97 + r() * 0.08), t * 0.92));
    });
    mesh.castShadow = mesh.receiveShadow = !kit.lite;
    return mesh;
  };
  group.add(make(rockGeo, kit.mats.concrete, rocks, 0.18, 0.7));
  // scrub is olive and dusty in the dry season, not black
  group.add(make(bushGeo, kit.std('#5d6340', 0.95, 0, { roughnessMap: kit.grain(3), normalMap: kit.bump(2, true), normalScale: new THREE.Vector2(1.1, 1.1) }), bushes.filter((_, i) => i % 2 === 0), 0.3, 0.8));
  return group;
}

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

  // ── One umbrella thorn, built once and instanced ──
  // A short trunk that forks into three or four limbs, each carrying a flat,
  // ragged pad of foliage; the pads together make the level umbrella these
  // trees are known for, with sky showing through between them.
  const t = rng(17);
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) => {
    const dir = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(r1, r0, dir.length(), 6, 1);
    g.translate(0, dir.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g.translate(from.x, from.y, from.z);
    return g;
  };
  const fork = new THREE.Vector3(0.15, 2.1, 0.05);
  const wood: THREE.BufferGeometry[] = [limb(new THREE.Vector3(0, -0.3, 0), fork, 0.24, 0.17)];
  const pads: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + t() * 0.6;
    const reach = 1.5 + t() * 1.2;
    const tip = new THREE.Vector3(Math.cos(a) * reach, 4.1 + t() * 0.6, Math.sin(a) * reach);
    const mid = fork.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.35, 0));
    wood.push(limb(fork, mid, 0.13, 0.09), limb(mid, tip, 0.09, 0.05));
    tips.push(tip);
  }
  tips.push(new THREE.Vector3(0.2, 4.7, 0.1));
  for (const tip of tips) {
    for (let n = 0; n < 2; n++) {
      const pad = new THREE.IcosahedronGeometry(1, 1);
      const pp = pad.attributes.position;
      const col: number[] = [];
      for (let v = 0; v < pp.count; v++) {
        const x = pp.getX(v), y = pp.getY(v), z = pp.getZ(v);
        // ragged outline, flat top, thin underside
        const rag = 0.68 + fbm(x * 2.6 + tip.x * 3, z * 2.6 + tip.z * 3 + n * 7, 3) * 0.75;
        pp.setXYZ(v, x * rag, (y > 0 ? y * 0.34 : y * 0.2) * (0.8 + rag * 0.3), z * rag);
        // undersides sit in their own shade
        const lit = y > 0 ? 0.92 + fbm(x * 5 + 9, z * 5, 2) * 0.25 : 0.42;
        col.push(lit, lit, lit);
      }
      pad.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const w = 1.25 + t() * 0.9;
      pad.scale(w, 1, w * (0.8 + t() * 0.4));
      pad.translate(tip.x + (t() - 0.5) * 0.9, tip.y + n * 0.22 + 0.15, tip.z + (t() - 0.5) * 0.9);
      pad.computeVertexNormals();
      pads.push(pad);
    }
  }
  const woodGeo = kit.own(mergeGeometries(wood.map((g) => (g.index ? g.toNonIndexed() : g)))!);
  woodGeo.computeVertexNormals();
  const canopyGeo = kit.own(mergeGeometries(pads.map((g) => (g.index ? g.toNonIndexed() : g)))!);
  wood.forEach((g) => g.dispose());
  pads.forEach((g) => g.dispose());
  const foliage = kit.std('#3b4527', 0.92, 0, { vertexColors: true, roughnessMap: kit.grain(2), normalMap: kit.bump(3, true), normalScale: new THREE.Vector2(1.2, 1.2) });

  const trunks = new THREE.InstancedMesh(woodGeo, kit.mats.bark, spots.length);
  const crowns = new THREE.InstancedMesh(canopyGeo, foliage, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  const euler = new THREE.Euler();
  spots.forEach(([x, z, k], i) => {
    const y = surfaceHeight(x, z);
    q.setFromEuler(euler.set((r() - 0.5) * 0.1, r() * Math.PI * 2, (r() - 0.5) * 0.1));
    const wide = 0.85 + r() * 0.45;
    m.compose(p.set(x, y, z), q, s.set(k * wide, k * (0.85 + r() * 0.3), k * wide));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    const shade = 0.78 + r() * 0.4;
    crowns.setColorAt(i, tint.setRGB(shade * (0.96 + r() * 0.1), shade, shade * (0.85 + r() * 0.12)));
  });
  trunks.castShadow = crowns.castShadow = !kit.lite;
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}
