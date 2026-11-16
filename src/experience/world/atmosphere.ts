import * as THREE from 'three';
import { rng, type Kit } from './kit';

const NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; } return s; }
`;

/** What the grade publishes to every atmospheric layer each frame. */
export interface Air {
  top: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sun: THREE.Vector3;
  fog: THREE.Color;
  fogDensity: number;
  stars: number;
  /** Kept at 0: the journey has no wipes. */
  veil: number;
  /** Cloud visibility, 0…1. */
  cloud: number;
  /** How much daylight there is, 0 night … 1 day. */
  light: number;
}

export function buildSky(kit: Kit) {
  const material = kit.own(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uStars: { value: 0 },
        uVeil: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunColor, uSun, uFog; uniform float uStars, uVeil; varying vec3 vDir;
        float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.75, h), 0.62));
          col = mix(col, uFog, 1.0 - smoothstep(-0.08, 0.05, h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          col = mix(col, uSunColor, clamp(pow(s, 6.0) * 0.32 + pow(s, 70.0) * 0.42 + pow(s, 700.0) * 0.5, 0.0, 1.0));
          col = mix(col, vec3(1.0, 0.96, 0.88), smoothstep(0.99955, 0.9999, s));
          vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 90.0;
          vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float star = step(0.972, hash21(id)) * smoothstep(0.2, 0.0, length(f)) * smoothstep(0.06, 0.45, h);
          col += vec3(star) * uStars * (0.4 + hash21(id + 3.0));
          col = mix(min(col, vec3(1.0)), uFog, uVeil);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const mesh = new THREE.Mesh(kit.own(new THREE.SphereGeometry(900, 32, 20)), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(air: Air, camera: THREE.Camera) {
      const u = material.uniforms;
      u.uTop.value.copy(air.top);
      u.uHorizon.value.copy(air.horizon);
      u.uSunColor.value.copy(air.sunColor).multiplyScalar(0.3 + 0.7 * air.light);
      u.uFog.value.copy(air.fog);
      u.uSun.value.copy(air.sun);
      u.uStars.value = air.stars;
      u.uVeil.value = air.veil;
      mesh.position.copy(camera.position);
    },
  };
}

/** Cloud banks as instanced, camera-facing sheets with soft procedural edges. */
export function buildClouds(kit: Kit) {
  const rand = rng(5);
  const banks: [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, n: number, min: number, max: number][] = [
    [0, 36, -640, 430, 10, 320, 70, 44, 96], // deck under the cruise
    [0, 118, -640, 420, 22, 330, 22, 60, 120], // wisps above it
    [0, 150, -160, 520, 30, 420, 18, 70, 130], // high over the home field
    [0, 120, -1060, 380, 26, 260, 16, 60, 120], // over the strip
    [0, 452, -600, 380, 16, 380, 46, 60, 130], // beneath the chart
    [0, 600, -620, 420, 20, 420, 14, 80, 140], // above it
  ];
  const scaleN = kit.lite ? 0.5 : 1;
  const offsets: number[] = [], scales: number[] = [], seeds: number[] = [];
  for (const [cx, cy, cz, sx, sy, sz, n, min, max] of banks) {
    for (let i = 0; i < Math.round(n * scaleN); i++) {
      const s = min + rand() * (max - min);
      offsets.push(cx + (rand() - 0.5) * 2 * sx, cy + (rand() - 0.5) * 2 * sy, cz + (rand() - 0.5) * 2 * sz);
      scales.push(s * (1.5 + rand()), s * (0.42 + rand() * 0.22));
      seeds.push(rand());
    }
  }
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = kit.own(new THREE.InstancedBufferGeometry());
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 2));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  geo.instanceCount = seeds.length;
  const material = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uLight: { value: new THREE.Color() },
        uShade: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uFogDensity: { value: 0.002 },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec2 aScale; attribute float aSeed;
        uniform float uTime; varying vec2 vUv; varying float vNear; varying float vDist; varying float vSeed;
        void main(){
          vec3 p = aOffset;
          p.x += sin(uTime * 0.02 + aSeed * 40.0) * 14.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          mv.xy += position.xy * aScale;
          vNear = smoothstep(8.0, 46.0, -mv.z);
          vDist = -mv.z; vUv = uv; vSeed = aSeed;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight, uShade, uFog; uniform float uFogDensity, uTime, uOpacity;
        varying vec2 vUv; varying float vNear; varying float vDist; varying float vSeed;
        ${NOISE}
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c * vec2(1.0, 1.3)) * 2.0;
          float n = fbm(vUv * vec2(4.0, 2.6) + vSeed * 31.0 + uTime * 0.004);
          float a = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.9);
          a = a * a * vNear * 0.6 * uOpacity;
          if (a < 0.004) discard;
          vec3 col = mix(uShade, uLight, smoothstep(0.15, 0.85, vUv.y + (n - 0.5) * 0.5));
          float fog = 1.0 - exp(-pow(vDist * uFogDensity * 0.6, 2.0));
          gl_FragColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), a);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const white = new THREE.Color('#ffffff');
  return {
    mesh,
    update(air: Air, time: number) {
      const u = material.uniforms;
      u.uTime.value = time;
      (u.uLight.value as THREE.Color).copy(air.sunColor).lerp(white, 0.2).lerp(air.horizon, 0.45).multiplyScalar((0.12 + 0.88 * air.light) * 0.82);
      (u.uShade.value as THREE.Color).copy(air.top).lerp(air.horizon, 0.55);
      u.uFog.value.copy(air.fog);
      u.uFogDensity.value = air.fogDensity;
      u.uOpacity.value = air.cloud;
    },
  };
}

/** Every small light in the world, drawn in one call as soft additive points. */
export function buildGlows(kit: Kit) {
  const n = kit.glows.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), kind = new Float32Array(n);
  const c = new THREE.Color();
  kit.glows.forEach((g, i) => {
    g.position.toArray(pos, i * 3);
    c.set(g.color).toArray(col, i * 3);
    size[i] = g.size;
    kind[i] = g.kind;
  });
  const geo = kit.own(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const material = kit.own(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uI: { value: new THREE.Vector4(1, 0, 0, 1) }, uScale: { value: 800 }, uFogDensity: { value: 0.002 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aKind;
        uniform vec4 uI; uniform float uScale, uFogDensity; varying vec3 vC; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float I = aKind < 0.5 ? uI.x : aKind < 1.5 ? uI.y : aKind < 2.5 ? uI.z : uI.w;
          vA = I * exp(-pow(-mv.z * uFogDensity, 2.0));
          vC = aColor;
          gl_PointSize = max(aSize * uScale / -mv.z, 2.5);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(1.0 - d, 0.0), 2.6) + smoothstep(0.12, 0.0, d) * 0.6;
          gl_FragColor = vec4(vC, a * vA);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return {
    points,
    intensity: material.uniforms.uI.value as THREE.Vector4,
    update(fogDensity: number, pixelsPerUnit: number) {
      material.uniforms.uFogDensity.value = fogDensity;
      material.uniforms.uScale.value = pixelsPerUnit;
    },
  };
}
