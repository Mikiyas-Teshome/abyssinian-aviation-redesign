'use client';

import { useEffect, useState } from 'react';

/**
 * Preflight. Cosmetic and CSS-timed (≈1.7 s): it never waits on assets, never
 * intercepts clicks, and is skipped on repeat views in a session.
 */
export function Preloader() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem('aby-seen', '1');
    } catch {
      /* ignore */
    }
  }, []);

  if (gone) return null;
  return (
    <div className="preflight" onAnimationEnd={(e) => e.animationName === 'preflight-out' && setGone(true)}>
      <p className="preflight__word" aria-hidden="true">
        {'ABYSSINIAN'.split('').map((c, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties}>{c}</span>
        ))}
      </p>
      <span className="preflight__line" aria-hidden="true" />
      <button type="button" onClick={() => setGone(true)}>Skip intro</button>
    </div>
  );
}
