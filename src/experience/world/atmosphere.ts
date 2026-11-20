import * as THREE from 'three';
import { rng, type Kit } from './kit';
import { surfaceHeight } from './terrain';

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

/** Henyey–Greenstein phase: how strongly haze and cloud scatter light toward the eye. */
const PHASE = /* glsl */ `
float hg(float c, float g){ float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
`;

/** Five-octave noise for the cloud layer, with a domain warp so it billows rather than blots. */
const CLOUD_NOISE = /* glsl */ `
float cfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < CLOUD_OCTAVES; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.7; a *= 0.5; } return s; }
`;

/**
 * The sky, in scene-referred light rather than display colour: a zenith-to-
 * horizon gradient the grade art-directs, Mie scattering around the sun, a
 * sun disc forty times brighter than the sky so the tone curve and bloom treat
 * it as a light source, and a high cloud layer lit and self-shadowed from the
 * sun's direction. The same material lights the scene through the IBL probe,
 * so the clouds and the sun appear in every reflection.
 */
export function buildSky(kit: Kit) {
  const material = kit.own(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      defines: { CLOUD_OCTAVES: 4 },
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uStars: { value: 0 },
        uVeil: { value: 0 },
        uTime: { value: 0 },
        uCloud: { value: 1 },
        uLight: { value: 1 },
        uDisc: { value: 1 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uSunColor, uSun, uFog;
        uniform float uStars, uVeil, uTime, uCloud, uLight, uDisc;
        varying vec3 vDir;
        ${NOISE}
        ${PHASE}
        ${CLOUD_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          vec3 sd = normalize(uSun);
          float h = d.y;
          float mu = dot(d, sd);

          // Rayleigh-ish gradient, art-directed by the grade, with the bright,
          // thick band real horizons have from looking through more air
          // The warm horizon belongs to the side of the sky the sun is on.
          // Away from it the horizon is pale and cool, and a gradient from
          // that to the zenith never passes through the mauve that a straight
          // orange-to-navy mix does.
          float toward = pow(clamp(dot(normalize(d.xz + 1e-4), normalize(sd.xz + 1e-4)) * 0.5 + 0.5, 0.0, 1.0), 2.2);
          vec3 cool = mix(vec3(dot(uTop, vec3(0.299, 0.587, 0.114))), uTop, 0.55) * 2.6 + vec3(0.05, 0.06, 0.08);
          vec3 horizon = mix(mix(cool, uHorizon, 0.3), uHorizon, toward);
          vec3 col = mix(horizon, uTop, 1.0 - exp(-max(h, 0.0) * 5.5));
          col += horizon * 0.22 * exp(-max(h, 0.0) * 11.0);
          // Mie: a broad aureole, and a tight halo close to the disc
          col += uSunColor * (hg(mu, 0.72) * 0.55 + hg(mu, 0.95) * 0.09) * (0.35 + 0.65 * uLight);
          // below the horizon the eye sees haze over the ground
          col = mix(col, uFog, 1.0 - smoothstep(-0.07, 0.015, h));
          // the disc itself, in HDR
          col += uSunColor * smoothstep(0.99983, 0.99992, mu) * 42.0 * smoothstep(-0.015, 0.02, h) * uDisc;

          // stars sit behind everything else
          vec2 g = vec2(atan(d.z, d.x), asin(clamp(h, -1.0, 1.0))) * 90.0;
          vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          col += vec3(step(0.972, hash21(id)) * smoothstep(0.2, 0.0, length(f)) * smoothstep(0.06, 0.45, h)) * uStars * (0.4 + hash21(id + 3.0));

          // high cloud: a layer projected onto the dome, domain-warped so it
          // billows, and lit by marching a short step toward the sun
          if (h > 0.0 && uCloud > 0.01) {
            vec2 p = d.xz / (h + 0.1) * 1.35 + vec2(uTime * 0.0035, uTime * 0.0012);
            float wq = cfbm(p * 0.55 + 3.1);
            vec2 w = vec2(wq, 1.0 - wq);
            float n = cfbm(p + w * 1.7);
            float cover = smoothstep(0.47, 0.8, n) * uCloud;
            if (cover > 0.002) {
              vec2 toward = normalize(sd.xz + vec2(1e-4)) * (0.07 + 0.08 * (1.0 - abs(sd.y)));
              float n1 = cfbm(p + toward + w * 1.7);
              // how much cloud lies between this point and the sun
              float occlusion = clamp(n1 - n + 0.06, 0.0, 0.3) / 0.3;
              float lit = 1.0 - occlusion;
              // shadowed cloud is grey, not a mix of sky colours
              vec3 tint = mix(uTop, uHorizon, 0.5);
              vec3 base = mix(vec3(dot(tint, vec3(0.299, 0.587, 0.114))), tint, 0.35) * (0.5 + 0.3 * uLight);
              vec3 sunlit = uSunColor * (1.05 + 0.4 * uLight) + uTop * 0.18;
              vec3 cc = mix(base, sunlit, pow(lit, 0.8));
              // thin edges glow when the sun is behind them
              cc += uSunColor * hg(mu, 0.86) * 0.9 * (1.0 - smoothstep(0.0, 0.6, cover));
              // distance: cloud dissolves into the horizon haze
              float near = smoothstep(0.0, 0.22, h);
              cc = mix(uHorizon * 1.05, cc, near);
              col = mix(col, cc, cover * mix(0.35, 0.96, near));
            }
          }

          col = mix(col, uFog, uVeil);
          col = clamp(col, 0.0, 64.0);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const mesh = new THREE.Mesh(kit.own(new THREE.SphereGeometry(900, 48, 28)), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    /** The sun is already the key light; the IBL probe must not count it twice. */
    disc(on: boolean) {
      material.uniforms.uDisc.value = on ? 1 : 0;
    },
    update(air: Air, camera: THREE.Camera, time: number) {
      const u = material.uniforms;
      u.uTop.value.copy(air.top);
      u.uHorizon.value.copy(air.horizon);
      u.uSunColor.value.copy(air.sunColor).multiplyScalar(0.25 + 0.75 * air.light);
      u.uFog.value.copy(air.fog);
      u.uSun.value.copy(air.sun);
      u.uStars.value = air.stars;
      u.uVeil.value = air.veil;
      u.uTime.value = time;
      u.uCloud.value = air.cloud;
      u.uLight.value = air.light;
      mesh.position.copy(camera.position);
    },
  };
}

/**
 * Low cloud the camera flies past: camera-facing sheets, but each one shaded
 * as a lumpy volume lit from the sun's actual direction, with cauliflower
 * edges on top and a flat, darker base — the way cumulus really reads.
 */
export function buildClouds(kit: Kit) {
  const rand = rng(5);
  const banks: [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, n: number, min: number, max: number][] = [
    [0, 36, -640, 430, 10, 320, 120, 40, 90], // deck under the cruise
    [0, 118, -640, 420, 22, 330, 16, 60, 120], // above it
    [0, 150, -160, 520, 30, 420, 14, 70, 130], // high over the home field
    [0, 120, -1060, 380, 26, 260, 12, 60, 120], // over the strip
  ];
  const scaleN = kit.lite ? 0.5 : 1;
  const offsets: number[] = [], scales: number[] = [], seeds: number[] = [];
  for (const [cx, cy, cz, sx, sy, sz, n, min, max] of banks) {
    for (let i = 0; i < Math.round(n * scaleN); i++) {
      const s = min + rand() * (max - min);
      const x = cx + (rand() - 0.5) * 2 * sx, z = cz + (rand() - 0.5) * 2 * sz;
      const w = s * (1.05 + rand() * 0.5), hgt = s * (0.55 + rand() * 0.25);
      const y = cy + (rand() - 0.5) * 2 * sy;
      // A card that dips into a hillside shows a hard line where it is cut.
      // Clouds whose footprint the ground would cross are left out, so the
      // deck lies in the valleys and never slices through a slope.
      let ground = -Infinity;
      for (let gx = -1; gx <= 1; gx += 0.5) for (let gz = -1; gz <= 1; gz += 0.5) ground = Math.max(ground, surfaceHeight(x + gx * w * 0.5, z + gz * w * 0.5));
      const seed = rand();
      if (ground > y - hgt * 0.55) continue;
      offsets.push(x, y, z);
      scales.push(w, hgt);
      seeds.push(seed);
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
      defines: { CLOUD_OCTAVES: 4 },
      uniforms: {
        uTime: { value: 0 },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uShade: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uFogDensity: { value: 0.002 },
        uOpacity: { value: 1 },
        uLight: { value: 1 },
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
        uniform vec3 uSunView, uSunColor, uSky, uShade, uFog;
        uniform float uFogDensity, uTime, uOpacity, uLight;
        varying vec2 vUv; varying float vNear; varying float vDist; varying float vSeed;
        ${NOISE}
        ${CLOUD_NOISE}
        void main(){
          vec2 c = (vUv - 0.5) * 2.0;
          vec2 q = vUv * vec2(3.2, 2.0) + vSeed * 31.0 + vec2(uTime * 0.003, 0.0);
          float n = cfbm(q + cfbm(q * 0.7 + 5.0) * 1.2);
          // cumulus: a billowing top, a flat base
          float top = length(c * vec2(1.0, 1.25 + 0.35 * step(0.0, -c.y)));
          float body = top + (0.5 - n) * 0.95;
          float base = smoothstep(-0.62, -0.38, c.y + (n - 0.5) * 0.12);
          float a = smoothstep(1.0, 0.7, body) * base;
          // never let a puff reach the edge of its card: a straight cut is the giveaway
          vec2 e = abs(c);
          a *= (1.0 - smoothstep(0.72, 0.96, e.x)) * (1.0 - smoothstep(0.66, 0.94, e.y));
          a *= vNear * uOpacity;
          if (a < 0.004) discard;
          // treat the sheet as a lumpy volume and light it from the real sun
          vec3 nrm = normalize(vec3(c.x * 0.9, c.y * 0.9 + (n - 0.5) * 0.8, 0.55));
          float wrap = clamp(dot(nrm, normalize(uSunView)) * 0.5 + 0.5, 0.0, 1.0);
          float self = smoothstep(0.25, 0.8, n);
          vec3 lit = uSunColor * (1.15 + 0.45 * uLight) + uSky * 0.25;
          vec3 grey = mix(vec3(dot(uShade, vec3(0.299, 0.587, 0.114))), uShade, 0.4);
          vec3 col = mix(grey, lit, wrap * (0.55 + 0.45 * self));
          col *= mix(0.72, 1.0, smoothstep(-0.5, 0.2, c.y));
          float fd = max(vDist, 0.0) * uFogDensity * 0.6;
          float fog = 1.0 - exp(-fd * fd);
          gl_FragColor = vec4(mix(col, uFog, clamp(fog, 0.0, 1.0)), a * 0.92);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    mesh,
    update(air: Air, time: number, camera: THREE.Camera) {
      const u = material.uniforms;
      u.uTime.value = time;
      (u.uSunView.value as THREE.Vector3).copy(air.sun).transformDirection(camera.matrixWorldInverse);
      (u.uSunColor.value as THREE.Color).copy(air.sunColor).multiplyScalar(0.18 + 0.82 * air.light);
      (u.uSky.value as THREE.Color).copy(air.top);
      (u.uShade.value as THREE.Color).copy(air.top).lerp(air.horizon, 0.5).multiplyScalar(0.42 + 0.25 * air.light);
      u.uFog.value.copy(air.fog);
      u.uFogDensity.value = air.fogDensity;
      u.uOpacity.value = air.cloud;
      u.uLight.value = air.light;
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
          float fd = max(-mv.z, 0.0) * uFogDensity;
          vA = I * exp(-fd * fd);
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
