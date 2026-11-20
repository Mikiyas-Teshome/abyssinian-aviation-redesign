'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { loadPlaced, loadProgress, loadReady, subscribeLoad } from '@/animation/stage';
import { prefersReducedMotion } from '@/animation/motion-policy';

/** A first visit plays the sequence out, so it reads as finished rather than cut. */
const MIN_FIRST_MS = 2400;
/** Nothing to build (Lite, or no WebGL): the lettering finishes and the curtain goes. */
const MIN_EMPTY_MS = 1500;
/** Nobody waits longer than this; the world then fades in when it is ready. */
const MAX_MS = 9000;

/** A pilot's preflight, mapped onto the real stages of building the world. */
const CHECKLIST: [until: number, label: string][] = [
  [0.18, 'Walk-round'],
  [0.42, 'Controls free and correct'],
  [0.66, 'Instruments set'],
  [0.9, 'Lights and beacon'],
  [1.01, 'Clear for departure'],
];

type Phase = 'intro' | 'leaving' | 'gone';

/**
 * Preflight.
 *
 * Arriving at the page plays the sequence, and holds the page still until
 * there is a world to scroll through — the alternative is scrolling past
 * chapters whose scenery has not been built yet. A reload shows nothing at
 * all: whoever pressed refresh has seen it, and lands back at the top with
 * the painted sky standing in until the world catches up.
 *
 * It is rendered on the server, so it is painted in the first frame rather
 * than after hydration. Clicks pass through it, the page underneath is
 * already readable, and it can always be skipped.
 */
export function Preloader() {
  const progress = useSyncExternalStore(subscribeLoad, loadProgress, () => 0);
  const ready = useSyncExternalStore(subscribeLoad, loadReady, () => false);
  const placed = useSyncExternalStore(subscribeLoad, loadPlaced, () => false);
  // Always the same first render as the server's. Deciding here that a reload
  // needs no cover would render nothing against a server that rendered one,
  // and React answers that mismatch by rebuilding <html> from the server's
  // markup — throwing away the boot flags, the reload flag among them, so the
  // intro played again and its scroll lock was never released. The reload case
  // is hidden by CSS in the very first paint and dropped in the effect below.
  const [phase, setPhase] = useState<Phase>('intro');
  const startedAt = useRef(0);
  /** A reload, which is held but not performed to. */
  const resume = useRef(false);
  const unlock = useRef<() => void>(() => {});
  const minimum = useRef(MIN_FIRST_MS);

  const leave = useCallback(() => {
    document.documentElement.setAttribute('data-entered', '');
    document.documentElement.removeAttribute('data-hold');
    unlock.current();
    // A reload has already been put back where it was; only an arrival starts
    // at the top.
    if (!window.location.hash && !resume.current) window.scrollTo({ top: 0, behavior: 'instant' });
    setPhase((p) => (p === 'intro' ? 'leaving' : p));
    // animationend is not dependable while the main thread is busy finishing
    // the world, and the curtain is clear of the screen by then anyway
    setTimeout(() => setPhase('gone'), 2300);
  }, []);

  useEffect(() => {
    startedAt.current = performance.now();
    // the boot script already decided this, before the first paint
    const seen = document.documentElement.hasAttribute('data-seen');
    resume.current = seen;
    // `overflow: hidden` stops the page moving, but the wheel deltas still
    // queue up and land the instant it is released. Refusing the events
    // themselves is what actually keeps the visitor at the start.
    const swallow = (e: Event) => e.preventDefault();
    const keys = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('wheel', swallow, { passive: false });
    window.addEventListener('touchmove', swallow, { passive: false });
    window.addEventListener('keydown', keys);
    unlock.current = () => {
      window.removeEventListener('wheel', swallow);
      window.removeEventListener('touchmove', swallow);
      window.removeEventListener('keydown', keys);
    };
    if (prefersReducedMotion()) minimum.current = 0;
    return () => unlock.current();
  }, []);

  useEffect(() => {
    if (phase !== 'intro') return;
    const elapsed = performance.now() - startedAt.current;
    // A reload also waits to be put back where it was: lifting before that
    // shows the top of the page and then jumps away from it.
    if (!ready || (resume.current && !placed)) {
      const t = setTimeout(leave, Math.max(0, MAX_MS - elapsed));
      return () => clearTimeout(t);
    }
    // ready before the engine even started means there is no world to wait for
    const floor = progress >= 1 && elapsed < 600 ? Math.min(minimum.current, MIN_EMPTY_MS) : minimum.current;
    const t = setTimeout(leave, Math.max(0, floor - elapsed));
    return () => clearTimeout(t);
  }, [ready, placed, progress, phase, leave]);

  if (phase === 'gone') return null;
  const shown = Math.max(0.03, ready ? 1 : progress);
  const label = CHECKLIST.find(([until]) => shown < until)?.[1] ?? CHECKLIST[CHECKLIST.length - 1][1];

  return (
    <div
      className="preflight"
      data-phase={phase}
      onAnimationEnd={(e) => (e.animationName === 'preflight-lift' || e.animationName === 'fade-out') && setPhase('gone')}
    >
      <div className="preflight__inner">
        {/* eslint-disable-next-line @next/next/no-img-element -- the curtain is painted
            in the first frame, before hydration; next/image would defer it */}
        <img
          className="preflight__logo"
          src="/logo.svg"
          width={364}
          height={83}
          alt="Abyssinian Flight Services and Aviation Academy"
          fetchPriority="high"
        />
        <div
          className="preflight__progress"
          role="progressbar"
          aria-label="Loading the 3D world"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown * 100)}
        >
          <span style={{ transform: `scaleX(${shown})` }} />
        </div>
        <p className="preflight__status" aria-hidden="true">
          <span>{label}</span>
          <span className="preflight__pct">{String(Math.round(shown * 100)).padStart(3, ' ')}</span>
        </p>
      </div>
      <button type="button" onClick={leave}>Skip intro</button>
    </div>
  );
}
