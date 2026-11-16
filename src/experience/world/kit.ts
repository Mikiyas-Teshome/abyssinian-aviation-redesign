import * as THREE from 'three';

export type Kit = ReturnType<typeof createKit>;
export type Fonts = { display: string; mono: string };
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, f: Fonts) => void;

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
export function createKit({ lite, anisotropy }: { lite: boolean; anisotropy: number }) {
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => {
    owned.push(o);
    return o;
  };

  const std = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

  const mats = {
    concrete: std('#77736c', 0.95),
    concreteDark: std('#4a4947', 0.95),
    tin: std('#a9afb3', 0.48, 0.8),
    tinDark: std('#343a40', 0.6, 0.6),
    steel: std('#5b636c', 0.4, 0.85),
    ivory: std('#ddd6c8', 0.8),
    graphite: std('#1b1f25', 0.7, 0.2),
    navy: std('#0b2740', 0.5, 0.1),
    gold: std('#c8a56a', 0.3, 0.8),
    brass: std('#b98a2e', 0.28, 0.95),
    wood: std('#7d6243', 0.9),
    woodDark: std('#44331f', 0.9),
    rubber: std('#121416', 0.95),
    red: std('#7d2c26', 0.6, 0.1),
    earth: std('#8a5a3a', 1),
    glass: std('#0d1b2a', 0.08, 0.9),
    cloth: std('#d8cfb8', 1),
    bark: std('#3b2c20', 1),
    leaf: std('#20281a', 1),
    drum: std('#2c3f50', 0.5, 0.6),
    yellow: std('#e2b227', 0.7),
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
  const paint = (w: number, h: number, draw: Painter) => {
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
    return tex;
  };
  const repaint = (f: Fonts) => {
    Object.assign(fonts, f);
    painters.forEach((p) => p());
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
    std,
    box,
    cyl,
    sphere,
    cached,
    put,
    block,
    emissive,
    paint,
    repaint,
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
