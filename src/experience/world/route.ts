import * as THREE from 'three';
import { GEAR } from './aircraft';
import { SITE } from './sets';

type V3 = [number, number, number];
const v = (a: V3) => new THREE.Vector3(...a);

/* ── Flight plan of the lead aircraft ─────────────────────────
   Keys are [act time, position, heading]. Where a heading is given the
   aircraft is on the ground and holds it; where it is null the aircraft is
   flying and takes heading, pitch and bank from the path itself.           */

type Key = [t: number, p: V3, yaw: number | null];
const B = SITE.boardZ;
const SP = SITE.strip.park;

const HUB_X = 15; // where the hub sits on the destination chart

// One unbroken flight from the hangar to the last departure.
const FLIGHT: Key[][] = [
  [
    // on the apron, then away down the runway
    [0, [0, GEAR, -4], 0.34],
    [1.42, [0, GEAR, -4], 0.34],
    [1.56, [0, GEAR, -24], 0],
    [1.7, [0, GEAR, -95], 0],
    [1.8, [0, GEAR + 1.4, -175], null],
    // cruise up the valley, then down to the strip at dusk
    [2.0, [0, 70, -560], null],
    [2.42, [0, 72, -630], null],
    [2.72, [0, 44, -860], null],
    [3.0, [0, 10.5, -968], null],
    [3.42, [0, 7, -984], null],
    [3.56, [0, GEAR + 0.2, -1010], null],
    [3.66, [0, GEAR, -1040], 0],
    [3.82, [3, GEAR, -1084], -0.5],
    [3.94, [SP.x, GEAR, SP.z], SITE.strip.parkYaw],
    [4.44, [SP.x, GEAR, SP.z], SITE.strip.parkYaw],
    // back-track, depart to the south, and climb out over the destination chart
    [4.53, [0, GEAR, -1110], -Math.PI],
    [4.62, [0, GEAR, -1050], -Math.PI],
    [4.69, [0, GEAR + 2.5, -985], null],
    [4.82, [4, 74, -820], null],
    [5.0, [HUB_X, 128, -672], null],
    [5.5, [HUB_X, 132, -520], null],
    // down to the home field, a pass along the runway, and round into the circuit
    [5.8, [0, 92, -400], null],
    [6.0, [0, 34, -180], null],
    [6.42, [0, 15, -55], null],
    [6.6, [14, 32, 80], null],
    [6.74, [-38, 38, 150], null],
    [6.86, [-62, 22, 62], null],
    [6.96, [-28, 8.5, -18], null],
    ...B.flatMap((z, k): Key[] => [
      [7 + k * 0.165, [-25, 6 + k * 3.2, z - 8], null],
      [7 + k * 0.165 + 0.1, [-25, 6.4 + k * 3.2, z - 15], null],
    ]),
    // a wide circuit while the camera is on the campus, then in over the hangar and away into the sunset
    [7.9, [-25, 30, -340], null],
    [8.2, [-80, 80, -560], null],
    [8.5, [-220, 110, -420], null],
    [8.8, [-262, 112, -150], null],
    [9.1, [-205, 92, 90], null],
    [9.36, [-95, 66, 250], null],
    [9.62, [0, 42, 250], null],
    [9.86, [0, 21, 78], null],
    [10.0, [0, 13.5, -22], null],
    [10.25, [0, 8.5, -120], null],
    [10.6, [0, 28, -300], null],
    [11.0, [0, 80, -560], null],
  ],
];

class Leg<K extends [number, ...unknown[]]> {
  t0: number;
  t1: number;
  last: number;
  constructor(public keys: K[], public curves: THREE.CatmullRomCurve3[]) {
    this.t0 = keys[0][0];
    this.t1 = keys[keys.length - 1][0];
    this.last = keys.length - 1;
  }
  /** Segment index and local position for a time on this leg. */
  at(t: number) {
    let j = 0;
    while (j < this.last - 1 && t > this.keys[j + 1][0]) j++;
    const s = THREE.MathUtils.clamp((t - this.keys[j][0]) / ((this.keys[j + 1][0] as number) - this.keys[j][0]), 0, 1);
    return { j, s, u: (j + s) / this.last };
  }
}
const curve = (pts: V3[]) => new THREE.CatmullRomCurve3(pts.map(v), false, 'centripetal');

const flightLegs = FLIGHT.map((keys) => new Leg(keys, [curve(keys.map((k) => k[1]))]));

export interface Pose {
  visible: boolean;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  /** 0 on the ground … 1 flying, for idle float. */
  air: number;
}

const tan = new THREE.Vector3();
const headingAt = (leg: Leg<Key>, t: number, out: THREE.Vector3) => {
  const { j, s, u } = leg.at(t);
  leg.curves[0].getPoint(u, out);
  leg.curves[0].getTangent(u, tan);
  const a = leg.keys[j][2], b = leg.keys[j + 1][2];
  const path = Math.atan2(-tan.x, -tan.z);
  const moving = tan.lengthSq() > 1e-6;
  const ya = a ?? (moving ? path : (b ?? 0));
  const yb = b ?? (moving ? path : (a ?? 0));
  // shortest way round between the two
  const d = Math.atan2(Math.sin(yb - ya), Math.cos(yb - ya));
  const k = s * s * (3 - 2 * s);
  const air = (a === null ? 1 : 0) * (1 - k) + (b === null ? 1 : 0) * k;
  return { yaw: ya + d * k, pitch: Math.asin(THREE.MathUtils.clamp(tan.y, -1, 1)) * air, air };
};

const tmp = new THREE.Vector3();
export function flightPose(t: number, out: Pose): Pose {
  const leg = flightLegs.find((l) => t >= l.t0 && t <= l.t1);
  out.visible = !!leg;
  if (!leg) return out;
  const h = headingAt(leg, t, out.position);
  const e = 0.012;
  const y0 = headingAt(leg, Math.max(leg.t0, t - e), tmp).yaw;
  const y1 = headingAt(leg, Math.min(leg.t1, t + e), tmp).yaw;
  out.yaw = h.yaw;
  out.pitch = h.pitch * 0.85;
  out.air = h.air;
  out.roll = THREE.MathUtils.clamp(Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0)) * 0.9, -0.7, 0.7) * h.air;
  return out;
}

/* ── Camera route ─────────────────────────────────────────────
   [act time, position, look-at, horizontal framing shift, portrait pull-back].
   Every chapter is a stop: the camera arrives, drifts while the copy is up,
   and moves on.             */

type Stop = [t: number, pos: V3, look: V3, sx: number, pb?: number];
const P = new THREE.Vector3();
const pose: Pose = { visible: true, position: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, air: 0 };
/** A stop defined relative to where the aircraft is at that moment. */
const rel = (t: number, off: V3, look: V3, sx: number, pb?: number): Stop => {
  flightPose(t, pose);
  P.copy(pose.position);
  return [t, [P.x + off[0], P.y + off[1], P.z + off[2]], [P.x + look[0], P.y + look[1], P.z + look[2]], sx, pb];
};

const C = SITE.chart;
const TR = SITE.trainer.pos;

const ROUTE: Stop[][] = [
  [
    // 0 — inside the hangar at dawn, looking out past the aircraft
    [0, [-6.5, 2.3, 44], [1.5, 3.1, -40], 0.13, 1.0],
    [0.5, [-5.2, 2.6, 33], [1, 3, -40], 0.13, 1.0],
    [0.78, [-1.5, 3.6, 13], [0, 2.4, -10], 0.04],
    [0.9, [15, 6, -15], [0, 2.4, -4], 0],
    // 1 — out front, the two signs either side of the nose
    [1.0, [0.5, 2.1, -38], [0, 4.6, -4], 0, 1.25],
    [1.4, [0.2, 2.0, -39.5], [0, 4.7, -4], 0, 1.25],
    [1.56, [19, 2.3, -40], [0, 2, -26], 0],
    rel(1.7, [21, -0.5, -13], [0, 0.2, -3], 0.05),
    rel(1.84, [23, 0.8, -17], [0, 0.4, -2], 0.12),
    // 2 — airborne over the highlands
    rel(2.0, [25, -3.2, -22], [0, 2.6, -1], 0.2),
    rel(2.42, [23.5, -4, -23.5], [0, 2.6, -1], 0.2),
    rel(2.72, [-21, 6.5, -33], [0, 0.4, 0], -0.1),
    // 3 — on the strip at dusk, watching it come in
    [3.0, [-5.5, 1.3, -1026], [0.5, 8.4, -975], -0.2],
    [3.42, [-5.8, 1.25, -1028], [0.5, 6.6, -988], -0.2],
    [3.6, [-9, 1.6, -1040], [0, 2.4, -1022], -0.08],
    [3.8, [-10, 2.6, -1064], [3, 2, -1086], 0],
    // 4 — morning: unloaded beside the aircraft
    [4.0, [27.5, 1.4, -1070.5], [13.5, 4.6, -1090], 0.18],
    [4.42, [26.2, 1.5, -1068], [13.5, 4.6, -1090], 0.18],
    // it back-tracks and departs; the camera goes with it
    rel(4.62, [24, 3, 10], [0, 0.6, 0], 0.05),
    rel(4.76, [26, -3, 38], [0, 1, 0], 0),
    // 5 — the destination chart, drawn in the air; the aircraft crosses it
    [5.0, [C.x - 24, C.y + 300, C.z + 196], [C.x + 8, C.y, C.z + 12], 0.19, 1.6],
    [5.5, [C.x - 14, C.y + 288, C.z + 184], [C.x + 9, C.y, C.z + 8], 0.19, 1.6],
    rel(5.8, [-34, 12, 64], [0, 0, 0], 0),
    // 6 — the home field again, from the academy side
    [6.0, [-76, 24, -26], [24, 6, -136], 0.1],
    [6.42, [-68, 20, -34], [26, 6, -140], 0.1],
    [6.82, [-9, 5, -30], [SITE.boardX, 2.7, B[0]], 0],
    // 7 — along the runway edge, one board per programme
    ...B.flatMap((z, k): Stop[] => [
      [7 + k * 0.165, [-9, 2.3, z + 12.8], [SITE.boardX + 0.3, 3.9, z - 6], -0.16, 1.45],
      [7 + k * 0.165 + 0.1, [-9.3, 2.3, z + 11.6], [SITE.boardX + 0.3, 3.9, z - 6], -0.16, 1.45],
    ]),
    [7.9, [-8, 6, -214], [16, 6, -160], 0],
    // 8 — the campus, laid out across the frame
    // from higher up, so the campus sits in the upper half and the runway below it carries the copy
    [8.0, [-75, 30, -130], [42, -12.5, -134], 0, 1.5],
    [8.62, [-70, 27.5, -146], [42, -12, -133], 0, 1.5],
    [8.86, [8, 6, -112], [TR.x, 2, TR.z], 0.1],
    // 9 — walk-round: nose, wing, tail
    [9.0, [TR.x - 20, 1.9, TR.z - 16], [TR.x - 2.5, 4.4, TR.z - 2], 0.18],
    [9.14, [TR.x - 19, 2.0, TR.z - 17], [TR.x - 2.5, 4.4, TR.z - 2], 0.18],
    [9.28, [TR.x + 13, 2.6, TR.z - 21], [TR.x + 3, 4.6, TR.z - 3], 0.17],
    [9.4, [TR.x + 14, 2.6, TR.z - 20.4], [TR.x + 3, 4.6, TR.z - 3], 0.17],
    [9.54, [TR.x + 21, 3.4, TR.z + 1], [TR.x + 3, 5.2, TR.z + 2], 0.17],
    [9.66, [TR.x + 21.3, 3.4, TR.z + 2], [TR.x + 3, 5.2, TR.z + 2], 0.17],
    [9.84, [14, 7, -34], [0, 2.4, -14], 0],
    // 10 — at the hangar door again, sunset, as it leaves
    [10.0, [0, 1.9, 12.5], [0, 4, -80], 0, 1.0],
    [10.28, [0, 2.0, 10], [0, 7, -120], 0, 1.0],
    // the camera lifts off the runway into the night sky as the forms come up
    [10.55, [0, 2.6, 9], [0, 62, -150], 0, 1.0],
    [11.0, [0, 3, 8], [0, 170, -240], 0, 1.0],
  ],
];

const cameraLegs = ROUTE.map((stops) => new Leg(stops, [curve(stops.map((s) => s[1])), curve(stops.map((s) => s[2]))]));

export interface Shot {
  shift: number;
  pullback: number;
}
export function sampleCamera(t: number, pos: THREE.Vector3, look: THREE.Vector3, shot: Shot): Shot {
  const leg = cameraLegs.find((l) => t <= l.t1) ?? cameraLegs[cameraLegs.length - 1];
  const { j, s, u } = leg.at(Math.max(t, leg.t0));
  leg.curves[0].getPoint(u, pos);
  leg.curves[1].getPoint(u, look);
  const a = leg.keys[j], b = leg.keys[j + 1];
  shot.shift = a[3] + (b[3] - a[3]) * s;
  shot.pullback = (a[4] ?? 1.3) + ((b[4] ?? 1.3) - (a[4] ?? 1.3)) * s;
  return shot;
}

/* ── Grade: time of day along the route ───────────────────── */

interface GradeDef {
  t: number;
  top: string;
  horizon: string;
  sunColor: string;
  sun: V3;
  key: number;
  hemi: number;
  fog: number;
  stars: number;
  exposure: number;
}
// One day, in order: sunrise in the hangar, noon over the valley, a long
// afternoon at the academy, sunset on the last runway, night over the forms.
// Zeniths stay deep and horizons mid-toned so light copy reads against the sky.
const GRADES: GradeDef[] = [
  { t: 0, top: '#061730', horizon: '#cc8048', sunColor: '#ffb47c', sun: [0.1, 0.07, -1], key: 3.2, hemi: 0.3, fog: 0.0032, stars: 0.35, exposure: 0.98 },
  { t: 1, top: '#0a2850', horizon: '#b08a68', sunColor: '#ffd2a4', sun: [0.25, 0.2, -1], key: 3.4, hemi: 0.5, fog: 0.0028, stars: 0, exposure: 0.95 },
  { t: 2, top: '#0a2f5e', horizon: '#6b8ca6', sunColor: '#fff0d8', sun: [0.6, 0.5, -0.5], key: 3.6, hemi: 0.6, fog: 0.0022, stars: 0, exposure: 0.92 },
  { t: 3, top: '#0a2f5e', horizon: '#5f88aa', sunColor: '#fff6e6', sun: [-0.3, 0.8, -0.4], key: 3.8, hemi: 0.62, fog: 0.0022, stars: 0, exposure: 0.92 },
  { t: 4, top: '#0a2e5c', horizon: '#6789a4', sunColor: '#fff4e0', sun: [0.6, 0.62, 0.5], key: 3.8, hemi: 0.6, fog: 0.0022, stars: 0, exposure: 0.92 },
  { t: 5, top: '#0a2a52', horizon: '#5b7d98', sunColor: '#ffefd4', sun: [-0.55, 0.5, 0.5], key: 3.3, hemi: 0.5, fog: 0.0016, stars: 0, exposure: 0.9 },
  { t: 6, top: '#0a2850', horizon: '#74889a', sunColor: '#ffe7c4', sun: [-0.6, 0.4, 0.55], key: 3.5, hemi: 0.54, fog: 0.0022, stars: 0, exposure: 0.92 },
  { t: 7, top: '#0a2448', horizon: '#8f8a86', sunColor: '#ffdcae', sun: [0.5, 0.26, 0.6], key: 3.5, hemi: 0.5, fog: 0.0023, stars: 0, exposure: 0.92 },
  { t: 8, top: '#092040', horizon: '#b08460', sunColor: '#ffc98f', sun: [-0.8, 0.17, 0.3], key: 3.4, hemi: 0.44, fog: 0.0024, stars: 0, exposure: 0.94 },
  { t: 9, top: '#081a36', horizon: '#c67a48', sunColor: '#ffb074', sun: [-0.62, 0.1, -0.7], key: 3.0, hemi: 0.38, fog: 0.0026, stars: 0.1, exposure: 0.96 },
  { t: 10.0, top: '#050f22', horizon: '#c0623a', sunColor: '#ff9050', sun: [0.02, 0.035, -1], key: 2.3, hemi: 0.3, fog: 0.003, stars: 0.5, exposure: 1.0 },
  { t: 10.35, top: '#030916', horizon: '#6a3320', sunColor: '#ff8448', sun: [0.02, 0.01, -1], key: 1.0, hemi: 0.2, fog: 0.0032, stars: 0.9, exposure: 1.0 },
  { t: 10.65, top: '#02040a', horizon: '#150c0c', sunColor: '#8fa6d6', sun: [0.2, 0.5, -0.6], key: 0.35, hemi: 0.1, fog: 0.0034, stars: 1, exposure: 1.0 },
  { t: 11.0, top: '#02040a', horizon: '#0d0909', sunColor: '#8fa6d6', sun: [0.2, 0.5, -0.6], key: 0.3, hemi: 0.1, fog: 0.0034, stars: 1, exposure: 1.0 },
];
const grades = GRADES.map((g) => ({
  ...g,
  top: new THREE.Color(g.top),
  horizon: new THREE.Color(g.horizon),
  sunColor: new THREE.Color(g.sunColor),
  sun: v(g.sun).normalize(),
}));
export type Grade = (typeof grades)[number];

export function sampleGrade(t: number, out: Grade): Grade {
  let j = 0;
  while (j < grades.length - 2 && t > grades[j + 1].t) j++;
  const a = grades[j], b = grades[j + 1];
  const s = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  out.top.lerpColors(a.top, b.top, s);
  out.horizon.lerpColors(a.horizon, b.horizon, s);
  out.sunColor.lerpColors(a.sunColor, b.sunColor, s);
  out.sun.lerpVectors(a.sun, b.sun, s).normalize();
  for (const k of ['key', 'hemi', 'fog', 'stars', 'exposure'] as const) out[k] = a[k] + (b[k] - a[k]) * s;
  return out;
}
export const newGrade = (): Grade => ({ ...grades[0], top: new THREE.Color(), horizon: new THREE.Color(), sunColor: new THREE.Color(), sun: new THREE.Vector3() });
