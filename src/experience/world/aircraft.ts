import * as THREE from 'three';
import type { Kit } from './kit';

/**
 * The single-engine high-wing utility turboprop these routes are actually
 * flown with: cargo pod under the belly, braced wing, fixed gear, and a cabin
 * that takes either passengers or freight. Modelled procedurally, in the
 * operator's own white/red/gold scheme, until the client supplies an approved
 * model and livery files.
 *
 * One coordinate system throughout, with no corrective rotations:
 *   X  span (right wing +X, left wing −X)
 *   Y  up
 *   Z  length (nose −Z, tail +Z)
 *
 * Surfaces are lofted rather than assembled: the fuselage from superelliptical
 * cross-sections, every flying surface and strut from airfoil sections, and
 * the spinner, pod and tyres as bodies of revolution.
 */

/** Height of the aircraft origin (fuselage centreline) above the ground on its wheels. */
export const GEAR = 2.0;

const WHITE = '#f1efe8';
const RED = '#c0342a';
const DEEP = '#8e2119';
const GOLD = '#cf9f3f';
const CHAR = '#1d2127';
const NOSE = -7.0, LENGTH = 14.2;

/** Fin span and mid-span chord, in metres — see the registration painter. */
const FIN_SPAN = 2.66, FIN_CHORD = 2.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * (3 - 2 * t);
/** Smooth value through a set of [z, value] control points. */
const track = (pts: [number, number][], z: number) => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, v0] = pts[i], [z1, v1] = pts[i + 1];
    if (z <= z1) return v0 + (v1 - v0) * ease((z - z0) / (z1 - z0));
  }
  return pts[pts.length - 1][1];
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

/** Unit superellipse: exponent 2 is a true ellipse, higher is squarer. */
function superellipse(angle: number, exponent: number): [number, number] {
  const s = Math.sin(angle), c = Math.cos(angle), p = 2 / exponent;
  return [Math.sign(s) * Math.abs(s) ** p, Math.sign(c) * Math.abs(c) ** p];
}

/* ── Fuselage ──────────────────────────────────────────────── */

// [z, half-width, half-height, centre height, squareness] — the cabin is a
// rounded box, the nose bowl and tail cone are round.
const SECTIONS: [number, number, number, number, number][] = [
    [-6.62, 0.26, 0.25, -0.2, 2.0], [-6.5, 0.4, 0.385, -0.2, 2.0], [-6.3, 0.48, 0.46, -0.2, 2.1],
    [-6.1, 0.55, 0.52, -0.19, 2.2], [-5.4, 0.66, 0.62, -0.15, 2.3], [-4.7, 0.75, 0.73, -0.07, 2.4],
    [-4.0, 0.81, 0.82, -0.02, 2.5], [-3.2, 0.835, 0.87, 0, 2.6], [-1.5, 0.845, 0.88, 0, 2.6],
    [0.4, 0.845, 0.88, 0, 2.6], [1.8, 0.82, 0.86, 0.02, 2.5], [3.0, 0.72, 0.78, 0.09, 2.4],
    [4.2, 0.56, 0.63, 0.2, 2.3], [5.4, 0.38, 0.46, 0.33, 2.2], [6.4, 0.22, 0.29, 0.43, 2.1],
  [7.05, 0.08, 0.12, 0.5, 2.0], [7.2, 0.015, 0.02, 0.52, 2.0],
];

/**
 * Roughly how far it is around the fuselage at this station, in metres.
 *
 * The livery texture wraps the whole section across its width and the whole
 * length down its height, so a texel is nowhere near square — and the body
 * tapers, so it is squarer at the nose than over the tail. Artwork sized
 * without this comes out stretched along the aeroplane.
 */
function girth(z: number) {
  let i = 0;
  while (i < SECTIONS.length - 2 && SECTIONS[i + 1][0] < z) i++;
  const [z0, w0, h0] = SECTIONS[i];
  const [z1, w1, h1] = SECTIONS[i + 1];
  const t = THREE.MathUtils.clamp((z - z0) / (z1 - z0), 0, 1);
  const a = w0 + (w1 - w0) * t, b = h0 + (h1 - h0) * t;
  // Ramanujan's ellipse perimeter; the real section is a little squarer than
  // an ellipse, so this runs a few per cent short, which is close enough.
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function fuselageGeometry() {
  const keys = SECTIONS;
  const shape = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[1], k[2])), false, 'centripetal');
  const lift = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(k[0], k[3], k[4])), false, 'centripetal');
  const RINGS = 92, SEG = 56;
  const pos: number[] = [], uv: number[] = [], index: number[] = [], weld: [number, number][] = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let r = 0; r <= RINGS; r++) {
    shape.getPoint(r / RINGS, p);
    lift.getPoint(r / RINGS, q);
    const z = p.x, w = Math.max(p.y, 0.01), h = Math.max(p.z, 0.01);
    for (let s = 0; s <= SEG; s++) {
      // 0 roof · ¼ right · ½ belly · ¾ left
      const [sx, cy] = superellipse((s / SEG) * Math.PI * 2, Math.max(q.z, 2));
      pos.push(w * sx, q.y + h * cy, z);
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

/* ── Lifting surfaces: lofted airfoil sections ─────────────── */

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
    return [x, camber * 4 * x * (1 - x) + side * yt];
  };
  for (let i = 0; i < n; i++) pts.push(at((1 + Math.cos((Math.PI * i) / (n - 1))) / 2, 1));
  for (let i = 1; i < n - 1; i++) pts.push(at((1 - Math.cos((Math.PI * i) / (n - 1))) / 2, -1));
  return pts;
}

/** UVs run u around the section (≈0.5 at the leading edge) and v root→tip. */
function loft(sections: Section[], { steps = 6, camber = 0.018, n = 15 } = {}) {
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
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  let ring = 0;
  dense.forEach((s, r) => {
    const outline = airfoil(n, s.t, camber);
    ring = outline.length;
    outline.forEach(([x, y], i) => {
      pos.push(s.le[0] + s.up[0] * y * s.chord, s.le[1] + s.up[1] * y * s.chord, s.le[2] + x * s.chord + s.up[2] * y * s.chord);
      uv.push(i / ring, r / (dense.length - 1));
    });
  });
  for (let r = 0; r < dense.length - 1; r++) {
    for (let s = 0; s < ring; s++) {
      const a = r * ring + s, b = r * ring + ((s + 1) % ring), c = a + ring, d = b + ring;
      index.push(a, c, b, b, c, d);
    }
  }
  for (const r of [0, dense.length - 1]) {
    const s = dense[r], centre = pos.length / 3;
    pos.push(s.le[0], s.le[1], s.le[2] + s.chord * 0.5);
    uv.push(0.5, r === 0 ? 0 : 1);
    for (let i = 0; i < ring; i++) {
      const a = r * ring + i, b = r * ring + ((i + 1) % ring);
      if (r === 0) index.push(centre, a, b);
      else index.push(centre, b, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return finish(geo);
}

const mirror = (sections: Section[]): Section[] => sections.map((s) => ({ ...s, le: [-s.le[0], s.le[1], s.le[2]], up: [-s.up[0], s.up[1], s.up[2]] }));

/** A body of revolution about the Z axis from [radius, z] points. */
function revolve(profile: [number, number][], segments = 44) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  geo.rotateX(Math.PI / 2);
  return finish(geo);
}

/** A tyre or wheel: revolved about the span axis. */
function wheel(profile: [number, number][], segments = 28) {
  const geo = new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), segments);
  geo.rotateZ(Math.PI / 2);
  return finish(geo);
}

/** Twisted, tapered propeller blade, spanning +Y with its chord across Z. */
function bladeGeometry() {
  const STATIONS = 12, n = 11;
  const pos: number[] = [], index: number[] = [];
  let ring = 0;
  for (let i = 0; i <= STATIONS; i++) {
    const f = i / STATIONS;
    const y = 0.16 + f * 1.34;
    const chord = 0.13 + 0.14 * Math.sin(Math.PI * Math.min(1, f * 1.15)) - 0.05 * f * f;
    const twist = THREE.MathUtils.degToRad(36 - 29 * f);
    const outline = airfoil(n, 0.13 - 0.05 * f, 0.03);
    ring = outline.length;
    const cz = Math.cos(twist), cx = Math.sin(twist);
    for (const [ox, oy] of outline) {
      const along = (ox - 0.38) * chord, thick = oy * chord;
      pos.push(cx * along + cz * thick, y, cz * along - cx * thick);
    }
  }
  for (let r = 0; r < STATIONS; r++) {
    for (let s = 0; s < ring; s++) {
      const a = r * ring + s, b = r * ring + ((s + 1) % ring), c = a + ring, d = b + ring;
      index.push(a, c, b, b, c, d);
    }
  }
  for (const r of [0, STATIONS]) {
    const centre = pos.length / 3;
    pos.push(0, 0.16 + (r / STATIONS) * 1.34, 0);
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

export interface Aircraft {
  group: THREE.Group;
  /** The propeller; it turns about Z. */
  prop: THREE.Object3D;
  /** 0 stopped … 1 at speed: blades fade into a disc. */
  setProp(speed: number): void;
}

/* ── Livery ────────────────────────────────────────────────── */

/** Side glazing, in fuselage UV space: [centre du from the belly, centre z, half-width du, half-length z]. */
const PANES: [number, number, number, number][] = [
  [0.327, -4.52, 0.055, 0.42],
  [0.318, -3.42, 0.047, 0.3],
  [0.318, -2.52, 0.047, 0.3],
  [0.318, -1.62, 0.047, 0.3],
  [0.318, -0.72, 0.047, 0.3],
];

/** The upper boundary of the red belly, the centreline of the swoosh, and its half-width. */
const BELLY: [number, number][] = [[-7, 0.15], [-6.2, 0.2], [-5.2, 0.145], [-4, 0.12], [-1.5, 0.115], [1.5, 0.12], [3.5, 0.1], [5.5, 0.075], [7.2, 0.05]];
const SWOOSH: [number, number][] = [[-6.6, 0.175], [-5.9, 0.3], [-4.9, 0.235], [-3.4, 0.272], [-1.6, 0.2], [0.6, 0.214], [2.6, 0.166], [4.6, 0.136], [7.2, 0.1]];
const SWOOSH_W: [number, number][] = [[-6.6, 0.026], [-4, 0.038], [0, 0.03], [4, 0.018], [7.2, 0.009]];

function paintPanes(ctx: CanvasRenderingContext2D, W: number, H: number, fill: string, rim: string | null) {
  const Y = (z: number) => (1 - (z - NOSE) / LENGTH) * H;
  for (const [du, z, dw, dz] of PANES) {
    for (const u of [0.5 - du, 0.5 + du]) {
      const w = dw * 2 * W, h = ((dz * 2) / LENGTH) * H;
      const draw = (inset: number, colour: string) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.roundRect(u * W - w / 2 + inset, Y(z) - h / 2 + inset, w - inset * 2, h - inset * 2, Math.min(w, h) * 0.26);
        ctx.fill();
      };
      if (rim) draw(0, rim);
      draw(rim ? 5 : 0, fill);
    }
  }
}

/**
 * House artwork on both flanks, running nose→tail and reading the same from
 * either side.
 *
 * The height is worked out from the artwork's own proportions and the texel
 * shape at that station, so the lockup on the aeroplane is the lockup, not a
 * stretched copy of it.
 */
function sideArt(ctx: CanvasRenderingContext2D, W: number, H: number, img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, du: number, zNose: number, zTail: number) {
  const Y = (z: number) => (1 - (z - NOSE) / LENGTH) * H;
  const span = Math.abs(Y(zNose) - Y(zTail));
  const alongPx = H / LENGTH;
  const aroundPx = W / girth((zNose + zTail) / 2);
  const h = (span * img.naturalHeight * aroundPx) / (img.naturalWidth * alongPx);
  ctx.save();
  // Left flank: the length of the aeroplane runs up the texture, and the
  // artwork's own "down" is toward the belly. The right flank is the same
  // mapping reflected, so it reads the right way round from outside.
  ctx.setTransform(0, -1, -1, 0, (0.5 + du) * W, Y(zNose));
  ctx.drawImage(img, 0, -h / 2, span, h);
  ctx.setTransform(0, 1, 1, 0, (0.5 - du) * W, Y(zTail));
  ctx.drawImage(img, 0, -h / 2, span, h);
  ctx.restore();
}

export function createAircraftFactory(kit: Kit) {
  const { own, put, std } = kit;

  const livery = kit.paint(1024, 2048, (ctx, W, H, f) => {
    const Y = (z: number) => (1 - (z - NOSE) / LENGTH) * H;
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, W, H);

    // The scheme is one flowing ribbon: a red belly, a swoosh across the flank,
    // and gold hairlines along both. Painted row by row so the curves are true.
    for (let y = 0; y < H; y++) {
      const z = NOSE + (1 - y / H) * LENGTH;
      const belly = track(BELLY, z), sw = track(SWOOSH, z), half = track(SWOOSH_W, z);
      const band = (d0: number, d1: number, fill: string) => {
        if (d1 <= d0) return;
        ctx.fillStyle = fill;
        ctx.fillRect((0.5 - d1) * W, y, (d1 - d0) * W, 1.02);
        ctx.fillRect((0.5 + d0) * W, y, (d1 - d0) * W, 1.02);
      };
      band(0, belly, RED);
      band(belly + 0.009, belly + 0.018, GOLD);
      band(sw - half, sw + half, RED);
      band(sw - half - 0.019, sw - half - 0.012, GOLD);
      band(sw + half + 0.022, sw + half + 0.028, DEEP);
    }

    // panel lines: frames, stringers, the cowl joint and the doors
    ctx.strokeStyle = 'rgba(40, 44, 50, 0.16)';
    ctx.lineWidth = 1.6;
    for (const z of [-4.3, -3.0, -1.7, -0.4, 0.9, 2.2, 3.5, 4.8]) {
      ctx.beginPath(); ctx.moveTo(0, Y(z)); ctx.lineTo(W, Y(z)); ctx.stroke();
    }
    for (const u of [0.12, 0.88, 0.5]) {
      ctx.beginPath(); ctx.moveTo(u * W, Y(-6.2)); ctx.lineTo(u * W, Y(6.4)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40, 44, 50, 0.42)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, Y(-5.3)); ctx.lineTo(W, Y(-5.3)); ctx.stroke(); // cowl joint
    // crew door, and the big cargo door aft of the wing
    for (const [u, z0, z1, wide] of [[0.5 + 0.3, -5.05, -3.95, 0.1], [0.5 - 0.3, -5.05, -3.95, 0.1], [0.5 + 0.3, -1.95, 0.35, 0.115]] as const) {
      ctx.beginPath();
      ctx.roundRect((u - wide) * W, Y(z1), wide * 2 * W, Y(z0) - Y(z1), 14);
      ctx.stroke();
    }

    // anti-glare panel ahead of the windscreen, over the roof seam
    for (const x of [-0.085, 0.915]) {
      ctx.fillStyle = CHAR;
      ctx.beginPath();
      ctx.roundRect(x * W, Y(-5.2), 0.17 * W, Y(-6.45) - Y(-5.2), 10);
      ctx.fill();
    }

    // windscreen: wraps the roof, with a white centre post
    for (const x of [-0.165, 0.835]) {
      ctx.fillStyle = '#0d1319';
      ctx.beginPath();
      ctx.roundRect(x * W, Y(-4.9), 0.33 * W, Y(-6.3) - Y(-4.9), 46);
      ctx.fill();
    }
    ctx.fillStyle = WHITE;
    ctx.fillRect(-0.008 * W, Y(-6.25), 0.016 * W, Y(-4.95) - Y(-6.25));
    ctx.fillRect(0.992 * W, Y(-6.25), 0.016 * W, Y(-4.95) - Y(-6.25));

    // A working aeroplane, not a showroom one.
    const wr = (() => { let k = 991; return () => ((k = (k * 16807) % 2147483647) - 1) / 2147483646; })();
    // exhaust soot: from each stack, trailing aft and down the lower cowl and fuselage
    for (const side of [-1, 1]) {
      for (let i = 0; i < 60; i++) {
        const f = i / 60;
        const z = -5.45 + f * 4.4;
        const du = 0.19 - f * 0.05;
        const half = 0.012 + f * 0.03;
        const a = 0.34 * (1 - f) ** 1.6;
        const g = ctx.createLinearGradient((0.5 + side * (du - half)) * W, 0, (0.5 + side * (du + half)) * W, 0);
        g.addColorStop(0, 'rgba(28,24,20,0)');
        g.addColorStop(0.5, `rgba(28,24,20,${a})`);
        g.addColorStop(1, 'rgba(28,24,20,0)');
        ctx.fillStyle = g;
        ctx.fillRect((0.5 + side * du - half) * W, Y(z + 0.05), half * 2 * W, Y(z - 0.03) - Y(z + 0.05) + 1);
      }
    }
    // rain streaks running aft from seams and window corners
    for (let i = 0; i < 140; i++) {
      const u = wr();
      const z0 = -4.5 + wr() * 10;
      const len = 0.3 + wr() * 1.6;
      ctx.fillStyle = `rgba(60,55,48,${0.03 + wr() * 0.05})`;
      ctx.fillRect(u * W, Y(z0 + len), 1 + wr() * 2, Y(z0) - Y(z0 + len));
    }
    // grime collects low down, where spray from the wheels reaches
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient((0.5 + side * 0.24) * W, 0, (0.5 + side * 0.1) * W, 0);
      g.addColorStop(0, 'rgba(70,58,44,0)');
      g.addColorStop(1, 'rgba(70,58,44,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(0.5 + side * 0.24, 0.5 + side * 0.1) * W, Y(4.5), 0.14 * W, Y(-4.8) - Y(4.5));
    }
    // fine speckle: chips, dust, the texture of paint that has been outdoors
    for (let i = 0; i < 9000; i++) {
      const v = wr();
      ctx.fillStyle = v > 0.6 ? `rgba(255,255,250,${wr() * 0.07})` : `rgba(40,36,30,${wr() * 0.08})`;
      ctx.fillRect(wr() * W, wr() * H, 1 + wr() * 1.5, 1 + wr() * 1.5);
    }
    paintPanes(ctx, W, H, '#0d1319', '#b9bcc0');
    // Titles on the rear flank, where the registration used to sit; the
    // registration has gone to the fin.
    if (kit.art.lockup) sideArt(ctx, W, H, kit.art.lockup, 0.292, 2.95, 5.15);
  });

  const cabin = kit.paint(512, 1024, (ctx, W, H) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    paintPanes(ctx, W, H, '#ffd9a8', null);
    for (const x of [-0.165, 0.835]) {
      ctx.fillStyle = '#4a4634';
      ctx.beginPath();
      ctx.roundRect(x * W, (1 - (-4.9 - NOSE) / LENGTH) * H, 0.33 * W, (((-4.9) - (-6.3)) / LENGTH) * H, 22);
      ctx.fill();
    }
  });

  /** Flying surfaces: white, with a red tip cap and a non-slip wing walk. */
  const wingTex = kit.paint(512, 512, (ctx, W, H) => {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0.955 * H, W, H);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0.945 * H, W, 0.01 * H);
    ctx.fillStyle = 'rgba(35, 38, 44, 0.5)';
    ctx.fillRect(0.1 * W, 0, 0.26 * W, 0.1 * H);
    ctx.strokeStyle = 'rgba(40, 44, 50, 0.2)';
    ctx.lineWidth = 2;
    for (const u of [0.1, 0.78]) { ctx.beginPath(); ctx.moveTo(u * W, 0); ctx.lineTo(u * W, H); ctx.stroke(); }
  });
  const finTex = kit.paint(512, 512, (ctx, W, H, f) => {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, 0.6 * H, W, 0.085 * H);
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0.845 * H, W, H);
    ctx.fillStyle = CHAR;
    ctx.fillRect(0.47 * W, 0, 0.06 * W, H); // leading edge
    ctx.strokeStyle = 'rgba(40, 44, 50, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0.1 * W, 0); ctx.lineTo(0.1 * W, H); ctx.stroke(); // rudder hinge

    // The registration on the fin.
    //
    // Neither face is flipped. The outline this texture wraps runs from the
    // trailing edge forward over one face and back aft over the other, and
    // the two sides of the aeroplane are looked at from opposite directions
    // too — so the same artwork reads nose-first from both. Mirroring one of
    // them, as the mark used to be, is what printed it backwards.
    ctx.save();
    ctx.font = `600 58px ${f.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = DEEP;
    // This texture wraps the whole section across its width and the whole span
    // down its height, so a texel here is no squarer than on the fuselage: the
    // section goes up one face and back down the other, making it about twice
    // the chord. Without squashing by that ratio the registration comes out
    // stretched along the aeroplane.
    const squash = (W / 2 / FIN_CHORD) / (H / FIN_SPAN);
    const wide = ctx.measureText('ET-ALU').width * squash;
    const fit = Math.min(1, (0.22 * W) / Math.max(wide, 1));
    // half way up, above the gold band, where the fin still has chord to spare
    for (const cu of [0.26, 0.74]) {
      ctx.setTransform(squash * fit, 0, 0, fit, cu * W, 0.5 * H);
      ctx.fillText('ET-ALU', 0, 0);
    }
    ctx.restore();
  });
  const stabTex = kit.paint(256, 256, (ctx, W, H) => {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0.93 * H, W, H);
  });

  // Real paint is not perfectly smooth: a fine grain in the roughness gives the
  // clearcoat its orange-peel and keeps highlights from looking injection-moulded.
  const peel = kit.grain(9, 14);
  const coat = { roughness: 0.36, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.22, roughnessMap: peel, clearcoatRoughnessMap: peel };
  const skin = own(new THREE.MeshPhysicalMaterial({ ...coat, map: livery, emissive: '#ffffff', emissiveMap: cabin, emissiveIntensity: 0 }));
  const wingMat = own(new THREE.MeshPhysicalMaterial({ ...coat, map: wingTex }));
  const finMat = own(new THREE.MeshPhysicalMaterial({ ...coat, map: finTex }));
  const stabMat = own(new THREE.MeshPhysicalMaterial({ ...coat, map: stabTex }));
  // a white 1×1 map makes these share the textured panels' shader program
  const plain = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  plain.colorSpace = THREE.SRGBColorSpace;
  plain.needsUpdate = true;
  const white = own(new THREE.MeshPhysicalMaterial({ ...coat, color: WHITE, map: plain }));
  const red = own(new THREE.MeshPhysicalMaterial({ ...coat, color: RED, map: plain }));
  const charcoal = std(CHAR, 0.5, 0.3);
  const steel = std('#aab0b5', 0.34, 0.9);
  const polished = std('#d8dcde', 0.2, 1);
  const rubber = std('#15171a', 0.92);
  const blade = own(new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.45, metalness: 0.2, transparent: true, opacity: 1 }));
  const discMat = own(new THREE.MeshBasicMaterial({ color: '#dfe5ea', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  const beaconMat = kit.emissive('#ff2a1f', 1);
  const strobeMat = kit.emissive('#ffffff', 1);
  const portMat = kit.emissive('#ff3b30', 2.2);
  const starMat = kit.emissive('#39e58a', 2.2);

  const UP: THREE.Vector3Tuple = [0, 1, 0];
  const SIDE: THREE.Vector3Tuple = [1, 0, 0];
  const wing: Section[] = [
    { le: [0, 0.92, -2.9], chord: 2.2, t: 0.155, up: UP },
    { le: [1.2, 0.95, -2.9], chord: 2.2, t: 0.15, up: UP },
    { le: [5.0, 1.12, -2.86], chord: 2.02, t: 0.14, up: UP },
    { le: [8.0, 1.25, -2.58], chord: 1.4, t: 0.12, up: UP },
    { le: [8.62, 1.3, -2.44], chord: 1.08, t: 0.11, up: UP },
  ];
  const stab: Section[] = [
    { le: [0, 0.38, 5.5], chord: 1.5, t: 0.1, up: UP },
    { le: [2.0, 0.44, 5.76], chord: 1.18, t: 0.09, up: UP },
    { le: [3.25, 0.5, 5.98], chord: 0.82, t: 0.085, up: UP },
  ];
  const strut: Section[] = [
    { le: [0.74, -0.52, -1.5], chord: 0.6, t: 0.26, up: UP },
    { le: [4.15, 0.88, -2.0], chord: 0.46, t: 0.3, up: UP },
  ];
  const jury: Section[] = [
    { le: [2.78, 0.4, -1.78], chord: 0.3, t: 0.3, up: UP },
    { le: [3.2, 0.86, -2.42], chord: 0.3, t: 0.3, up: UP },
  ];
  const leg: Section[] = [
    { le: [0.4, -0.74, 0.08], chord: 0.5, t: 0.3, up: UP },
    { le: [1.05, -1.26, 0.16], chord: 0.42, t: 0.3, up: UP },
    { le: [1.6, -1.6, 0.2], chord: 0.34, t: 0.32, up: UP },
  ];

  const g = {
    fuselage: own(fuselageGeometry()),
    wingR: own(loft(wing)), wingL: own(loft(mirror(wing))),
    stabR: own(loft(stab, { camber: 0 })), stabL: own(loft(mirror(stab), { camber: 0 })),
    fin: own(loft([
      { le: [0, 0.6, 2.6], chord: 4.3, t: 0.085, up: SIDE },
      { le: [0, 1.5, 3.7], chord: 3.2, t: 0.1, up: SIDE },
      { le: [0, 2.8, 4.9], chord: 2.0, t: 0.095, up: SIDE },
      { le: [0, 3.26, 5.36], chord: 1.5, t: 0.09, up: SIDE },
    ], { camber: 0 })),
    strutR: own(loft(strut, { steps: 2, camber: 0 })), strutL: own(loft(mirror(strut), { steps: 2, camber: 0 })),
    juryR: own(loft(jury, { steps: 1, camber: 0 })), juryL: own(loft(mirror(jury), { steps: 1, camber: 0 })),
    legR: own(loft(leg, { steps: 3, camber: 0 })), legL: own(loft(mirror(leg), { steps: 3, camber: 0 })),
    pod: own(revolve([[0.02, -4.5], [0.2, -4.28], [0.36, -3.85], [0.46, -3.0], [0.5, -1.4], [0.5, 1.1], [0.44, 2.1], [0.33, 2.76], [0.17, 3.1], [0.02, 3.2]])),
    spinner: own(revolve([[0.015, -7.62], [0.1, -7.52], [0.2, -7.33], [0.3, -7.06], [0.37, -6.82], [0.4, -6.66], [0.4, -6.6]])),
    blade: own(bladeGeometry()),
    disc: own(new THREE.CircleGeometry(1.52, 48)),
    tyre: own(wheel([[0.2, -0.16], [0.33, -0.16], [0.39, -0.1], [0.4, 0], [0.39, 0.1], [0.33, 0.16], [0.2, 0.16]])),
    noseTyre: own(wheel([[0.17, -0.12], [0.28, -0.12], [0.335, -0.075], [0.34, 0], [0.335, 0.075], [0.28, 0.12], [0.17, 0.12]])),
    hubR: own(wheel([[0.02, -0.11], [0.19, -0.11], [0.2, 0.11], [0.02, 0.11]], 20)),
    oleo: own(new THREE.CylinderGeometry(0.06, 0.075, 0.95, 14)),
    link: own(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10)),
    stack: own(new THREE.CylinderGeometry(0.075, 0.09, 0.5, 12)),
    aerial: own(new THREE.BoxGeometry(0.03, 0.22, 0.34)),
    pitot: own(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8)),
    step: own(new THREE.BoxGeometry(0.42, 0.05, 0.16)),
    lamp: kit.sphere(0.06, 12, 8),
  };

  const template = new THREE.Group();
  put(g.fuselage, skin, template);
  put(g.pod, red, template, 0, -1.02, 0).scale.set(1, 0.74, 1);
  put(g.wingR, wingMat, template);
  put(g.wingL, wingMat, template);
  put(g.strutR, white, template);
  put(g.strutL, white, template);
  put(g.juryR, white, template);
  put(g.juryL, white, template);
  put(g.fin, finMat, template);
  put(g.stabR, stabMat, template);
  put(g.stabL, stabMat, template);

  // engine cowl details: exhaust stacks and the oil door
  for (const s of [1, -1]) {
    const st = put(g.stack, charcoal, template, s * 0.46, -0.52, -5.5);
    st.rotation.set(1.18, 0, s * 0.28);
  }
  // spinner and propeller
  put(g.spinner, polished, template);
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.z = -7.02;
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI * 2) / 3;
    put(g.blade, blade, arm, 0, 0, 0, false);
    prop.add(arm);
  }
  prop.userData.dynamic = true;
  template.add(prop);
  const disc = put(g.disc, discMat, template, 0, 0, -7.02, false);
  disc.name = 'disc';
  disc.userData.dynamic = true;

  // fixed tricycle gear: sprung main legs, a steerable nose leg
  for (const s of [1, -1]) {
    put(s > 0 ? g.legR : g.legL, white, template);
    put(g.tyre, rubber, template, s * 1.72, -1.6, 0.2);
    put(g.hubR, polished, template, s * 1.72, -1.6, 0.2);
  }
  put(g.oleo, steel, template, 0, -1.18, -5.0);
  put(g.link, steel, template, 0, -1.0, -4.72).rotation.x = 0.7;
  put(g.noseTyre, rubber, template, 0, -1.66, -5.0);
  put(g.hubR, polished, template, 0, -1.66, -5.0).scale.setScalar(0.85);

  // small things that make it read as a working aeroplane
  put(g.step, charcoal, template, 1.0, -0.95, -3.6).rotation.z = -0.24;
  put(g.aerial, charcoal, template, 0, 1.0, 1.6);
  put(g.aerial, charcoal, template, 0, -1.02, -2.4).scale.set(1, 0.7, 0.8);
  put(g.pitot, steel, template, -4.2, 0.78, -3.15).rotation.x = Math.PI / 2;

  // lights: wingtip navigation and strobes, fin-top and belly beacons
  put(g.lamp, starMat, template, 8.68, 1.32, -2.3, false);
  put(g.lamp, portMat, template, -8.68, 1.32, -2.3, false);
  for (const s of [1, -1]) put(g.lamp, strobeMat, template, s * 8.66, 1.33, -1.5, false).scale.setScalar(0.8);
  put(g.lamp, beaconMat, template, 0, 3.42, 5.6, false);
  put(g.lamp, beaconMat, template, 0, -1.42, 1.9, false).scale.setScalar(0.8);

  const airframe = kit.freeze(template);

  return {
    airframe,
    skin,
    beaconMat,
    strobeMat,
    /** Instances share geometry; each gets its own propeller so it can turn alone. */
    create(): Aircraft {
      const group = template.clone(true);
      const bladeMat = own(blade.clone());
      const myDisc = own(discMat.clone());
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material === blade) m.material = bladeMat;
      });
      const discMesh = group.getObjectByName('disc') as THREE.Mesh;
      discMesh.material = myDisc;
      return {
        group,
        prop: group.getObjectByName('prop')!,
        setProp(speed: number) {
          const k = clamp01(speed);
          bladeMat.opacity = 1 - 0.55 * k;
          bladeMat.transparent = k > 0.01;
          myDisc.opacity = 0.085 * k;
        },
      };
    },
  };
}
