import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ACTS, stage } from '@/animation/stage';
import { createAircraftFactory } from './aircraft';
import { buildClouds, buildGlows, buildSky, type Air } from './atmosphere';
import { createKit } from './kit';
import { flightPose, newGrade, sampleCamera, sampleGrade, type Pose } from './route';
import { buildChart, buildHomeField, buildStrip, type Anchors, type Params } from './sets';
import { buildTerrain, buildTrees } from './terrain';

const END = ACTS.length;

/**
 * One persistent WebGL world that the page scrolls through.
 *
 * The scroll rig publishes an act time (`stage.u`); the engine eases towards
 * it and derives everything from that single number: the camera's place on
 * its route, the aircraft's place on its flight plan, the time of day, and a
 * paused GSAP timeline holding every other moving part. Nothing else advances
 * the scene, so a scroll position always yields the same frame — forwards,
 * backwards, or after a reload.
 */
export function createEngine(canvas: HTMLCanvasElement, { lite, onReady, onLost }: { lite: boolean; onReady: () => void; onLost: () => void }) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance', stencil: false });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#000000', 0.003);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.4, 2800);

  // ── Light rig: one sun, one sky. Both follow the grade. ──
  const hemi = new THREE.HemisphereLight('#ffffff', '#222222', 1);
  const key = new THREE.DirectionalLight('#ffffff', 3);
  if (!lite) {
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -48;
    sc.right = sc.top = 48;
    sc.near = 1;
    sc.far = 360;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.09;
    key.shadow.radius = 2.5;
  }
  scene.add(hemi, key, key.target);

  // ── World ──
  const kit = createKit({ lite, anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const factory = createAircraftFactory(kit);
  const terrain = buildTerrain(kit);
  const trees = buildTrees(kit);
  const home = buildHomeField(kit, factory.create);
  const strip = buildStrip(kit);
  const chart = buildChart(kit);
  const sky = buildSky(kit);
  const clouds = buildClouds(kit);
  scene.add(sky.mesh, terrain, trees, home.group, strip.group, chart.group, clouds.mesh);

  // The lead aircraft flies the whole route.
  const lead = factory.create();
  const leadBeacon = kit.own(factory.beaconMat.clone());
  const leadStrobe = kit.own(factory.strobeMat.clone());
  factory.beaconMat.emissiveIntensity = 0.25;
  factory.strobeMat.emissiveIntensity = 0.2;
  lead.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.material === factory.beaconMat) m.material = leadBeacon;
    else if (m.material === factory.strobeMat) m.material = leadStrobe;
  });
  const landing = new THREE.SpotLight('#fff1d6', 0, 150, 0.32, 0.7, 1.3);
  landing.position.set(0, -1.0, -6.6);
  landing.target.position.set(0, -6, -44);
  const beamMat = kit.own(new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beamGeo = kit.own(new THREE.ConeGeometry(3.2, 46, 28, 1, true));
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, -23);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, -1.0, -6.7);
  beam.rotation.x = -0.1;
  const lensMat = kit.emissive('#fff6e0', 0);
  const lens = new THREE.Mesh(kit.sphere(0.13, 10, 8), lensMat);
  lens.position.set(0, -1.02, -6.55);
  lead.group.add(landing, landing.target, beam, lens);
  scene.add(lead.group);

  const glows = buildGlows(kit);
  scene.add(glows.points);

  const anchors: Anchors = { ...home.anchors, ...chart.anchors };

  // Painted surfaces use the page's own typefaces once they have loaded.
  const css = getComputedStyle(document.documentElement);
  const families = {
    display: css.getPropertyValue('--font-display').trim() || 'sans-serif',
    mono: css.getPropertyValue('--font-mono').trim() || 'monospace',
  };
  Promise.all([document.fonts.load(`700 80px ${families.display}`), document.fonts.load(`500 40px ${families.mono}`)])
    .catch(() => null)
    .then(() => {
      if (state.destroyed) return;
      kit.repaint(families);
      state.dirty = true;
    });

  // ── Timeline: everything that moves besides camera, aircraft and grade ──
  const p: Params = { prop: 0, lamps: 1, lights: 1, lantern: 0, beacon: 0, landing: 0, dims: 0, routes: 0, gear: 0, cabin: 0.9 };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  const seg = (vars: Partial<Params>, from: number, to: number) => tl.to(p, { ...vars, duration: to - from }, from);
  // engines
  seg({ prop: 1 }, 0.1, 0.7);
  seg({ prop: 0 }, 3.86, 3.97);
  seg({ prop: 1 }, 4.46, 4.58);
  // field lighting and cabin lights: on at sunrise, off through the day, on again as the sun goes
  seg({ lamps: 0, lights: 0.12, cabin: 0 }, 0.85, 1.4);
  seg({ lights: 1, lamps: 1, cabin: 1 }, 9.2, 10.0);
  // approach to the strip, and the pass over the hangar at the end
  seg({ beacon: 1, landing: 1 }, 2.6, 2.94);
  seg({ landing: 0 }, 3.6, 3.76);
  seg({ beacon: 0 }, 3.84, 3.99);
  seg({ landing: 0.5 }, 9.6, 9.95);
  seg({ landing: 0 }, 10.3, 10.5);
  // gear
  seg({ gear: 1 }, 1.84, 1.97);
  seg({ gear: 0 }, 2.66, 2.92);
  seg({ gear: 1 }, 4.7, 4.8);
  seg({ gear: 0 }, 6.8, 6.93);
  seg({ gear: 1 }, 7.9, 8.0);
  // cargo dimension lines, and the route chart
  seg({ dims: 1 }, 3.98, 4.2);
  seg({ dims: 0 }, 4.46, 4.58);
  seg({ routes: 1 }, 4.84, 5.22);
  seg({ routes: 0 }, 5.52, 5.74);
  tl.set({}, {}, END);

  // ── State ──
  const state = {
    time: -1,
    clock: 0,
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },
    width: 1,
    height: 1,
    portrait: false,
    dirty: true,
    destroyed: false,
    lost: false,
    ready: false,
  };

  let dprCap = lite ? 1.25 : 1.75;
  const applyDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  const quality = { tier: 0, acc: 0, n: 0, last: 0 };
  const downgrade = () => {
    quality.tier += 1;
    dprCap = quality.tier === 1 ? Math.min(dprCap, 1.25) : 1;
    applyDpr();
    if (quality.tier === 2 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    resize();
  };

  // ── DOM anchors: HTML pinned to points in the world ──
  let anchored: { el: HTMLElement; key: string; act: HTMLElement | null; parent: HTMLElement }[] = [];
  const collectAnchors = () => {
    anchored = [...document.querySelectorAll<HTMLElement>('[data-anchor]')].map((el) => ({
      el,
      key: el.dataset.anchor!,
      act: el.closest<HTMLElement>('.act'),
      parent: (el.offsetParent as HTMLElement) ?? document.body,
    }));
    state.dirty = true;
  };
  stage.refreshAnchors = collectAnchors;
  const projected = new THREE.Vector3();
  const rects = new Map<HTMLElement, DOMRect>();
  const placeAnchors = () => {
    if (!anchored.length) return;
    rects.clear();
    for (const a of anchored) {
      if (!a.act?.classList.contains('is-live') || !anchors[a.key]) continue;
      projected.copy(anchors[a.key]).project(camera);
      const off = projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15;
      a.el.toggleAttribute('data-off', off);
      if (off) continue;
      let r = rects.get(a.parent);
      if (!r) rects.set(a.parent, (r = a.parent.getBoundingClientRect()));
      const centred = a.el.dataset.anchorOrigin === 'center';
      const hw = a.el.offsetWidth / 2, h = a.el.offsetHeight;
      const sx = THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * state.width, hw + 12, state.width - hw - 12);
      const top = 76 + (centred ? h / 2 : h);
      const sy = THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * state.height, top, state.height - 64);
      const x = sx - r.left;
      const y = sy - r.top;
      a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  };

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    state.width = w;
    state.height = h;
    state.portrait = h > w * 1.05;
    applyDpr();
    renderer.setSize(w, h, false);
    camera.fov = state.portrait ? 56 : 40;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    document.documentElement.dataset.anchors = state.portrait || w < 900 ? 'off' : 'on';
    state.dirty = true;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    state.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    state.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  if (fine) window.addEventListener('pointermove', onPointer, { passive: true });

  const onContextLost = (e: Event) => {
    e.preventDefault();
    state.lost = true;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // ── Frame ──
  const P = new THREE.Vector3(), L = new THREE.Vector3(), dir = new THREE.Vector3(), focus = new THREE.Vector3();
  const lightDir = new THREE.Vector3(), lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3(), WORLD_UP = new THREE.Vector3(0, 1, 0);
  const shot = { shift: 0, pullback: 1.3 };
  const pose: Pose = { visible: true, position: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, air: 0 };
  const grade = newGrade();
  const air: Air = { top: grade.top, horizon: grade.horizon, sunColor: grade.sunColor, sun: grade.sun, fog: new THREE.Color(), fogDensity: 0.003, stars: 0, veil: 0, cloud: 1, light: 1 };
  const white = new THREE.Color('#ffffff');

  const tick = (_t: number, deltaMs: number) => {
    if (state.destroyed || state.lost || document.hidden) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    const still = stage.reduced;

    // Scroll: ease towards the published act time. Reduced motion snaps to it.
    const target = THREE.MathUtils.clamp(stage.u, 0, END);
    let time = state.time;
    if (time < 0 || still) time = target;
    else {
      time += (target - time) * (1 - Math.exp(-dt * 2.5));
      if (Math.abs(target - time) < 0.0003) time = target;
    }
    const moved = time !== state.time;
    state.time = time;
    if (still && !moved && !state.dirty) return;
    state.dirty = false;
    if (!still) state.clock += dt;
    const clock = state.clock;

    const ptr = state.pointer;
    const kp = 1 - Math.exp(-dt * 4);
    ptr.x += (ptr.tx - ptr.x) * kp;
    ptr.y += (ptr.ty - ptr.y) * kp;

    tl.time(time);

    // Grade and air
    sampleGrade(time, grade);
    air.stars = grade.stars;
    air.light = THREE.MathUtils.clamp(grade.key / 3.2, 0, 1);
    air.fog.copy(grade.horizon).lerp(grade.top, 0.22);
    air.fogDensity = grade.fog;
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(air.fog);
    fog.density = air.fogDensity;
    renderer.toneMappingExposure = grade.exposure;
    hemi.color.copy(grade.top).lerp(white, 0.5);
    hemi.groundColor.copy(grade.horizon).multiplyScalar(0.5);
    hemi.intensity = grade.hemi * 1.25;
    scene.environmentIntensity = 0.12 + grade.hemi * 0.4;
    key.color.copy(grade.sunColor);
    key.intensity = grade.key;

    // Camera
    sampleCamera(time, P, L, shot);
    const aspect = state.width / state.height;
    if (state.portrait) P.sub(L).multiplyScalar(shot.pullback).add(L);
    else {
      const narrow = THREE.MathUtils.clamp((1.55 - aspect) / 0.55, 0, 1);
      if (narrow > 0) P.sub(L).multiplyScalar(1 + narrow * 0.32).add(L);
    }
    camera.position.copy(P);
    camera.lookAt(L);
    if (fine && !still) {
      camera.translateX(ptr.x * 0.35);
      camera.translateY(ptr.y * 0.2);
      camera.lookAt(L);
    }
    const sx = state.portrait ? 0 : shot.shift * THREE.MathUtils.clamp((aspect - 1.05) / 0.5, 0, 1);
    // on a phone the picture sits in the upper part of the frame and the copy below it
    const sy = state.portrait ? -0.2 * THREE.MathUtils.clamp((shot.pullback - 0.9) / 0.35, 0.25, 1) : 0;
    camera.setViewOffset(state.width, state.height, -sx * state.width, -sy * state.height, state.width, state.height);

    // The sun follows what the camera is looking at, so one shadow map serves the whole route.
    // Three things keep that shadow from shimmering as the camera moves:
    //  · the map covers the subject of the shot (not a fixed patch near the lens),
    //  · its position is snapped to whole texels, so edges do not crawl,
    //  · the light never drops to a grazing angle, where every texel smears into streaks.
    dir.copy(L).sub(P);
    const reach = Math.min(dir.length(), 110);
    focus.copy(P).addScaledVector(dir.normalize(), reach);
    lightDir.copy(grade.sun);
    lightDir.y = Math.max(lightDir.y, 0.26);
    lightDir.normalize();
    if (key.castShadow) {
      const half = Math.ceil(THREE.MathUtils.clamp(reach * 0.62, 34, 84) / 10) * 10;
      const sc = key.shadow.camera;
      if (sc.right !== half) {
        sc.left = sc.bottom = -half;
        sc.right = sc.top = half;
        sc.updateProjectionMatrix();
      }
      const texel = (half * 2) / key.shadow.mapSize.x;
      lightRight.crossVectors(WORLD_UP, lightDir).normalize();
      lightUp.crossVectors(lightDir, lightRight);
      const fx = focus.dot(lightRight), fy = focus.dot(lightUp);
      focus.addScaledVector(lightRight, Math.round(fx / texel) * texel - fx).addScaledVector(lightUp, Math.round(fy / texel) * texel - fy);
    }
    key.target.position.copy(focus);
    key.position.copy(focus).addScaledVector(lightDir, 160);

    // Lead aircraft
    flightPose(time, pose);
    lead.group.visible = pose.visible;
    if (pose.visible) {
      lead.group.position.copy(pose.position);
      lead.group.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      lead.setGear(p.gear);
      if (!still) for (const fan of lead.fans) fan.rotation.z += dt * 26 * p.prop;
      landing.intensity = p.landing * (140 + 520 * (1 - air.light));
      beamMat.opacity = p.landing * 0.035;
      lensMat.emissiveIntensity = p.landing * 24;
    }
    // soft pulses rather than hard flashes, so nothing in frame blinks
    const rot = 0.5 + 0.5 * Math.sin(clock * 2.4);
    const flash = Math.pow(0.5 + 0.5 * Math.sin(clock * 3.1), 6);
    leadBeacon.emissiveIntensity = 0.3 + rot * (1 + p.beacon * 4);
    leadStrobe.emissiveIntensity = 0.3 + flash * 3.5 * pose.air;
    factory.skin.emissiveIntensity = p.cabin * 1.6;

    // Sets
    // one world, always there — nothing is swapped in or out behind a transition
    chart.group.visible = p.routes > 0.001;
    // cloud thins while the chart is up so its linework reads
    air.cloud = 1 - 0.7 * p.routes;
    home.update(p, clock);
    strip.update(p, clock);
    if (chart.group.visible) chart.update(p, clock, stage.selectedDestination);
    // signs dim with the last light so nothing glows behind the forms
    const signs = (0.1 + p.lights * 0.8) * (1 - 0.93 * THREE.MathUtils.smoothstep(time, 10.25, 10.5));
    for (const m of kit.signFaces) m.emissiveIntensity = signs;
    glows.intensity.set(p.lights, p.lantern, Math.max(p.lights * 0.7, p.beacon) * rot, p.lamps);
    glows.update(air.fogDensity, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    sky.update(air, camera);
    clouds.update(air, clock);

    renderer.render(scene, camera);
    if (stage.immersive && !state.portrait) placeAnchors();

    if (!state.ready) {
      state.ready = true;
      onReady();
    }

    // Step quality down on machines that cannot hold the frame rate. Downgrade only, so it settles.
    if (quality.tier < 2 && !still) {
      const now = performance.now();
      const gap = now - quality.last;
      quality.last = now;
      if (gap > 0 && gap < 90) {
        quality.acc += gap;
        if (++quality.n >= 70) {
          if (quality.acc / quality.n > 36) downgrade();
          quality.acc = quality.n = 0;
        }
      } else quality.acc = quality.n = 0;
    }
  };
  gsap.ticker.add(tick);

  const onVisible = () => (state.dirty = true);
  document.addEventListener('visibilitychange', onVisible);
  collectAnchors();

  return {
    /** Ask for a frame (used when reduced motion has stopped the clock). */
    invalidate() {
      state.dirty = true;
    },
    /** Jump straight to the published act time, without easing (tests, direct navigation). */
    snap() {
      state.time = -1;
      state.dirty = true;
    },
    info: () => ({ time: state.time, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality: quality.tier }),
    destroy() {
      state.destroyed = true;
      gsap.ticker.remove(tick);
      tl.kill();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisible);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (stage.refreshAnchors === collectAnchors) stage.refreshAnchors = null;
      kit.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export type Engine = NonNullable<ReturnType<typeof createEngine>>;
