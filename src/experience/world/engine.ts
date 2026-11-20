import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import gsap from 'gsap';
import { ACTS, stage } from '@/animation/stage';
import { createAircraftFactory } from './aircraft';
import { placeLabel, type Frame } from './label';
import { buildClouds, buildGlows, buildSky, type Air } from './atmosphere';
import { createKit } from './kit';
import { CAMERA_CLEARANCE, flightPose, frameCamera, newGrade, sampleGrade, type Pose } from './route';
import { buildChart, buildHomeField, buildStrip, type Anchors, type Params } from './sets';
import { buildGrass, buildScatter, buildTerrain, buildTrees, groundHeight } from './terrain';

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
/** Thrown out of a build that was cancelled part-way; its resources are already released. */
export const BUILD_CANCELLED = Symbol('build cancelled');

interface EngineOptions {
  lite: boolean;
  onReady: () => void;
  onLost: () => void;
  /** 0…1, with the stage just finished. */
  onProgress?: (done: number, stage: string) => void;
  /** Set `cancelled` to stop a build that is no longer wanted. */
  signal?: { cancelled: boolean };
}

/**
 * Builds the world in stages. Between stages it hands the main thread back to
 * the browser, so the page stays responsive, the loader can show real
 * progress, and a build that is no longer wanted can stop early.
 */
export async function createEngine(canvas: HTMLCanvasElement, { lite, onReady, onLost, onProgress, signal }: EngineOptions) {
  const startedAt = performance.now();
  const timings: [string, number][] = [];
  const disposers: (() => void)[] = [];
  let last = startedAt;
  const step = async (label: string, done: number) => {
    const now = performance.now();
    timings.push([label, Math.round(now - last)]);
    last = now;
    onProgress?.(done, label);
    await new Promise<void>((r) => setTimeout(r, 0));
    // count only the build's own work, not whatever the browser did while it had the thread
    last = performance.now();
    if (signal?.cancelled) {
      disposers.reverse().forEach((d) => d());
      throw BUILD_CANCELLED;
    }
  };

  let renderer: THREE.WebGLRenderer;
  try {
    // no canvas MSAA: every frame arrives already anti-aliased from the composer's buffer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  } catch {
    return null;
  }
  disposers.push(() => renderer.dispose());
  // AgX rolls bright colour off toward white the way film does; ACES pushes
  // saturated sunsets toward neon, which is one of the tells of a render.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#000000', 0.003);
  const pmrem = new THREE.PMREMGenerator(renderer);
  disposers.push(() => pmrem.dispose());
  pmrem.compileEquirectangularShader();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.4, 2800);

  // ── Grade ─────────────────────────────────────────────────
  // The last thing a photograph gets is a lens and a film stock: highlights
  // that bloom a little, corners that fall off, a gentle S-curve, and grain
  // that sits in the shadows rather than the highlights.
  const film = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 0.42 },
      uGrain: { value: 0.028 },
      uAspect: { value: 1.6 },
      uSaturation: { value: 1.08 },
      uContrast: { value: 0.2 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAspect, uSaturation, uContrast; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // AgX is a deliberately flat negative; this is the print made from it:
        // colour back up, an S-curve for density, and a commercial split tone —
        // a touch cool in the shadows, a touch warm in the highlights
        float l0 = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = max(mix(vec3(l0), c.rgb, uSaturation), 0.0);
        c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), uContrast);
        c.rgb *= mix(vec3(0.98, 0.998, 1.022), vec3(1.02, 1.0, 0.975), smoothstep(0.08, 0.75, l0));
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        c.rgb *= clamp(1.0 - dot(p, p) * uVignette, 0.0, 1.0);
        float n = fract(sin(dot(vUv * 1973.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb += (n - 0.5) * uGrain * (1.0 - 0.75 * luma);
        gl_FragColor = c;
      }
    `,
  });

  // ── Light rig: one sun, one sky. Both follow the grade. ──
  const hemi = new THREE.HemisphereLight('#ffffff', '#222222', 1);
  const key = new THREE.DirectionalLight('#ffffff', 3);
  if (!lite) {
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -48;
    sc.right = sc.top = 48;
    sc.near = 1;
    sc.far = 360;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.09;
    key.shadow.radius = 3.5;
  }
  scene.add(hemi, key, key.target);

  // ── Environment ───────────────────────────────────────────
  // Ambient light and reflections come from the sky this scene is actually
  // under, not from a studio box: a tiny render of the sky dome over a ground
  // hemisphere, convolved into an IBL probe. It is refreshed only when the
  // light has actually moved, so it costs almost nothing while scrolling.
  const envScene = new THREE.Scene();
  const envGroundMat = new THREE.MeshBasicMaterial({ color: '#2a2622', side: THREE.BackSide, depthTest: false, fog: false });
  let envRT: THREE.WebGLRenderTarget | null = null;
  const envMark = { sun: new THREE.Vector3(9, 9, 9), top: new THREE.Color(), at: -1e4 };
  const refreshEnvironment = (air: Air, now: number) => {
    const moved = envMark.sun.distanceToSquared(air.sun) > 2.5e-3 || Math.abs(envMark.top.r - air.top.r) + Math.abs(envMark.top.b - air.top.b) > 0.03;
    if (!moved || now - envMark.at < 1200) return;
    envMark.sun.copy(air.sun);
    envMark.top.copy(air.top);
    envMark.at = now;
    envGroundMat.color.copy(air.horizon).lerp(air.top, 0.3).multiplyScalar(0.3);
    sky.disc(false);
    const next = pmrem.fromScene(envScene, 0.035, 0.1, 100, { size: 64 });
    sky.disc(true);
    envRT?.dispose();
    envRT = next;
    scene.environment = next.texture;
  };

  // ── World ──
  const kit = createKit({ lite, anisotropy: renderer.capabilities.getMaxAnisotropy() });
  disposers.push(() => kit.dispose());
  await kit.loadArt({ mark: '/logo-mark.svg', lockup: '/logo.svg' });
  const factory = createAircraftFactory(kit);
  await step('aircraft', 0.14);
  const terrain = buildTerrain(kit);
  await step('terrain', 0.34);
  const trees = buildTrees(kit);
  const scatter = buildScatter(kit);
  const grass = buildGrass(kit);
  await step('vegetation', 0.52);
  const home = buildHomeField(kit, factory.create);
  await step('airfield', 0.6);
  const strip = buildStrip(kit);
  await step('strip', 0.66);
  const chart = buildChart(kit);
  await step('chart', 0.7);
  const sky = buildSky(kit);
  const clouds = buildClouds(kit);
  await step('sky', 0.74);
  scene.add(sky.mesh, terrain, trees, scatter, grass.mesh, home.group, strip.group, chart.group, clouds.mesh);
  // the probe sees the same sky material, wrapped around a small dome
  const envSky = new THREE.Mesh(kit.own(new THREE.SphereGeometry(10, 24, 16)), sky.mesh.material as THREE.Material);
  envSky.renderOrder = -10;
  const envGround = new THREE.Mesh(kit.own(new THREE.SphereGeometry(9.9, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), envGroundMat);
  envGround.renderOrder = 1;
  envScene.add(envSky, envGround);

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

  // The scene is rendered into a float buffer so the grade works on real
  // highlight values, then tone-mapped once, at the end.
  const buffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lite ? 0 : 2 });
  let tPost = performance.now();
  const composer = new EffectComposer(renderer, buffer);
  composer.addPass(new RenderPass(scene, camera));

  // Ambient occlusion: the darkening where things meet — wheels on tarmac, a
  // wing root, a crate on the ground — that tells the eye they are touching.
  // Computed at half resolution and denoised. Only solid geometry takes part:
  // sky, cloud sheets, light shafts and other see-through things are hidden
  // from its depth pass so they cannot cast phantom shading.
  const ao = lite ? null : new GTAOPass(scene, camera, 1, 1);
  if (ao) {
    ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 2.5, scale: 1.15, samples: 8, distanceFallOff: 0.9 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 6 });
    ao.blendIntensity = 0.85;
    const hidden: THREE.Object3D[] = [];
    const internal = ao as unknown as { _overrideVisibility(): void; _restoreVisibility(): void; setSize(w: number, h: number): void };
    const hide = internal._overrideVisibility.bind(ao), show = internal._restoreVisibility.bind(ao), size = internal.setSize.bind(ao);
    internal._overrideVisibility = () => {
      hide();
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (o.visible && (o as THREE.Mesh).isMesh && m && (o.userData.noAO || m.transparent || (m as THREE.ShaderMaterial).isShaderMaterial || !m.depthWrite)) {
          o.visible = false;
          hidden.push(o);
        }
      });
    };
    internal._restoreVisibility = () => {
      hidden.forEach((o) => (o.visible = true));
      hidden.length = 0;
      show();
    };
    internal.setSize = (w: number, h: number) => size(Math.max(1, Math.round(w * 0.45)), Math.max(1, Math.round(h * 0.45)));
    composer.addPass(ao);
  }
  kit.profile.push(['ambient occlusion pass', Math.round(performance.now() - tPost)]);
  tPost = performance.now();
  const bloom = lite ? null : new UnrealBloomPass(new THREE.Vector2(1, 1), 0.085, 0.55, 0.96);
  if (bloom) {
    const size = bloom.setSize.bind(bloom);
    bloom.setSize = (w: number, h: number) => size(Math.max(1, Math.round(w * 0.5)), Math.max(1, Math.round(h * 0.5)));
    composer.addPass(bloom);
  }
  kit.profile.push(['bloom pass', Math.round(performance.now() - tPost)]);
  composer.addPass(new OutputPass());
  composer.addPass(film);

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
  const p: Params = { prop: 0, lamps: 1, lights: 1, lantern: 0, beacon: 0, landing: 0, dims: 0, routes: 0, cabin: 0.9 };
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

  let dprCap = lite ? 1.15 : 1.5;
  const applyDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  const quality = { tier: 0, acc: 0, n: 0, last: 0 };
  // Step down in order of cost per pixel. Nothing here may reallocate a
  // render target in place: changing the MSAA sample count of a live buffer
  // leaves an incomplete framebuffer, and the whole frame renders black.
  const downgrade = () => {
    quality.tier += 1;
    if (quality.tier === 1) {
      if (ao) ao.enabled = false;
      dprCap = Math.min(dprCap, 1.25);
    } else {
      if (bloom) bloom.enabled = false;
      dprCap = 1;
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        key.castShadow = false;
        scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.needsUpdate = true;
        });
      }
    }
    applyDpr();
    resize();
  };

  // ── DOM anchors: HTML pinned to points in the world ──
  let anchored: { el: HTMLElement; key: string; act: HTMLElement | null; copy: HTMLElement | null; parent: HTMLElement; shown: number; debug?: Record<string, number> }[] = [];
  const collectAnchors = () => {
    anchored = [...document.querySelectorAll<HTMLElement>('[data-anchor]')].map((el) => {
      const act = el.closest<HTMLElement>('.act');
      return {
        el,
        key: el.dataset.anchor!,
        act,
        copy: act?.querySelector<HTMLElement>('.copy') ?? null,
        parent: (el.offsetParent as HTMLElement) ?? document.body,
        shown: 0,
      };
    });
    state.dirty = true;
  };
  stage.refreshAnchors = collectAnchors;
  const projected = new THREE.Vector3();
  const viewPoint = new THREE.Vector3();
  /** Chrome the labels keep clear of: the bar at the top, the flight strip at the bottom. */
  const BAR_H = 72, HUD_H = 60;
  const frame: Frame = { width: 0, height: 0, bar: BAR_H, hud: HUD_H };
  const rects = new Map<HTMLElement, DOMRect>();
  /**
   * Puts each label where its point in the world appears on screen.
   *
   * A label is never clamped to the frame: pinning it to an edge detaches it
   * from the thing it names, and makes it snap when it is finally dropped.
   * Instead it fades as it approaches an edge or the chrome, and is simply
   * absent once its point is behind the lens — which is also the only way to
   * avoid the mirrored position a perspective projection gives such a point.
   */
  const placeAnchors = (dt: number) => {
    if (!anchored.length) return;
    rects.clear();
    for (const a of anchored) {
      const target = anchors[a.key];
      const live = !!target && !!a.act?.classList.contains('is-live') && !a.el.hasAttribute('data-anchor-hidden');
      if (!live) {
        a.shown = 0;
        if (!a.el.hasAttribute('data-off')) {
          a.el.toggleAttribute('data-off', true);
          a.el.style.opacity = '0';
        }
        continue;
      }
      viewPoint.copy(target).applyMatrix4(camera.matrixWorldInverse);
      // a point sweeping past the lens fades over the last couple of metres
      // rather than blinking out, and has no screen position once behind it
      const depth = THREE.MathUtils.smoothstep(-viewPoint.z, camera.near, camera.near + 3);
      if (depth <= 0.001) {
        a.shown = 0;
        a.el.toggleAttribute('data-off', true);
        a.el.style.opacity = '0';
        continue;
      }
      projected.copy(target).project(camera);
      let r = rects.get(a.parent);
      if (!r) rects.set(a.parent, (r = a.parent.getBoundingClientRect()));
      const centred = a.el.dataset.anchorOrigin === 'center';
      const w = a.el.offsetWidth, h = a.el.offsetHeight;
      const sx = (projected.x * 0.5 + 0.5) * state.width;
      const sy = (-projected.y * 0.5 + 0.5) * state.height;
      let c = a.copy ? rects.get(a.copy) : undefined;
      if (a.copy && !c) rects.set(a.copy, (c = a.copy.getBoundingClientRect()));
      frame.width = state.width;
      frame.height = state.height;
      // Where it goes, and how much of it survives being there. The geometry
      // lives in ./label so it can be checked on its own: a label is moved out
      // of the way of the copy and the chrome first, and faded only when there
      // is nowhere left to move it to.
      const spot = placeLabel(sx, sy, w, h, frame, c ?? null, depth, centred);
      const fade = spot.fade;
      a.el.style.setProperty('--lean', `${spot.lean.toFixed(1)}deg`);
      if (a.el.dataset.leadFrom !== spot.from) a.el.dataset.leadFrom = spot.from;
      a.el.style.setProperty('--lead', `${Math.round(spot.lead)}px`);
      // Eased, never stepped: a label that becomes visible because its act has
      // just arrived, or because its point has swung back into view, would
      // otherwise snap from nothing to solid in a single frame. It rises and
      // settles into place instead.
      // Rises gently, but gets out of the way smartly: a label easing out over
      // the copy would sit on the words for a moment, which is the very thing
      // the fade exists to prevent.
      const rate = fade > a.shown ? Math.min(1 - Math.exp(-dt * 7), 0.3) : Math.min(1 - Math.exp(-dt * 26), 0.75);
      a.shown += (fade - a.shown) * rate;
      if (fade > a.shown && fade - a.shown < 0.004) a.shown = fade;
      a.debug = { sx: Math.round(sx), sy: Math.round(sy), fade: +fade.toFixed(2), depth: +depth.toFixed(2),
        x: Math.round(spot.x), y: Math.round(spot.y), lead: Math.round(spot.lead), lean: Math.round(spot.lean) };
      const hidden = a.shown <= 0.012 && fade <= 0.012;
      a.el.toggleAttribute('data-off', hidden);
      if (hidden) {
        a.shown = 0;
        a.el.style.opacity = '0';
        continue;
      }
      const rise = (1 - a.shown) * 10;
      a.el.style.opacity = a.shown.toFixed(3);
      a.el.style.transform = `translate3d(${(spot.x - r.left).toFixed(1)}px, ${(spot.y - r.top + rise).toFixed(1)}px, 0) scale(${(0.88 + 0.12 * a.shown).toFixed(3)})`;
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
    composer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    // a 4K canvas would spend most of its frame on occlusion; above ~3 MP it is skipped
    const px = w * h * renderer.getPixelRatio() ** 2;
    if (ao) ao.enabled = quality.tier === 0 && px <= 3.2e6;
    film.uniforms.uAspect.value = w / h;
    camera.fov = state.portrait ? 56 : 40;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    document.documentElement.dataset.anchors = state.portrait || w < 900 ? 'off' : 'on';
    film.uniforms.uVignette.value = state.portrait ? 0.68 : 0.42;
    state.dirty = true;
  };
  tPost = performance.now();
  resize();
  kit.profile.push(['first resize (allocating buffers)', Math.round(performance.now() - tPost)]);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    state.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    state.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  if (fine) window.addEventListener('pointermove', onPointer, { passive: true });

  // A lost context is usually the GPU reclaiming memory. Ask for it back and
  // carry on; only if it is not restored promptly does the page fall back to
  // the painted sky.
  let lostTimer: ReturnType<typeof setTimeout> | undefined;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    state.lost = true;
    lostTimer = setTimeout(onLost, 3000);
  };
  const onContextRestored = () => {
    clearTimeout(lostTimer);
    state.lost = false;
    envMark.at = -1e4;
    envMark.sun.set(9, 9, 9);
    state.dirty = true;
    resize();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  // ── Frame ──
  const P = new THREE.Vector3(), L = new THREE.Vector3(), dir = new THREE.Vector3(), focus = new THREE.Vector3();
  const lightDir = new THREE.Vector3(), lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3(), WORLD_UP = new THREE.Vector3(0, 1, 0);
  const shot = { shift: 0, pullback: 1.3, lift: 0.2 };
  const pose: Pose = { visible: true, position: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, air: 0 };
  const grade = newGrade();
  const air: Air = { top: grade.top, horizon: grade.horizon, sunColor: grade.sunColor, sun: grade.sun, fog: new THREE.Color(), fogDensity: 0.003, stars: 0, veil: 0, cloud: 1, light: 1 };
  const white = new THREE.Color('#ffffff');

  // While the visitor is reading, only clouds drift and grass sways, and
  // nobody can tell 20 frames a second from 60 for that. Rendering at a third
  // of the rate keeps the GPU cool, so it has full headroom the moment they
  // scroll — which is when smoothness is actually seen.
  let idleFor = 0;
  let framesDrawn = 0;
  let idleAcc = 0;
  let lastU = -1;
  let sinceScroll = 99;
  /** Quiet for this long before the frame rate is allowed to drop. */
  const IDLE_AFTER = 1.6;
  const tick = (_t: number, deltaMs: number) => {
    if (state.destroyed || state.lost || document.hidden) return;
    const rawDt = Math.min(deltaMs, 100) / 1000;
    // Someone reading a chapter sees only drifting cloud, and cannot tell 20
    // frames a second from 60; someone scrolling sees everything move, and
    // can. So the rate only drops well after the last scroll, and any nudge
    // brings it straight back — a slow scroll must never render in steps.
    if (stage.u !== lastU) {
      lastU = stage.u;
      sinceScroll = 0;
    } else sinceScroll += rawDt;
    const active =
      sinceScroll < 0.5 ||
      Math.abs(stage.u - state.time) > 0.0003 ||
      Math.abs(state.pointer.tx - state.pointer.x) + Math.abs(state.pointer.ty - state.pointer.y) > 0.002 ||
      state.dirty;
    idleFor = active ? 0 : idleFor + rawDt;
    if (idleFor > IDLE_AFTER && !stage.reduced) {
      idleAcc += rawDt;
      if (idleAcc < 1 / 20) return;
    }
    const dt = idleFor > IDLE_AFTER ? Math.min(idleAcc || rawDt, 0.1) : rawDt;
    idleAcc = 0;
    const still = stage.reduced;

    // Scroll: ease towards the published act time. Reduced motion snaps to it.
    const target = THREE.MathUtils.clamp(stage.u, 0, END);
    let time = state.time;
    if (time < 0 || still) time = target;
    else {
      time += (target - time) * (1 - Math.exp(-dt * 4));
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
    renderer.toneMappingExposure = grade.exposure * 1.38;
    hemi.color.copy(grade.top).lerp(white, 0.5);
    hemi.groundColor.copy(grade.horizon).multiplyScalar(0.5);
    hemi.intensity = grade.hemi * 0.5;
    scene.environmentIntensity = 0.32 + grade.hemi * 0.42;
    key.color.copy(grade.sunColor);
    key.intensity = grade.key * 1.18;

    // Camera
    const aspect = state.width / state.height;
    frameCamera(time, aspect, state.portrait, P, L, shot);
    const floor = groundHeight(P.x, P.z) + CAMERA_CLEARANCE;
    camera.position.copy(P);
    camera.lookAt(L);
    if (fine && !still) {
      camera.translateX(ptr.x * 0.35);
      camera.translateY(ptr.y * 0.2);
      camera.position.y = Math.max(camera.position.y, floor);
      camera.lookAt(L);
    }
    const sx = state.portrait ? 0 : shot.shift * THREE.MathUtils.clamp((aspect - 1.05) / 0.5, 0, 1);
    // on a phone the picture sits in the upper part of the frame and the copy below it
    const sy = state.portrait ? -shot.lift : 0;
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
      if (!still) lead.prop.rotation.z -= dt * 34 * p.prop;
      lead.setProp(p.prop);
      landing.intensity = p.landing * (140 + 520 * (1 - air.light));
      beamMat.opacity = p.landing * 0.045 * (1 - air.light * 0.85);
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
    const signs = (0.02 + p.lights * 0.8 * (1 - air.light * 0.85)) * (1 - 0.93 * THREE.MathUtils.smoothstep(time, 10.25, 10.5));
    for (const m of kit.signFaces) m.emissiveIntensity = signs;
    glows.intensity.set(p.lights, p.lantern, Math.max(p.lights * 0.7, p.beacon) * rot, p.lamps);
    glows.update(air.fogDensity, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    sky.update(air, camera, clock);
    refreshEnvironment(air, performance.now());
    clouds.update(air, clock, camera);
    grass.update(clock, air.light);

    film.uniforms.uTime.value = clock;
    // the composer renders several times a frame; count the whole frame, not the last pass
    renderer.info.reset();
    composer.render();
    framesDrawn++;
    if (stage.immersive && !state.portrait) placeAnchors(dt);

    if (!state.ready) {
      state.ready = true;
      onReady();
    }

    // Step quality down on machines that cannot hold the frame rate. Downgrade only, so it settles.
    if (quality.tier < 2 && !still && idleFor <= IDLE_AFTER) {
      const now = performance.now();
      const gap = now - quality.last;
      quality.last = now;
      if (gap > 0 && gap < 90) {
        quality.acc += gap;
        if (++quality.n >= 70) {
          if (quality.acc / quality.n > 21) downgrade();
          quality.acc = quality.n = 0;
        }
      } else quality.acc = quality.n = 0;
    }
  };
  // Compile every shader before the first frame, off the critical path where
  // the driver allows it (KHR_parallel_shader_compile), instead of freezing the
  // page for the whole first render.
  await step('post', 0.8);
  frameCamera(0, state.width / state.height, state.portrait, P, L, shot);
  camera.position.copy(P);
  camera.lookAt(L);
  // The environment map is part of every material's shader. Build the first
  // probe now, or everything compiled here is thrown away and compiled again,
  // blocking, on the first frame.
  sampleGrade(0, grade);
  air.fog.copy(grade.horizon).lerp(grade.top, 0.22);
  air.stars = grade.stars;
  air.light = THREE.MathUtils.clamp(grade.key / 3.2, 0, 1);
  sky.update(air, camera, 0);
  envMark.at = -1e4;
  envMark.sun.set(9, 9, 9);
  refreshEnvironment(air, performance.now());
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* falls back to compiling on the first render */
  }
  await step('shaders', 0.96);
  timings.push(['work', timings.reduce((sum, [, ms]) => sum + ms, 0)], ['wall clock', Math.round(performance.now() - startedAt)]);
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
    /** Force one quality step down (used by tests to prove it never blacks out). */
    stepDown: () => downgrade(),
    /** Where each label landed and why it is as faint as it is. */
    anchorDebug: () => anchored.filter((a) => a.act?.classList.contains('is-live')).map((a) => ({ key: a.key, hidden: a.el.hasAttribute('data-anchor-hidden'), ...a.debug })),
    /** Every compiled GPU program, for keeping their number (and first-load compile time) down. */
    programList: () => (renderer.info.programs ?? []).map((p) => ({ name: p.name, key: String(p.cacheKey).slice(0, 160) })),
    /** How long each build stage took, in ms. */
    startup: () => ({ stages: timings.slice(), detail: kit.profile.filter(([, ms]) => ms >= 8).sort((a, b) => b[1] - a[1]) }),
    info: () => ({ programs: renderer.info.programs?.length ?? 0, frames: framesDrawn, time: state.time, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality: quality.tier }),
    destroy() {
      state.destroyed = true;
      gsap.ticker.remove(tick);
      tl.kill();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisible);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      clearTimeout(lostTimer);
      if (stage.refreshAnchors === collectAnchors) stage.refreshAnchors = null;
      kit.dispose();
      composer.dispose();
      ao?.dispose();
      buffer.dispose();
      envRT?.dispose();
      envGroundMat.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

export type Engine = NonNullable<Awaited<ReturnType<typeof createEngine>>>;
