'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { onProgress } from './stage';

const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  return () => mo.disconnect();
};

/** True while acts are pinned and scrubbed by scroll. */
export function useImmersive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.mode === 'immersive',
    () => false,
  );
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
