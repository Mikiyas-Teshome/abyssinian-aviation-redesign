'use client';

import { useEffect, useRef, useState } from 'react';
import { reportLoad, stage } from '@/animation/stage';
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

  useEffect(() => {
    if (pref !== 'lite') void import('./world/engine');
    const decided = resolveTier(pref, downgraded);
    setTier(decided);
  }, [pref, downgraded]);

  const active = tier && tier !== 'C' && !failed ? tier : null;

  useEffect(() => {
    if (!tier) return;
    const effective: Tier = active ?? 'C';
    // without a world to build there is nothing to wait for
    if (!active) reportLoad(1, true);
    document.documentElement.dataset.tier = effective;
    setRuntimeTier(effective);
  }, [tier, active]);

  useEffect(() => {
    stage.reduced = reduced;
    engine.current?.invalidate();
  }, [reduced]);

  // The engine is loaded only when it will be used, and built in stages that
  // report their progress to the intro.
  useEffect(() => {
    if (!active || !canvas.current) return;
    const signal = { cancelled: false };
    reportLoad(0.04);
    import('./world/engine')
      .then(async ({ createEngine, BUILD_CANCELLED }) => {
        if (signal.cancelled || !canvas.current) return;
        try {
          const e = await createEngine(canvas.current, {
            lite: active === 'B',
            signal,
            onProgress: (done) => reportLoad(0.06 + done * 0.9),
            onReady: () => {
              setReady(true);
              reportLoad(1, true);
            },
            onLost: () => setFailed(true),
          });
          if (!e) return setFailed(true);
          if (signal.cancelled) return e.destroy();
          engine.current = e;
          // console handle for inspecting any moment of the journey
          (window as unknown as { __engine: Engine }).__engine = e;
        } catch (err) {
          if (err !== BUILD_CANCELLED) {
            console.error(err);
            setFailed(true);
          }
        }
      })
      .catch(() => setFailed(true));
    return () => {
      signal.cancelled = true;
      engine.current?.destroy();
      engine.current = null;
      setReady(false);
    };
  }, [active]);

  // if the world cannot be built, the intro must not wait for it
  useEffect(() => {
    if (failed) reportLoad(1, true);
  }, [failed]);

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
