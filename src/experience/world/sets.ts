import * as THREE from 'three';
import { destinations, hub, programmes } from '@/content/site';
import { GEAR, type Aircraft } from './aircraft';
import { rng, type Kit, type Painter } from './kit';

/**
 * The built world, laid out along one route:
 *
 *   home field   quonset hangar, apron, runway, taxi signs, the five
 *                programme boards along the runway edge, and the academy
 *                campus (tower, ground school, simulator hall, ramp)
 *   bush strip   a dirt strip in the valley, lanterns, shed, cargo
 *   chart        the destination network, drawn to scale in the air above the
 *                valley so the aircraft flies across it on the way home
 *
 * Builders return their group plus an `update(p, time)` that poses anything
 * the scroll timeline drives. Nothing keeps a clock of its own except small
 * idle motion (a windsock, a beacon flash).
 */

export const SITE = {
  hangarDoorZ: 14,
  park: new THREE.Vector3(0, GEAR, -4),
  signs: { fly: new THREE.Vector3(7.4, 0, -13), train: new THREE.Vector3(-7.4, 0, -13) },
  boardX: -13.5,
  boardZ: [-60, -100, -140, -180, -220],
  trainer: { pos: new THREE.Vector3(38, GEAR, -90), yaw: 0.9 },
  tower: new THREE.Vector3(30, 0, -120),
  school: new THREE.Vector3(50, 0, -142),
  quad: new THREE.Vector3(35, 0, -161),
  sim: new THREE.Vector3(46, 0, -182),
  strip: { z0: -990, z1: -1120, park: new THREE.Vector3(9, GEAR, -1092), parkYaw: -1.9 },
  chart: new THREE.Vector3(0, 62, -560),
};

const CHART_SCALE = 12.5; // world units per degree
const CHART_LON = [29.5, 45.5], CHART_LAT = [-3.5, 16];
const CHART_W = (CHART_LON[1] - CHART_LON[0]) * CHART_SCALE;
const CHART_H = (CHART_LAT[1] - CHART_LAT[0]) * CHART_SCALE;
export const chartPoint = (lat: number, lon: number, lift = 0) =>
  new THREE.Vector3(
    SITE.chart.x + (lon - (CHART_LON[0] + CHART_LON[1]) / 2) * CHART_SCALE,
    SITE.chart.y + lift,
    SITE.chart.z - (lat - (CHART_LAT[0] + CHART_LAT[1]) / 2) * CHART_SCALE,
  );

/** Timeline parameters the sets read. */
export interface Params {
  prop: number;
  lamps: number;
  lights: number;
  lantern: number;
  beacon: number;
  landing: number;
  dims: number;
  routes: number;
  /** Landing gear: 0 down … 1 retracted. */
  gear: number;
  /** Cabin lighting seen through the windows. */
  cabin: number;
}

export type Anchors = Record<string, THREE.Vector3>;

/* ── Quonset hangar ───────────────────────────────────────── */

function quonset(kit: Kit, R: number, H: number, L: number, doorW: number, doorH: number) {
  const { mats, own, put, block } = kit;
  const g = new THREE.Group();
  const arch = (r: number, h: number, t: number) => {
    const s = new THREE.Shape();
    s.absellipse(0, 0, r, h, 0, Math.PI, false, 0);
    s.lineTo(-r + t, 0);
    s.absellipse(0, 0, r - t, h - t, Math.PI, 0, true, 0);
    s.closePath();
    return s;
  };
  put(own(new THREE.ExtrudeGeometry(arch(R, H, 0.22), { depth: L, bevelEnabled: false, curveSegments: 30 })), mats.tin, g);
  const rib = own(new THREE.ExtrudeGeometry(arch(R - 0.2, H - 0.2, 0.42), { depth: 0.34, bevelEnabled: false, curveSegments: 30 }));
  for (let z = 0.6; z < L; z += L / Math.round(L / 5.2)) put(rib, mats.tinDark, g, 0, 0, z);
  // purlins along the roof
  [0.32, 0.5, 0.68].forEach((f) => {
    const a = Math.PI * f;
    put(kit.box(0.18, 0.18, L), mats.tinDark, g, Math.cos(a) * (R - 0.7), Math.sin(a) * (H - 0.7), L / 2);
  });
  const back = new THREE.Shape();
  back.absellipse(0, 0, R, H, 0, Math.PI, false, 0);
  back.closePath();
  put(own(new THREE.ExtrudeGeometry(back, { depth: 0.3, bevelEnabled: false, curveSegments: 30 })), mats.tin, g, 0, 0, L - 0.3);
  const front = new THREE.Shape();
  front.absellipse(0, 0, R, H, 0, Math.PI, false, 0);
  front.lineTo(-doorW / 2, 0);
  front.lineTo(-doorW / 2, doorH);
  front.lineTo(doorW / 2, doorH);
  front.lineTo(doorW / 2, 0);
  front.closePath();
  put(own(new THREE.ExtrudeGeometry(front, { depth: 0.34, bevelEnabled: false, curveSegments: 30 })), mats.tin, g);
  block(doorW + 1.2, 0.36, 0.5, mats.tinDark, g, 0, doorH, 0.1);
  // the doors, slid open
  [-1, 1].forEach((s) => block(doorW / 4, doorH, 0.18, mats.tinDark, g, s * (doorW / 2 + doorW / 8 - 0.3), 0, -0.3));
  block(R * 2, 0.08, L, mats.concreteDark, g, 0, -0.05, L / 2);
  return g;
}

/* ── Home field ───────────────────────────────────────────── */

const runwayPaint: Painter = (ctx, W, H) => {
  const rand = rng(3);
  const u = H / 350; // px per world unit along the runway
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.05})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 2 + rand() * 14);
  }
  // rubber where aircraft touch down
  for (const end of [0.12, 0.88]) {
    const g = ctx.createRadialGradient(W / 2, H * (1 - end), 0, W / 2, H * (1 - end), W * 2.4);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.2, 0, W * 0.6, H);
  }
  ctx.fillStyle = '#9d9a90';
  ctx.fillRect(9, 0, 4, H);
  ctx.fillRect(W - 13, 0, 4, H);
  for (let d = 34; d < 316; d += 30) ctx.fillRect(W / 2 - 2.5, H - (d + 15) * u, 5, 15 * u);
  for (const flip of [false, true]) {
    const y = (d: number, len: number) => (flip ? d * u : H - (d + len) * u);
    for (let i = 0; i < 8; i++) {
      const x = 24 + i * 25 + (i > 3 ? 12 : 0);
      ctx.fillRect(x, y(3, 14), 14, 14 * u);
    }
    ctx.fillRect(W / 2 - 62, y(52, 16), 34, 16 * u);
    ctx.fillRect(W / 2 + 28, y(52, 16), 34, 16 * u);
  }
};

export function buildHomeField(kit: Kit, aircraft: () => Aircraft) {
  const { mats, own, put, block, cyl, box, sphere, sign, glow } = kit;
  const group = new THREE.Group();
  const rand = rng(21);
  const anchors: Anchors = {};

  // Runway and apron
  const rw = new THREE.PlaneGeometry(20, 350);
  rw.rotateX(-Math.PI / 2);
  put(own(rw), kit.std('#ffffff', 0.92, 0, { map: kit.paint(256, kit.lite ? 2048 : 4096, runwayPaint) }), group, 0, 0.04, -165, false);
  block(64, 0.05, 44, mats.concreteDark, group, 0, 0, 30);
  block(0.22, 0.02, 34, mats.yellow, group, 0, 0.055, 26);
  for (let z = 6; z >= -340; z -= 12) {
    [-10.6, 10.6].forEach((x) => {
      put(cyl(0.07, 0.09, 0.3, 6), mats.steel, group, x, 0.15, z, false);
      glow(x, 0.38, z, z === 6 ? '#7dffb0' : z < -334 ? '#ff5a4a' : '#fff1cf', 1.5, 0);
    });
  }
  for (let x = -8; x <= 8; x += 2.3) glow(x, 0.3, 9, '#7dffb0', 1.3, 0);

  // Hangar, looking down the runway
  const hangar = quonset(kit, 17, 11, 36, 24, 7);
  hangar.position.z = SITE.hangarDoorZ;
  group.add(hangar);
  // lettering over the door
  const nameTex = kit.paint(2048, 256, (ctx, W, H, f) => {
    ctx.fillStyle = '#0b2740';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ece5d6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 150px ${f.display}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '34px';
    ctx.fillText('ABYSSINIAN', W / 2 + 17, H / 2 + 8);
  });
  const name = put(own(new THREE.PlaneGeometry(16, 2)), kit.std('#ffffff', 0.7, 0, { map: nameTex }), group, 0, 8.7, SITE.hangarDoorZ - 0.04, false);
  name.rotation.y = Math.PI;

  // Inside: a second aircraft, benches, tools, lamps
  const inside = new THREE.Group();
  inside.position.z = SITE.hangarDoorZ;
  group.add(inside);
  const parked = aircraft();
  parked.group.position.set(7.6, GEAR, 21.5);
  parked.group.rotation.y = 0.32;
  inside.add(parked.group);
  block(7, 0.12, 1.5, mats.woodDark, inside, -13.2, 1.0, 16).rotation.y = 0;
  [-16, -10.6].forEach((x) => block(0.14, 1, 1.3, mats.steel, inside, x, 0, 16));
  block(1.5, 1.25, 0.8, mats.tinDark, inside, -14.2, 0, 11.5);
  block(1.3, 0.5, 0.7, mats.tinDark, inside, -14.2, 1.25, 11.5);
  for (let i = 0; i < 5; i++) put(cyl(0.42, 0.42, 1.15, 14), i % 2 ? mats.drum : mats.tinDark, inside, -14.6 + (i % 3) * 0.95, 0.58, 23 + Math.floor(i / 3) * 0.95);
  [[-12.5, 28, 1.4], [-11.3, 29.2, 1.1], [-12.4, 28.4, 0.9]].forEach(([x, z, s], i) => block(s, s, s, i === 2 ? mats.woodDark : mats.wood, inside, x, i === 2 ? 1.4 : 0, z));
  // step ladder
  const ladder = new THREE.Group();
  ladder.position.set(-6.5, 0, 12);
  [-0.42, 0.42].forEach((x) => {
    put(box(0.07, 3.3, 0.07), mats.steel, ladder, x, 1.6, 0.42).rotation.x = 0.26;
    put(box(0.07, 3.3, 0.07), mats.steel, ladder, x, 1.6, -0.42).rotation.x = -0.26;
  });
  for (let i = 0; i < 5; i++) put(box(0.84, 0.05, 0.22), mats.steel, ladder, 0, 0.55 + i * 0.55, 0.7 - i * 0.14);
  inside.add(ladder);
  const lampMat = kit.emissive('#ffd9a0', 1);
  const lamps: THREE.Vector3[] = [];
  [[-7, 9], [7, 9], [-7, 22], [7, 22], [0, 31]].forEach(([x, z]) => {
    const y = 7.6 - Math.abs(x) * 0.13;
    put(cyl(0.02, 0.02, 2.2, 5), mats.graphite, inside, x, y + 1.3, z, false);
    put(own(new THREE.ConeGeometry(0.7, 0.45, 18, 1, true)), mats.graphite, inside, x, y + 0.1, z, false);
    put(sphere(0.16, 10, 8), lampMat, inside, x, y - 0.08, z, false);
    lamps.push(new THREE.Vector3(x, y - 0.1, z + SITE.hangarDoorZ));
    glow(x, y - 0.1, z + SITE.hangarDoorZ, '#ffcf8f', 3.2, 3);
  });
  const lampLight = new THREE.PointLight('#ffc98a', 0, 60, 1.6);
  lampLight.position.set(0, 6.4, SITE.hangarDoorZ + 16);
  group.add(lampLight);

  // Windsock
  const sock = new THREE.Group();
  sock.position.set(15, 0, -34);
  put(cyl(0.06, 0.09, 6, 8), mats.steel, sock, 0, 3, 0);
  const sockCone = put(own(new THREE.ConeGeometry(0.42, 2.6, 12, 1, true)), kit.std('#d9672b', 0.9, 0, { side: THREE.DoubleSide }), sock, 0, 5.8, 0);
  sockCone.geometry.rotateZ(Math.PI / 2);
  sockCone.geometry.translate(1.3, 0, 0);
  group.add(sock);

  // Taxi signs: the two journeys, in the airfield's own sign language
  const taxi = (label: string, arrow: 'left' | 'right'): Painter => (ctx, W, H, f) => {
    ctx.fillStyle = '#d9a92a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.fillStyle = '#111';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${H * 0.62}px ${f.display}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
    const ax = arrow === 'left' ? 96 : W - 96;
    ctx.textAlign = arrow === 'left' ? 'left' : 'right';
    ctx.fillText(label, arrow === 'left' ? 190 : W - 190, H / 2 + 8);
    ctx.lineWidth = 16;
    ctx.lineCap = 'square';
    const d = arrow === 'left' ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(ax - d * 46, H / 2);
    ctx.lineTo(ax + d * 46, H / 2);
    ctx.moveTo(ax + d * 14, H / 2 - 34);
    ctx.lineTo(ax + d * 48, H / 2);
    ctx.lineTo(ax + d * 14, H / 2 + 34);
    ctx.stroke();
  };
  // seen from in front of the aircraft, looking back at the hangar: +X is screen-left
  // (and from behind, at the end of the route, they point the same two ways)
  sign(4.2, 1.35, [1024, 330], taxi('FLY', 'left'), group, SITE.signs.fly.x, SITE.signs.fly.z, Math.PI, 1.1, taxi('FLY', 'right'));
  sign(4.6, 1.35, [1120, 330], taxi('TRAIN', 'right'), group, SITE.signs.train.x, SITE.signs.train.z, Math.PI, 1.1, taxi('TRAIN', 'left'));
  anchors['sign:fly'] = SITE.signs.fly.clone().setY(3.3);
  anchors['sign:train'] = SITE.signs.train.clone().setY(3.3);

  // The training pathway: one distance board per programme along the runway edge
  programmes.forEach((prog, i) => {
    const draw: Painter = (ctx, W, H, f) => {
      ctx.fillStyle = '#0c0d0f';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f2ede2';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = `500 54px ${f.mono}`;
      ctx.fillText(`0${i + 1} / 0${programmes.length}`, 64, 112);
      ctx.fillStyle = '#e8b521';
      ctx.fillRect(64, 142, W - 128, 6);
      ctx.fillStyle = '#f2ede2';
      ctx.font = `700 ${prog.code.length > 3 ? 250 : 330}px ${f.display}`;
      ctx.fillText(prog.code, 54, H - 150);
      ctx.font = `500 50px ${f.mono}`;
      ctx.fillText(prog.name.en.toUpperCase(), 64, H - 64);
    };
    sign(5.4, 3.4, [1024, 644], draw, group, SITE.boardX, SITE.boardZ[i], 0.64, 1.3);
    glow(SITE.boardX - 1, 5.0, SITE.boardZ[i], '#fff1cf', 1.2, 0);
  });

  // Academy campus
  const campus = new THREE.Group();
  group.add(campus);
  block(36, 0.05, 34, mats.concrete, campus, 46, 0, -90);
  // control tower
  const T = SITE.tower;
  const towerMat = kit.std('#8a8479', 0.9);
  block(6.5, 3.6, 6.5, towerMat, campus, T.x, 0, T.z);
  block(3.2, 15, 3.2, towerMat, campus, T.x, 3.6, T.z);
  put(cyl(4.4, 3.2, 0.5, 8), mats.graphite, campus, T.x, 18.85, T.z);
  put(cyl(4.1, 3.5, 2.7, 8, ), mats.glass, campus, T.x, 20.45, T.z);
  put(cyl(4.6, 4.6, 0.36, 8), mats.graphite, campus, T.x, 21.98, T.z);
  put(cyl(0.05, 0.05, 4, 6), mats.steel, campus, T.x + 1, 24, T.z, false);
  glow(T.x + 1, 26.1, T.z, '#ff5a4a', 2.2, 2);
  anchors['env:instructors'] = new THREE.Vector3(T.x, 23.4, T.z);
  // ground school: a long, low block with a window band
  const S = SITE.school;
  block(12, 4.4, 28, mats.ivory, campus, S.x, 0, S.z);
  block(12.3, 1.5, 26.4, mats.glass, campus, S.x - 0.02, 1.7, S.z);
  block(13.6, 0.34, 29.6, mats.graphite, campus, S.x, 4.4, S.z);
  for (let z = -12; z <= 12; z += 4.8) block(0.3, 4.4, 0.3, mats.ivory, campus, S.x - 6.2, 0, S.z + z);
  block(3.4, 0.2, 4.2, mats.graphite, campus, S.x - 7.6, 2.9, S.z + 6);
  anchors['env:campus'] = new THREE.Vector3(S.x - 2, 5.8, S.z);
  // simulator hall
  const M = SITE.sim;
  block(14, 7.4, 14, mats.graphite, campus, M.x, 0, M.z);
  block(0.3, 5, 9, mats.glass, campus, M.x - 7.05, 0.6, M.z);
  block(9.5, 0.9, 9.5, mats.tinDark, campus, M.x, 7.4, M.z);
  [-3, 0, 3].forEach((d) => put(cyl(0.5, 0.5, 1.4, 12), mats.tin, campus, M.x + d, 9, M.z + 3));
  anchors['env:simulator'] = new THREE.Vector3(M.x - 2, 9.6, M.z);
  // quad between them
  const Q = SITE.quad;
  block(12, 0.06, 9, mats.concrete, campus, Q.x, 0, Q.z);
  [-3, 0, 3].forEach((d) => {
    block(2.2, 0.1, 0.5, mats.wood, campus, Q.x + d, 0.5, Q.z + (d ? 2.4 : -2.4));
    [-0.9, 0.9].forEach((o) => block(0.1, 0.5, 0.45, mats.steel, campus, Q.x + d + o, 0, Q.z + (d ? 2.4 : -2.4)));
  });
  anchors['env:community'] = new THREE.Vector3(Q.x, 2.4, Q.z);
  // ramp hangar and the trainer on the ramp
  const ramp = quonset(kit, 9, 6.4, 16, 13, 4.5);
  ramp.position.set(60, 0, -84);
  ramp.rotation.y = Math.PI / 2;
  campus.add(ramp);
  const trainer = aircraft();
  trainer.group.position.copy(SITE.trainer.pos);
  trainer.group.rotation.y = SITE.trainer.yaw;
  campus.add(trainer.group);
  [[-1.55, 0.62], [1.55, 0.62]].forEach(([x, z]) => block(0.7, 0.24, 0.24, mats.graphite, trainer.group, x, -GEAR, z)); // chocks
  anchors['env:aircraft'] = SITE.trainer.pos.clone().add(new THREE.Vector3(0, 5.2, 0));
  const fwd = new THREE.Vector3(-Math.sin(SITE.trainer.yaw), 0, -Math.cos(SITE.trainer.yaw));
  const right = new THREE.Vector3(Math.cos(SITE.trainer.yaw), 0, -Math.sin(SITE.trainer.yaw));
  // walk-round stations: nose, wingtip, tail
  anchors['trust:0'] = SITE.trainer.pos.clone().addScaledVector(fwd, 8.9).add(new THREE.Vector3(0, -0.2, 0));
  anchors['trust:1'] = SITE.trainer.pos.clone().addScaledVector(right, 8.2).addScaledVector(fwd, -4.6).add(new THREE.Vector3(0, 1.5, 0));
  anchors['trust:2'] = SITE.trainer.pos.clone().addScaledVector(fwd, -7.4).add(new THREE.Vector3(0, 5.1, 0));

  // a few stored things on the apron edge so it reads as a working field
  for (let i = 0; i < 4; i++) put(cyl(0.42, 0.42, 1.15, 14), i % 2 ? mats.drum : mats.tinDark, group, -19 - rand() * 3, 0.6, 4 + i * 1.1);

  void lamps;
  return {
    group,
    anchors,
    props: [parked, trainer],
    update(p: Params, time: number) {
      lampMat.emissiveIntensity = 0.2 + p.lamps * 3;
      lampLight.intensity = p.lamps * 90;
      sock.rotation.y = 0.5 + Math.sin(time * 0.5) * 0.25;
      sockCone.rotation.z = -0.18 + Math.sin(time * 2.1) * 0.06;
    },
  };
}

/* ── Bush strip ───────────────────────────────────────────── */

export function buildStrip(kit: Kit) {
  const { mats, own, put, block, cyl, box, sphere, glow } = kit;
  const group = new THREE.Group();
  const rand = rng(8);
  const { z0, z1 } = SITE.strip;

  const dirt = new THREE.PlaneGeometry(17, z0 - z1);
  dirt.rotateX(-Math.PI / 2);
  const dirtTex = kit.paint(256, 2048, (ctx, W, H) => {
    const r = rng(4);
    ctx.fillStyle = '#5e4330';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 7000; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '40,24,14' : '150,120,90'},${r() * 0.1})`;
      ctx.fillRect(r() * W, r() * H, 2 + r() * 5, 3 + r() * 22);
    }
    ctx.fillStyle = 'rgba(60,36,22,0.28)';
    ctx.fillRect(W * 0.3, 0, 12, H);
    ctx.fillRect(W * 0.66, 0, 12, H);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(76,74,51,0.95)');
    g.addColorStop(0.1, 'rgba(76,74,51,0)');
    g.addColorStop(0.9, 'rgba(76,74,51,0)');
    g.addColorStop(1, 'rgba(76,74,51,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  put(own(dirt), kit.std('#ffffff', 1, 0, { map: dirtTex }), group, 0, 0.05, (z0 + z1) / 2, false);

  // lanterns marking the edges for a night arrival
  const flame = kit.emissive('#ffb45e', 1);
  for (let z = z0; z >= z1; z -= 9) {
    [-8.2, 8.2].forEach((x) => {
      block(0.26, 0.34, 0.26, mats.tinDark, group, x, 0, z);
      put(sphere(0.1, 8, 6), flame, group, x, 0.42, z, false);
      glow(x, 0.45, z, '#ffab52', 2.3, 1);
    });
  }
  const lanternLight = new THREE.PointLight('#ff9a4a', 0, 42, 1.5);
  lanternLight.position.set(-4, 1.6, -1016);
  group.add(lanternLight);

  // windsock, 4×4 with a beacon
  put(cyl(0.05, 0.08, 5, 8), mats.steel, group, 15, 2.5, -996);
  const sock = put(own(new THREE.ConeGeometry(0.36, 2.2, 10, 1, true)), kit.std('#d9672b', 0.9, 0, { side: THREE.DoubleSide }), group, 15, 4.8, -996);
  sock.geometry.rotateZ(Math.PI / 2);
  sock.geometry.translate(1.1, 0, 0);
  const car = new THREE.Group();
  car.position.set(12.6, 0, -1010);
  car.rotation.y = -0.5;
  block(2, 0.9, 4.6, mats.ivory, car, 0, 0.55, 0);
  block(1.9, 0.85, 2.7, mats.ivory, car, 0, 1.45, -0.5);
  block(1.92, 0.5, 2.3, mats.glass, car, 0, 1.6, -0.5);
  [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]].forEach(([x, z]) => (put(cyl(0.46, 0.46, 0.32, 14), mats.rubber, car, x, 0.46, z).rotation.z = Math.PI / 2));
  const carBeacon = kit.emissive('#ff3a2f', 1);
  put(box(0.9, 0.16, 0.3), carBeacon, car, 0, 2.38, -0.2, false);
  group.add(car);
  const carGlow = glow(12.5, 2.5, -1010.2, '#ff4a3a', 4, 2);
  void carGlow;

  // shed
  block(7, 2.8, 5, mats.wood, group, 22, 0, -1104);
  const roof = put(box(8, 0.14, 6.2), mats.tin, group, 22, 3.15, -1104);
  roof.rotation.z = 0.12;
  block(1.3, 2.1, 0.1, mats.woodDark, group, 20.4, 0, -1101.45);

  // cargo, laid out beside the aircraft
  const cargo = new THREE.Group();
  group.add(cargo);
  const crate = (x: number, z: number, w: number, h: number, d: number, y = 0, rot = 0) => {
    const m = block(w, h, d, mats.wood, cargo, x, y, z);
    m.rotation.y = rot;
    [-1, 1].forEach((s) => (block(w + 0.04, 0.09, d + 0.04, mats.woodDark, cargo, x, y + (s > 0 ? h - 0.16 : 0.1), z).rotation.y = rot));
    return m;
  };
  const pallet = (x: number, z: number, rot: number) => (block(2.3, 0.14, 1.9, mats.woodDark, cargo, x, 0, z).rotation.y = rot);
  // kept low, in the foreground, so nothing stands between the camera and the aircraft
  pallet(15.4, -1084.1, 0.5);
  const main = crate(15.4, -1084.1, 1.9, 1.0, 1.5, 0.14, 0.5);
  crate(13.7, -1083.2, 0.8, 0.6, 0.8, 0, 0.2);
  pallet(17.6, -1092.4, 0.2);
  crate(17.3, -1092.5, 1.0, 1.0, 1.0, 0.14, 0.2);
  crate(18.3, -1092.2, 0.8, 0.7, 0.9, 0.14, 0.4);
  [[21.4, -1096.6], [22.3, -1096.1], [21.6, -1095.6]].forEach(([x, z], i) => put(cyl(0.42, 0.42, 1.15, 14), i === 1 ? mats.tinDark : mats.drum, cargo, x, 0.6, z));
  for (let i = 0; i < 5; i++) {
    const s = put(sphere(0.5, 10, 8), mats.cloth, cargo, 16.9 + (i % 3) * 0.9 + rand() * 0.2, 0.2 + Math.floor(i / 3) * 0.36, -1085.6 + rand() * 0.3);
    s.scale.set(1.1, 0.36, 0.7);
  }
  // dimension lines round the main crate — what a cargo enquiry asks for
  const dims = new THREE.Group();
  dims.position.copy(main.position);
  dims.rotation.y = 0.5;
  const dimMat = kit.emissive('#e4c994', 1.4);
  const line = (w: number, h: number, d: number, x: number, y: number, z: number) => put(box(w, h, d), dimMat, dims, x, y, z, false);
  line(1.9, 0.02, 0.02, 0, -0.38, 1.15);
  [-0.95, 0.95].forEach((x) => line(0.02, 0.02, 0.3, x, -0.38, 1.15));
  line(0.02, 1.0, 0.02, -1.3, 0, 0.75);
  [-0.5, 0.5].forEach((y) => line(0.3, 0.02, 0.02, -1.3, y, 0.75));
  line(0.02, 0.02, 1.5, 1.3, -0.38, 0);
  [-0.75, 0.75].forEach((z) => line(0.3, 0.02, 0.02, 1.3, -0.38, z));
  cargo.add(dims);

  return {
    group,
    update(p: Params, time: number) {
      flame.emissiveIntensity = p.lantern * (2.2 + Math.sin(time * 9) * 0.25);
      lanternLight.intensity = p.lantern * 26;
      carBeacon.emissiveIntensity = p.beacon * (0.5 + 0.5 * Math.sin(time * 7)) * 5;
      sock.rotation.z = -0.2 + Math.sin(time * 1.8) * 0.07;
      dims.visible = p.dims > 0.01;
      dims.scale.setScalar(0.6 + 0.4 * p.dims);
      dimMat.emissiveIntensity = p.dims * 1.6;
    },
  };
}

/* ── Destination chart ────────────────────────────────────── */

export function buildChart(kit: Kit) {
  const { own, put, cyl, sphere } = kit;
  const group = new THREE.Group();
  const anchors: Anchors = {};
  const C = SITE.chart;
  const routes = destinations.filter((d) => !d.hub);

  // Linework only, on a clear ground: graticule, range rings, place names.
  const res = kit.lite ? 1024 : 2048;
  const tex = kit.paint(res, Math.round((res * CHART_H) / CHART_W), (ctx, W, H, f) => {
    const k = W / 2048;
    const X = (lon: number) => ((lon - CHART_LON[0]) / (CHART_LON[1] - CHART_LON[0])) * W;
    const Y = (lat: number) => H - ((lat - CHART_LAT[0]) / (CHART_LAT[1] - CHART_LAT[0])) * H;
    const ink = (a: number) => `rgba(242, 237, 226, ${a})`;
    ctx.strokeStyle = ink(0.26);
    ctx.lineWidth = 2 * k;
    for (let lon = 30; lon <= 45; lon++) { ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), H); ctx.stroke(); }
    for (let lat = -3; lat <= 15; lat++) { ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(W, Y(lat)); ctx.stroke(); }
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 3.5 * k;
    ctx.fillStyle = ink(0.85);
    ctx.font = `500 ${28 * k}px ${f.mono}`;
    for (let lon = 30; lon <= 45; lon += 5) {
      ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), H); ctx.stroke();
      ctx.fillText(`${lon}°E`, X(lon) + 10 * k, H - 24 * k);
    }
    for (let lat = 0; lat <= 15; lat += 5) {
      ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(W, Y(lat)); ctx.stroke();
      ctx.fillText(`${lat}°N`, 14 * k, Y(lat) - 14 * k);
    }
    // range rings from the hub (1° of latitude ≈ 111 km)
    const hx = X(hub.lon), hy = Y(hub.lat), pxPerKm = H / ((CHART_LAT[1] - CHART_LAT[0]) * 111);
    ctx.setLineDash([12 * k, 16 * k]);
    ctx.strokeStyle = 'rgba(228, 201, 148, 0.7)';
    ctx.fillStyle = 'rgba(228, 201, 148, 0.95)';
    [250, 500, 750, 1000].forEach((km) => {
      ctx.beginPath(); ctx.arc(hx, hy, km * pxPerKm, 0, Math.PI * 2); ctx.stroke();
      ctx.fillText(`${km} KM`, hx + 12 * k, hy - km * pxPerKm - 12 * k);
    });
    ctx.setLineDash([]);
    ctx.textBaseline = 'middle';
    const label = (lat: number, lon: number, text: string, big = false) => {
      const left = lon < hub.lon - 0.3 && !big;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = ink(1);
      ctx.font = `600 ${(big ? 70 : 56) * k}px ${f.display}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${4 * k}px`;
      ctx.fillText(text.toUpperCase(), X(lon) + (left ? -34 : 34) * k, Y(lat) + (big ? 52 : 0) * k);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.fillStyle = ink(0.7);
      ctx.font = `500 ${24 * k}px ${f.mono}`;
      ctx.fillText(`${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${lon.toFixed(2)}°E`, X(lon) + (left ? -34 : 34) * k, Y(lat) + (big ? 98 : 42) * k);
    };
    routes.forEach((d) => label(d.lat, d.lon, d.name.en));
    label(hub.lat, hub.lon, hub.name.en, true);
    ctx.textAlign = 'left';
    ctx.fillStyle = ink(1);
    ctx.font = `600 ${66 * k}px ${f.display}`;
    ctx.fillText('DESTINATION CHART', 70 * k, 98 * k);
    ctx.font = `500 ${25 * k}px ${f.mono}`;
    ctx.fillStyle = ink(0.75);
    ctx.fillText('STRAIGHT-LINE DISTANCES FROM ADDIS ABABA', 72 * k, 152 * k);
    ctx.fillText('NOT A TIMETABLE · NOT FOR NAVIGATION', 72 * k, 190 * k);
    ctx.strokeStyle = ink(0.6);
    ctx.lineWidth = 3 * k;
    ctx.strokeRect(24 * k, 24 * k, W - 48 * k, H - 48 * k);
  });
  const sheetMat = own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const sheet = new THREE.PlaneGeometry(CHART_W, CHART_H);
  sheet.rotateX(-Math.PI / 2);
  const plane = put(own(sheet), sheetMat, group, C.x, C.y, C.z, false);
  plane.renderOrder = 4;

  // markers and routes
  const mast = kit.emissive('#e4c994', 1.2);
  const headMat = kit.emissive('#f2ede2', 1.4);
  const arcMat = kit.emissive('#d6a53a', 1.3);
  const hotMat = kit.emissive('#ffffff', 2.4);
  const hubP = chartPoint(hub.lat, hub.lon);
  put(cyl(0.3, 0.3, 14, 8), mast, group, hubP.x, hubP.y + 7, hubP.z, false);
  put(sphere(2.4, 20, 14), arcMat, group, hubP.x, hubP.y + 15, hubP.z, false);
  anchors['dest:hub'] = hubP.clone().setY(hubP.y + 15);

  const items = routes.map((d) => {
    const end = chartPoint(d.lat, d.lon);
    const span = end.distanceTo(hubP);
    const mid = hubP.clone().lerp(end, 0.5).setY(C.y + 6 + span * 0.2);
    const curve = new THREE.QuadraticBezierCurve3(hubP.clone().setY(C.y + 14), mid, end.clone().setY(C.y + 8));
    const geo = own(new THREE.TubeGeometry(curve, 48, 0.42, 6, false));
    const arc = put(geo, arcMat, group, 0, 0, 0, false);
    put(cyl(0.22, 0.22, 8, 8), mast, group, end.x, end.y + 4, end.z, false);
    const head = put(sphere(1.5, 18, 12), headMat, group, end.x, end.y + 8.6, end.z, false);
    anchors[`dest:${d.id}`] = end.clone().setY(end.y + 8.6);
    return { id: d.id, arc, head, count: geo.index!.count };
  });

  return {
    group,
    anchors,
    update(p: Params, time: number, selected: string | null) {
      sheetMat.opacity = p.routes * 0.95;
      items.forEach((it, i) => {
        // routes draw out from the hub one after another as the chapter arrives
        const k = THREE.MathUtils.clamp(p.routes * (items.length + 3) - i, 0, 4) / 4;
        it.arc.geometry.setDrawRange(0, Math.floor((it.count * k) / 3) * 3);
        const on = it.id === selected;
        it.arc.material = on ? hotMat : arcMat;
        it.head.material = on ? hotMat : headMat;
        it.head.scale.setScalar(on ? 1.6 + Math.sin(time * 4) * 0.12 : 1);
        it.head.visible = k > 0.98;
      });
    },
  };
}
