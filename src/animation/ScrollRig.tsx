'use client';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { ACTS, markPlaced, publishProgress, stage } from './stage';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Where this visit had got to, kept across a reload for the length of the tab. */
const PLACE = 'abyssinian:place';

// The scroll position restore() calculated while overflow:hidden was still active.
// overflow:hidden clamps scrollY to 0, so the scrollTo() is a no-op. We store
// the target here and re-apply it in the Preloader's leave(), after data-hold is removed.
let pendingRestore: number | null = null;

/** Re-apply the scroll restore after the cover's overflow lock is released. */
export function reapplyRestore() {
  if (pendingRestore === null) return;
  const target = pendingRestore;
  pendingRestore = null;
  window.scrollTo({ top: target, behavior: 'instant' });
  ScrollTrigger.update();
  (window as unknown as { __engine?: { snap(): void } }).__engine?.snap();
}

/**
 * The scroll rig. In the immersive mode each act is a tall section with a
 * pinned stage: its scroll progress becomes act time for the world, and one
 * scrubbed timeline per act brings the copy in and takes it out again.
 *
 * Without WebGL, or with reduced motion, the page is a flat document instead:
 * nothing is pinned or scrubbed, and the world (if present) cuts between
 * still frames as each act comes into view.
 */
export function ScrollRig() {
  useGSAP(
    () => {
      const root = document.documentElement;
      root.dataset.mode = 'immersive';
      stage.immersive = true;
      const acts = gsap.utils.toArray<HTMLElement>('.act');
      const rail = gsap.utils.toArray<HTMLElement>('[data-rail]');
      const hudIndex = document.querySelector('[data-hud-index]');
      const hudLabel = document.querySelector('[data-hud-label]');
      let current = -1;

      const setActive = (i: number) => {
        if (i === current) return;
        current = i;
        root.dataset.act = ACTS[i].id;
        if (hudIndex) hudIndex.textContent = String(i + 1).padStart(2, '0');
        if (hudLabel) hudLabel.textContent = ACTS[i].label;
        rail.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
      };

      // On a first visit the SSR position is stale; reset to top.
      // On a reload keep the position: restore() will put us back precisely.
      if (!window.location.hash && window.scrollY > 0 && !root.hasAttribute('data-seen'))
        window.scrollTo({ top: 0, behavior: 'instant' });
        acts.forEach((el, i) => {
          const def = ACTS[i];
          const last = i === acts.length - 1;
          // Act time for the world.
          ScrollTrigger.create({
            trigger: el,
            start: 'top top',
            end: last ? 'bottom bottom' : 'bottom top',
            onUpdate: (self) => {
              stage.u = i + self.progress;
              publishProgress(def.id, self.progress);
            },
          });
          ScrollTrigger.create({
            trigger: el,
            start: 'top 55%',
            end: 'bottom 55%',
            onToggle: (self) => self.isActive && setActive(i),
          });
          // The copy is "live" from the moment it starts to arrive until its stage lets go.
          ScrollTrigger.create({
            trigger: el,
            start: 'top 70%',
            end: last ? 'bottom top' : 'bottom bottom',
            toggleClass: { targets: el, className: 'is-live' },
          });

          const inner = el.querySelector('.stage__inner');
          const rises = el.querySelectorAll('.ln > span');
          const fades = el.querySelectorAll('[data-in]');
          if (last) {
            gsap
              .timeline({ defaults: { ease: 'power2.out' }, scrollTrigger: { trigger: el, start: 'top 70%', end: 'top 12%', scrub: 0.4 } })
              .fromTo(rises, { yPercent: 110 }, { yPercent: 0, stagger: 0.08, duration: 0.6 }, 0)
              .fromTo(fades, { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.6 }, 0.1);
            return;
          }
          const first = i === 0;
          // Timeline measured in viewport heights of scroll.
          const length = first ? def.len - 1.05 : def.len - 0.4;
          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: el, start: first ? 'top top' : 'top 65%', end: 'bottom 105%', scrub: 0.4 },
          });
          if (!first) {
            tl.fromTo(rises, { yPercent: 104, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, stagger: 0.07, ease: 'power2.out' }, 0.06);
            tl.fromTo(fades, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.34, stagger: { amount: 0.24 }, ease: 'power1.out' }, 0.2);
          }
          tl.to(inner, { opacity: 0, duration: 0.42, ease: 'power1.inOut' }, length - 0.44);
          tl.set({}, {}, length);
        });

        // Keyboard: content of another act is in the tab order but off stage — bring its act on.
        const onFocus = (e: FocusEvent) => {
          const act = (e.target as HTMLElement).closest<HTMLElement>('.act');
          if (!act) return;
          const i = acts.indexOf(act);
          const p = stage.progress[ACTS[i].id] ?? -1;
          const holdEnd = 1 - 1.5 / Math.max(ACTS[i].len, 1.6);
          const visible = i === acts.length - 1 ? act.getBoundingClientRect().top < window.innerHeight * 0.3 : p >= 0 && p <= holdEnd && act.classList.contains('is-live');
          if (!visible) window.scrollTo({ top: act.offsetTop + 2, behavior: 'instant' });
        };
        document.addEventListener('focusin', onFocus);
        stage.refreshAnchors?.();

        // A pinned stage is exactly one screen tall, so its copy must always fit inside it.
        // Type already scales with the viewport height; this is the guarantee for whatever is
        // left over (a short laptop, a small phone, large text settings): the block is scaled
        // down as one piece, never cut off.
        const fit = () => {
          acts.forEach((el, i) => {
            if (i === acts.length - 1) return;
            const inner = el.querySelector<HTMLElement>('.stage__inner');
            if (!inner) return;
            const room = inner.clientHeight;
            const copies = el.querySelectorAll<HTMLElement>('.copy');
            copies.forEach((c) => c.style.setProperty('--fit', String(Math.max(0.5, Math.min(1, room / c.offsetHeight)).toFixed(3))));
            if (!copies.length) {
              // stacked blocks without a single wrapper (the two journeys on a phone)
              inner.style.setProperty('--fit', '1');
              const need = inner.scrollHeight;
              inner.style.setProperty('--fit', String(Math.max(0.5, Math.min(1, room / need)).toFixed(3)));
            }
          });
        };
        const ro = new ResizeObserver(fit);
        acts.forEach((el) => el.querySelectorAll('.copy').forEach((c) => ro.observe(c)));
        window.addEventListener('resize', fit);
        document.fonts?.ready.then(fit);
        fit();

        // Reloading should not cost you your place. The browser's own
        // restoration is turned off because it fires while the page is still
        // one screen tall, so the position is kept here instead — together
        // with the height it was measured against, which is the only way the
        // number means anything once the acts have grown to full size.
        let placed = false;
        const restore = () => {
          placed = true;
          if (window.location.hash || !root.hasAttribute('data-seen')) return;
          let saved: { y?: number; h?: number } | null = null;
          try {
            saved = JSON.parse(sessionStorage.getItem(PLACE) || 'null');
          } catch {
            saved = null;
          }
          if (saved?.y == null || !saved.h) return;
          const h = document.documentElement.scrollHeight;
          const y = Math.max(0, Math.min(Math.round((saved.y * h) / saved.h), h - window.innerHeight));
          // Store for reapplyRestore(): overflow:hidden is still active here (data-hold),
          // so scrollTo() is a no-op. The Preloader calls reapplyRestore() right after
          // it removes data-hold, which is when the scroll is actually free to move.
          pendingRestore = y;
          window.scrollTo({ top: y, behavior: 'instant' });
          (window as unknown as { __engine?: { snap(): void } }).__engine?.snap();
        };
        let isHardReloading = false;
        let saveFrame = 0;
        const save = () => {
          saveFrame = 0;
          // before the restore has run, the position on screen is not the
          // visit's own — writing it would overwrite the place being restored
          if (!placed || isHardReloading) return;
          try {
            if (sessionStorage.getItem('abyssinian:fresh') === '1') return;
            sessionStorage.setItem(PLACE, JSON.stringify({ y: Math.round(window.scrollY), h: document.documentElement.scrollHeight }));
          } catch {
            /* private windows and blocked storage simply do not keep the place */
          }
        };
        const queueSave = () => {
          if (isHardReloading) return;
          saveFrame ||= requestAnimationFrame(save);
        };
        const saveNow = () => {
          if (!placed || isHardReloading) return;
          try {
            if (sessionStorage.getItem('abyssinian:fresh') === '1') return;
            sessionStorage.setItem(PLACE, JSON.stringify({ y: Math.round(window.scrollY), h: document.documentElement.scrollHeight }));
          } catch {}
        };
        const onHardKey = (e: KeyboardEvent) => {
          const isHard = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r');
          const isF5 = (e.ctrlKey || e.shiftKey) && (e.key === 'F5' || e.keyCode === 116);
          if (isHard || isF5) {
            isHardReloading = true;
            try {
              sessionStorage.removeItem(PLACE);
              sessionStorage.setItem('abyssinian:fresh', '1');
            } catch {}
          }
        };
        window.addEventListener('keydown', onHardKey, true);
        window.addEventListener('scroll', queueSave, { passive: true });
        window.addEventListener('beforeunload', saveNow);
        document.addEventListener('visibilitychange', saveNow);
        // the pins are what give the document its real height, so the place
        // can only be worked out once they have been laid out
        ScrollTrigger.refresh();
        restore();
        // the cover is waiting on this before it lifts
        markPlaced();

        return () => {
          document.removeEventListener('focusin', onFocus);
          window.removeEventListener('resize', fit);
          window.removeEventListener('scroll', queueSave);
          window.removeEventListener('beforeunload', saveNow);
          window.removeEventListener('visibilitychange', saveNow);
          window.removeEventListener('keydown', onHardKey, true);
          cancelAnimationFrame(saveFrame);
          ro.disconnect();
          document.querySelectorAll<HTMLElement>('.copy, .stage__inner').forEach((c) => c.style.removeProperty('--fit'));
        };
    },
    { dependencies: [], revertOnUpdate: true },
  );

  return null;
}

/** Scroll so that an act's local progress is `p` (immersive mode), snapping the engine. */
export function scrollToProgress(actId: string, p: number) {
  const el = document.querySelector<HTMLElement>(`.act[data-act="${actId}"]`);
  if (!el) return;
  window.scrollTo({ top: el.offsetTop + p * el.offsetHeight, behavior: 'instant' });
  (window as unknown as { __engine?: { snap(): void } }).__engine?.snap();
}
