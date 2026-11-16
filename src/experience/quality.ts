'use client';

import { useSyncExternalStore } from 'react';

/** What the visitor chose. `auto` defers to the capability check. */
export type QualityPreference = 'auto' | 'high' | 'balanced' | 'lite';
/** What actually runs. A = full, B = balanced, C = static (no WebGL). */
export type Tier = 'A' | 'B' | 'C';

const KEY = 'aby-quality';
const listeners = new Set<() => void>();
let autoDowngraded = false;

function read(): QualityPreference {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'high' || v === 'balanced' || v === 'lite' || v === 'auto') return v;
  } catch {
    /* storage blocked — fall through */
  }
  return 'auto';
}

export function setQualityPreference(pref: QualityPreference) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* preference simply won't persist */
  }
  autoDowngraded = false;
  listeners.forEach((l) => l());
}

/** Called by the frame-rate monitor when the device cannot hold the high tier. */
export function downgradeAuto() {
  if (autoDowngraded) return;
  autoDowngraded = true;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function useQualityPreference(): QualityPreference {
  return useSyncExternalStore(subscribe, read, () => 'auto');
}

export function useAutoDowngraded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => autoDowngraded,
    () => false,
  );
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Capability-based tiering — measured signals only, no user-agent sniffing. */
export function detectTier(): Tier {
  if (!webglAvailable()) return 'C';
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData) return 'C';
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return 'C';
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (cores <= 4 || memory <= 4 || coarse) return 'B';
  return 'A';
}

export function resolveTier(pref: QualityPreference, downgraded: boolean): Tier {
  if (pref === 'lite') return 'C';
  if (!webglAvailable()) return 'C';
  if (pref === 'high') return 'A';
  if (pref === 'balanced') return 'B';
  const detected = detectTier();
  return detected === 'A' && downgraded ? 'B' : detected;
}

/** The tier that is actually running, once decided. Null until then. */
let runtimeTier: Tier | null = null;
export function setRuntimeTier(t: Tier) {
  if (runtimeTier === t) return;
  runtimeTier = t;
  listeners.forEach((l) => l());
}
export function useRuntimeTier(): Tier | null {
  return useSyncExternalStore(
    subscribe,
    () => runtimeTier,
    () => null,
  );
}
