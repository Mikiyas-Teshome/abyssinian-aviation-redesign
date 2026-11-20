'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { onProgress } from './stage';

/** True while acts are pinned and scrubbed by scroll (always true in 3D experience). */
export function useImmersive(): boolean {
  return true;
}

/** An act's raw scroll progress, 0 at its top and 1 at its bottom. */
export function useActProgress(actId: string): number {
  const [p, setP] = useState(0);
  useEffect(() => onProgress(actId, setP), [actId]);
  return p;
}

/**
 * A step index derived from an act's scroll progress. `bounds` are the
 * progress values at which each next step begins.
 */
export function useActStep(actId: string, bounds: number[]): number {
  const [step, setStep] = useState(0);
  useEffect(
    () =>
      onProgress(actId, (p) => {
        let i = 0;
        while (i < bounds.length && p >= bounds[i]) i++;
        setStep(i);
      }),
    // bounds are static per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actId],
  );
  return step;
}
