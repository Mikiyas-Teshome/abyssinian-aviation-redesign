'use client';

import { useEffect, useRef, useState } from 'react';
import { stage } from '@/animation/stage';
import { useReducedMotion } from '@/animation/motion-policy';
import type { Engine } from './world/engine';
import { resolveTier, setRuntimeTier, useAutoDowngraded, useQualityPreference, type Tier } from './quality';

/**
 * The world. One canvas, mounted once, that every chapter of the page lives in.
 * A flat painted sky sits underneath so the page is never blank while the
 * engine loads, and remains as the picture when WebGL is unavailable.
 */
export function Experience() {
  const pref = useQualityPreference();
  const downgraded = useAutoDowngraded();
  const reduced = useReducedMotion();
  const [tier, setTier] = useState<Tier | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);

  // Decide the tier after first paint, when the browser is idle.
  useEffect(() => {
    const decide = () => setTier(resolveTier(pref, downgraded));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(decide, { timeout: 900 });
    else setTimeout(decide, 150);
  }, [pref, downgraded]);

  const active = tier && tier !== 'C' && !failed ? tier : null;

  useEffect(() => {
    if (!tier) return;
    const effective: Tier = active ?? 'C';
    document.documentElement.dataset.tier = effective;
    setRuntimeTier(effective);
  }, [tier, active]);

  useEffect(() => {
    stage.reduced = reduced;
    engine.current?.invalidate();
  }, [reduced]);

  // The engine is loaded only when it will be used.
  useEffect(() => {
    if (!active || !canvas.current) return;
    let cancelled = false;
    import('./world/engine').then(({ createEngine }) => {
      if (cancelled || !canvas.current) return;
      const e = createEngine(canvas.current, { lite: active === 'B', onReady: () => setReady(true), onLost: () => setFailed(true) });
      if (!e) return setFailed(true);
      engine.current = e;
      // console handle for inspecting any moment of the journey
      (window as unknown as { __engine: Engine }).__engine = e;
    });
    return () => {
      cancelled = true;
      engine.current?.destroy();
      engine.current = null;
      setReady(false);
    };
  }, [active]);

  return (
    <div className="world" aria-hidden="true">
      <div className="world__sky" />
      {active && (
        <div ref={wrap} className={`world__canvas${ready ? ' is-ready' : ''}`}>
          <canvas ref={canvas} key={active} />
        </div>
      )}
      <div className="world__grain" />
    </div>
  );
}
