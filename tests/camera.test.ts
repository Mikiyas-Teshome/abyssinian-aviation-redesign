import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_CLEARANCE, frameCamera, sampleCamera } from '../src/experience/world/route';
import { groundHeight } from '../src/experience/world/terrain';

/** Screen shapes the site is laid out for: phones, tablets, laptops, wide desktops. */
const SCREENS: [name: string, w: number, h: number][] = [
  ['small phone', 320, 568],
  ['phone', 390, 844],
  ['tall phone', 430, 932],
  ['tablet portrait', 820, 1180],
  ['tablet landscape', 1024, 768],
  ['laptop', 1366, 768],
  ['desktop', 1440, 900],
  ['wide', 2560, 1080],
];

const END = 11;
const STEP = 0.005;

describe('camera route', () => {
  for (const [name, w, h] of SCREENS) {
    it(`never goes underground on a ${name} (${w}×${h})`, () => {
      const pos = new THREE.Vector3(), look = new THREE.Vector3(), shot = { shift: 0, pullback: 1, lift: 0.2 };
      const portrait = h > w * 1.05;
      let lowest = Infinity, at = 0;
      for (let t = 0; t <= END; t += STEP) {
        frameCamera(t, w / h, portrait, pos, look, shot);
        const clearance = pos.y - groundHeight(pos.x, pos.z);
        if (clearance < lowest) {
          lowest = clearance;
          at = t;
        }
      }
      expect(lowest, `lowest point at act time ${at.toFixed(3)}`).toBeGreaterThanOrEqual(CAMERA_CLEARANCE - 1e-6);
    });
  }

  it('only needed the floor on tall screens — the authored desktop route is already clear', () => {
    // Guards against the floor silently papering over a mistake in the route itself.
    const pos = new THREE.Vector3(), look = new THREE.Vector3(), shot = { shift: 0, pullback: 1, lift: 0.2 };
    let lowest = Infinity;
    for (let t = 0; t <= END; t += STEP) {
      sampleCamera(t, pos, look, shot);
      lowest = Math.min(lowest, pos.y - groundHeight(pos.x, pos.z));
    }
    expect(lowest).toBeGreaterThan(0.5);
  });

  it('records where a phone pull-back would have gone underground without the floor', () => {
    const pos = new THREE.Vector3(), look = new THREE.Vector3(), shot = { shift: 0, pullback: 1, lift: 0.2 };
    const under: number[] = [];
    for (let t = 0; t <= END; t += 0.02) {
      sampleCamera(t, pos, look, shot);
      pos.sub(look).multiplyScalar(shot.pullback).add(look);
      if (pos.y < groundHeight(pos.x, pos.z)) under.push(Math.round(t * 100) / 100);
    }
    // the medical-evacuation approach (act 3) is the case reported from a phone
    expect(under.some((t) => t >= 3 && t < 4)).toBe(true);
  });
});
