import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Kit = ReturnType<typeof createKit>;
export type Fonts = { display: string; mono: string };
/** Artwork the painted textures draw in: the house mark and the full lockup. */
export type Art = { mark: HTMLImageElement | null; lockup: HTMLImageElement | null };
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, f: Fonts) => void;

/**
 * A tileable patch of monochrome grit, for 2D painters. Filling a large
 * canvas with this as a repeating pattern is a single native draw; the same
 * speckle written pixel by pixel from JavaScript costs the best part of a
 * second on a texture the size of the apron.
 */
let gritPattern: HTMLCanvasElement | null = null;
const makeGrit = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + Math.round((rand() - 0.5) * 150);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
};
/** Lays that grit over whatever has been drawn so far. */
export const grit = (ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.14, scale = 1) => {
  gritPattern ??= makeGrit();
  const pattern = ctx.createPattern(gritPattern, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = 'overlay';
  ctx.scale(scale, scale);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w / scale, h / scale);
  ctx.restore();
};

/** Deterministic random numbers, so the world is identical on every load. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** A light that is drawn as a soft point: runway edge lights, lanterns, lamps. */
export interface Glow {
  position: THREE.Vector3;
  color: THREE.ColorRepresentation;
  size: number;
  /** 0 airfield lighting · 1 strip lanterns · 2 beacons · 3 hangar lamps */
  kind: 0 | 1 | 2 | 3;
}

/**
 * Shared materials, cached geometry and painted textures. Everything created
 * through the kit is disposed with it.
 */
/**
 * Merges every static mesh under `root` into one mesh per material, in
 * `root`'s own space. A set built from hundreds of boxes and posts becomes a
 * few dozen draw calls — which matters three times over, because each mesh is
 * also drawn into the shadow map and the ambient-occlusion pass.
 *
 * Left alone: anything flagged `userData.dynamic` (and everything under it),
 * instanced meshes, points, shader materials and vertex-coloured materials.
 */
export function freeze(root: THREE.Object3D, own: <T extends { dispose(): void }>(o: T) => T) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const walk = (o: THREE.Object3D) => {
    if (o !== root && o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && o.visible) {
      const mat = m.material as THREE.Material;
      if (!Array.isArray(m.material) && !(mat as THREE.ShaderMaterial).isShaderMaterial && !(mat as THREE.MeshStandardMaterial).vertexColors) {
        const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }));
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        g.clearGroups();
        b.geos.push(g);
        b.meshes.push(m);
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  let before = 0, after = 0;
  for (const b of buckets.values()) {
    before += b.meshes.length;
    if (b.meshes.length < 2) continue;
    const indexed = b.geos.every((g) => g.index);
    const merged = mergeGeometries(indexed ? b.geos : b.geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new THREE.Mesh(own(merged), b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
  // empty groups left behind are harmless; count what is drawn now
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) after++; });
  return { before, after };
}

export function createKit({ lite, anisotropy }: { lite: boolean; anisotropy: number }) {
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o);
    return o;
  };

  /**
   * Every distinct combination of material features is its own GPU program,
   * compiled on first load. A plain material is given neutral 1×1 roughness and
   * normal maps (they change nothing on screen) so that it shares one program
   * with its textured siblings instead of adding another to compile.
   */
  const pixel = (r: number, g: number, b: number) => {
    const t = own(new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1));
    t.needsUpdate = true;
    return t;
  };
  const neutralRough = pixel(255, 255, 255);
  const flatNormal = pixel(128, 128, 255);
  const std = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness, roughnessMap: neutralRough, normalMap: flatNormal, ...extra }));

  /* ── Surface detail ────────────────────────────────────────
     Real surfaces are never uniform. One tileable grain, derived once, gives
     every material a roughness break-up and a fine normal, which is what stops
     flat colour reading as plastic. Clones share the image and cost nothing. */
  const GRAIN = 256;
  const height = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = GRAIN;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const img = g.createImageData(GRAIN, GRAIN);
    // tileable value noise: the lattice wraps, so the texture repeats seamlessly
    const hash = (x: number, y: number, p: number) => {
      let h = Math.imul((((x % p) + p) % p) + 1, 374761393) + Math.imul((((y % p) + p) % p) + 1, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t * t * (3 - 2 * t);
    const noise = (x: number, y: number, p: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      return lerp(lerp(hash(xi, yi, p), hash(xi + 1, yi, p), xf), lerp(hash(xi, yi + 1, p), hash(xi + 1, yi + 1, p), xf), yf);
    };
    for (let y = 0; y < GRAIN; y++) {
      for (let x = 0; x < GRAIN; x++) {
        let v = 0, amp = 0.5, period = 13;
        for (let o = 0; o < 4; o++) {
          v += amp * noise((x / GRAIN) * period, (y / GRAIN) * period, period);
          amp *= 0.5;
          period *= 2;
        }
        const i = (y * GRAIN + x) * 4;
        const b = Math.round(255 * Math.min(1, Math.max(0, v)));
        img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  /** Normal map derived from that height field, by slope. */
  const normalCanvas = (strength: number) => {
    const src = height.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, GRAIN, GRAIN).data;
    const c = document.createElement('canvas');
    c.width = c.height = GRAIN;
    const g = c.getContext('2d')!;
    const img = g.createImageData(GRAIN, GRAIN);
    const at = (x: number, y: number) => src[(((y + GRAIN) % GRAIN) * GRAIN + ((x + GRAIN) % GRAIN)) * 4] / 255;
    for (let y = 0; y < GRAIN; y++) {
      for (let x = 0; x < GRAIN; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * GRAIN + x) * 4;
        img.data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  const normalSource = { soft: null as HTMLCanvasElement | null, hard: null as HTMLCanvasElement | null };

  const tiled = (canvas: HTMLCanvasElement, repeat: number, aspect = 1) => {
    const t = own(new THREE.CanvasTexture(canvas));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat * aspect);
    t.anisotropy = anisotropy;
    return t;
  };
  /**
   * Roughness break-up. three.js multiplies a material's roughness by this
   * map, so it is remapped to 0.74–1.0: it varies the sheen without turning
   * concrete into a wet floor or paint into plastic.
   */
  const roughCanvas = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = GRAIN;
    const g = c.getContext('2d')!;
    const src = height.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, GRAIN, GRAIN);
    const d = src.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.round(255 * (0.74 + 0.26 * (d[i] / 255)));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(src, 0, 0);
    return c;
  })();
  const grain = (repeat: number, aspect = 1) => tiled(roughCanvas, repeat, aspect);


  /** Tiling fine normal; `hard` is for coarse surfaces like concrete and earth. */
  const bump = (repeat: number, hard = false, aspect = 1) => {
    const key = hard ? 'hard' : 'soft';
    normalSource[key] ??= normalCanvas(hard ? 4.5 : 1.8);
    return tiled(normalSource[key]!, repeat, aspect);
  };

  /** Corrugated sheet: a sine-profile normal map, four ridges per world unit. */
  const corrugation = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d')!;
    const img = g.createImageData(4, 64);
    for (let y = 0; y < 64; y++) {
      const slope = Math.cos((y / 64) * Math.PI * 2 * 4) * 1.4;
      const len = Math.hypot(slope, 1);
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4;
        img.data[i] = 128;
        img.data[i + 1] = Math.round(((slope / len) * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = own(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    return t;
  })();

  /**
   * Built things are dirtiest where they meet the ground and streaked where
   * rain has run down them. Applied in the shader, in world space, so every
   * wall, door and footing gets it without its own texture.
   */
  const weather = <M extends THREE.MeshStandardMaterial>(m: M, amount = 1) => {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWeather = { value: amount };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldW;
          uniform float uWeather;
          float wh(vec2 p){ p = fract(p * vec2(127.1, 311.7)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
          float wn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float splash = (1.0 - smoothstep(0.0, 1.3 + wn(vWorldW.xz * 0.7) * 0.9, vWorldW.y)) * step(-0.2, vWorldW.y);
          float streak = wn(vec2((vWorldW.x + vWorldW.z) * 3.1, vWorldW.y * 0.25)) * wn(vec2((vWorldW.x - vWorldW.z) * 0.9, 3.0));
          float grime = clamp(splash * 0.55 + streak * 0.2, 0.0, 0.7) * uWeather;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.55, 0.47), grime);`);
    };
    m.customProgramCacheKey = () => 'weather';
    return m;
  };

  const mats = {
    corrugated: weather(std('#9aa0a4', 0.46, 0.72, { normalMap: corrugation, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: grain(0.09) }), 0.8),
    concrete: std('#77736c', 0.96, 0, { roughnessMap: grain(26) }),
    concreteDark: std('#4a4947', 0.96, 0, { roughnessMap: grain(20) }),
    tin: weather(std('#a9afb3', 0.5, 0.78, { roughnessMap: grain(9), normalMap: bump(9), normalScale: new THREE.Vector2(0.35, 0.35) }), 0.7),
    tinDark: std('#343a40', 0.62, 0.55, { roughnessMap: grain(7) }),
    steel: std('#5b636c', 0.42, 0.85, { roughnessMap: grain(5) }),
    ivory: weather(std('#ddd6c8', 0.88, 0, { roughnessMap: grain(16), normalMap: bump(16), normalScale: new THREE.Vector2(0.3, 0.3) })),
    graphite: weather(std('#1b1f25', 0.74, 0.2, { roughnessMap: grain(8) }), 0.5),
    navy: std('#0b2740', 0.52, 0.1),
    gold: std('#c8a56a', 0.32, 0.8, { roughnessMap: grain(4) }),
    brass: std('#b98a2e', 0.3, 0.95, { roughnessMap: grain(4) }),
    wood: std('#7d6243', 0.92, 0, { roughnessMap: grain(6, 7), normalMap: bump(6, true, 7), normalScale: new THREE.Vector2(0.8, 0.8) }),
    woodDark: std('#44331f', 0.92, 0, { roughnessMap: grain(5, 7), normalMap: bump(5, true, 7) }),
    rubber: std('#121416', 0.96, 0, { roughnessMap: grain(3), normalMap: bump(3), normalScale: new THREE.Vector2(0.4, 0.4) }),
    red: std('#7d2c26', 0.62, 0.1, { roughnessMap: grain(6) }),
    earth: std('#8a5a3a', 1, 0, { roughnessMap: grain(60), normalMap: bump(60, true), normalScale: new THREE.Vector2(0.4, 0.4) }),
    glass: std('#0d1b2a', 0.07, 0.95),
    cloth: std('#d8cfb8', 1, 0, { roughnessMap: grain(5), normalMap: bump(5), normalScale: new THREE.Vector2(0.6, 0.6) }),
    bark: std('#3b2c20', 1, 0, { roughnessMap: grain(2, 4), normalMap: bump(2, true, 4) }),
    leaf: std('#20281a', 0.95, 0, { roughnessMap: grain(3) }),
    drum: std('#2c3f50', 0.52, 0.6, { roughnessMap: grain(4) }),
    yellow: std('#e2b227', 0.72, 0, { roughnessMap: grain(4) }),
  };

  const cache = new Map<string, THREE.BufferGeometry>();
  const cached = (key: string, make: () => THREE.BufferGeometry) => {
    let g = cache.get(key);
    if (!g) cache.set(key, (g = own(make())));
    return g;
  };
  const box = (w: number, h: number, d: number) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cyl = (rt: number, rb: number, h: number, seg = 16) =>
    cached(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const sphere = (r: number, w = 16, h = 12) => cached(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h));

  /** Mesh placed by its centre. */
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow && !lite;
    m.receiveShadow = !lite;
    parent.add(m);
    return m;
  };
  /** Box standing on `y0`. */
  const block = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y0 = 0, z = 0) =>
    put(box(w, h, d), mat, parent, x, y0 + h / 2, z);

  /** Self-lit surface whose brightness the timeline can drive. */
  const emissive = (color: THREE.ColorRepresentation, intensity = 1) =>
    own(new THREE.MeshStandardMaterial({ color: '#050505', emissive: color, emissiveIntensity: intensity, roughness: 1 }));

  // Painted textures are redrawn once the web fonts have arrived.
  const fonts: Fonts = { display: 'sans-serif', mono: 'monospace' };
  const painters: (() => void)[] = [];
  /** Where startup time goes: [what, ms]. */
  const profile: [string, number][] = [];
  const paint = (w: number, h: number, draw: Painter) => {
    const t0 = performance.now();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const tex = own(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    const run = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, fonts);
      tex.needsUpdate = true;
    };
    run();
    painters.push(run);
    profile.push([`paint ${w}×${h}`, Math.round(performance.now() - t0)]);
    return tex;
  };
  const repaint = (f: Fonts) => {
    Object.assign(fonts, f);
    painters.forEach((p) => p());
  };

  const art: Art = { mark: null, lockup: null };
  /**
   * Decodes the house artwork so the painters can stamp it onto the livery.
   * Resolves early if the files are slow, rather than holding up the whole
   * world for a logo — whatever arrives late is repainted when it does.
   */
  const loadArt = (sources: Partial<Record<keyof Art, string>>, wait = 1500) => {
    const all = Object.entries(sources).map(([key, src]) => {
      const img = new Image();
      const ready = new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
      img.src = src;
      return ready.then(() => {
        if (!img.naturalWidth) return;
        art[key as keyof Art] = img;
        // Anything already painted was painted without it.
        painters.forEach((p) => p());
      });
    });
    return Promise.race([Promise.all(all).then(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, wait))]);
  };

  const signFaces: THREE.MeshStandardMaterial[] = [];
  /**
   * An internally lit airfield sign on two posts. The face looks along local +Z.
   * Returns the group; its face brightness follows the airfield lighting.
   */
  const sign = (w: number, h: number, px: [number, number], draw: Painter, parent: THREE.Object3D, x: number, z: number, rotY = 0, postH = 1.1, back?: Painter) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    parent.add(g);
    block(w + 0.22, h + 0.22, 0.3, mats.graphite, g, 0, postH - 0.11, 0);
    const tex = paint(px[0], px[1], draw);
    const face = own(new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.55 }));
    signFaces.push(face);
    put(cached(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), face, g, 0, postH + h / 2, 0.155, false);
    if (back) {
      const backTex = paint(px[0], px[1], back);
      const rear = own(new THREE.MeshStandardMaterial({ map: backTex, emissive: '#ffffff', emissiveMap: backTex, emissiveIntensity: 0.3, roughness: 0.55 }));
      signFaces.push(rear);
      put(cached(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), rear, g, 0, postH + h / 2, -0.155, false).rotation.y = Math.PI;
    }
    [-1, 1].forEach((s) => put(cyl(0.07, 0.07, postH, 10), mats.steel, g, s * (w / 2 - 0.45), postH / 2, 0));
    return g;
  };

  const glows: Glow[] = [];
  const glow = (x: number, y: number, z: number, color: THREE.ColorRepresentation, size: number, kind: Glow['kind'] = 0) => {
    const g: Glow = { position: new THREE.Vector3(x, y, z), color, size, kind };
    glows.push(g);
    return g;
  };

  return {
    lite,
    mats,
    own,
    freeze: (root: THREE.Object3D) => {
      const t0 = performance.now();
      const r = freeze(root, own);
      profile.push([`merge ${r.before}→${r.after} meshes`, Math.round(performance.now() - t0)]);
      return r;
    },
    profile,
    std,
    box,
    cyl,
    sphere,
    cached,
    put,
    block,
    grain,
    bump,
    emissive,
    paint,
    repaint,
    art,
    loadArt,
    sign,
    signFaces,
    glow,
    glows,
    dispose() {
      owned.forEach((o) => o.dispose());
      owned.length = 0;
      cache.clear();
    },
  };
}
