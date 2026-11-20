'use client';

import { useEffect, useState } from 'react';
import { ACTS } from '@/animation/stage';
import { contactById } from '@/content/site';
import { QualityToggle } from './QualityToggle';

export function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="-5 -5 81 93" aria-hidden="true">
        <path
          fill="#b92531"
          d="M67.37,71.05c-8.61-10.99-16.1-22.81-24.41-34.03L1.71,34.77l-1.71-.27c5.48-.46,10.95-1.05,16.43-1.5,9.11-.75,18.26-1.18,27.34-2.12,8.23-10.33,16.32-20.78,24.82-30.88l-20.56,34.18c6.68,12.16,13.51,24.27,19.33,36.87Z"
        />
        <path fill="#b92531" d="M34.88,53.42l-1.32-.93-6.79,7.48-23.22,6.71,22.63-2.25,7.57,18.7-3.74-21.14,4.87-8.57Z" />
        <g fill="#efd050">
          <path d="M27.13,31.53c1.64-9.07,9.58-15.97,19.11-15.97,2.75,0,5.37.58,7.75,1.62l1.17-1.43c-2.72-1.27-5.73-1.99-8.92-1.99-10.59,0-19.37,7.8-20.96,17.94l1.85-.17Z" />
          <path d="M65.68,35c0,6.29-3.01,11.87-7.66,15.43l.85,1.61c5.21-3.87,8.61-10.06,8.61-17.03s-3.54-13.42-8.93-17.28l-.94,1.54c4.88,3.54,8.07,9.26,8.07,15.74Z" />
          <path d="M52.91,53.24c-2.08.77-4.32,1.2-6.67,1.2-10.12,0-18.45-7.78-19.35-17.67l-1.81-.12c.84,10.95,10,19.6,21.16,19.6,2.75,0,5.38-.54,7.79-1.5l-1.12-1.5Z" />
        </g>
      </svg>
      <span>Abyssinian</span>
    </span>
  );
}

function snapToAnchor(hash: string) {
  const id = hash.replace(/^#/, '');
  const target = id === 'top' ? document.body : document.getElementById(id);
  if (!target) return;
  const top = target === document.body ? 0 : target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: 'instant' });
  (window as unknown as { __engine?: { snap(): void } }).__engine?.snap();
  if (target instanceof HTMLElement && id !== 'top') {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

export function Header() {
  const [open, setOpen] = useState(false);
  const phone = contactById('phone-main');

  // Intercept every in-page hash link so navigation jumps instantly and updates history.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a || !a.hash) return;
      e.preventDefault();
      setOpen(false);
      if (window.location.hash !== a.hash) {
        history.pushState(null, '', a.hash);
      }
      snapToAnchor(a.hash);
    };
    const onPopState = () => {
      if (window.location.hash) {
        snapToAnchor(window.location.hash);
      }
    };
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        const header = document.querySelector('.bar');
        if (!header) return;
        const focusable = header.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('menu-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('menu-open');
    };
  }, [open]);

  return (
    <header className="bar" data-open={open}>
      <a href="#top" className="bar__brand" aria-label="Abyssinian — back to the start" onClick={() => setOpen(false)}>
        <Wordmark />
      </a>
      <nav className="switch" aria-label="Choose a journey">
        <a href="#charter" data-journey="fly">Fly</a>
        <span aria-hidden="true">/</span>
        <a href="#academy" data-journey="train">Train</a>
      </nav>
      <a className="bar__call" href={phone.href}>{phone.value}</a>
      <a className="btn btn--gold btn--small bar__cta" href="#enquire" data-enquiry="general" onClick={() => setOpen(false)}>
        Enquire
      </a>
      <button type="button" className="bar__menu" aria-expanded={open} aria-controls="menu" onClick={() => setOpen((o) => !o)}>
        <span>{open ? 'Close' : 'Menu'}</span>
      </button>

      <div id="menu" className="menu" role="dialog" aria-modal="true" aria-label="Navigation menu" hidden={!open}>
        <nav aria-label="Chapters">
          <ol>
            {ACTS.map((a, i) => (
              <li key={a.id}>
                <a href={`#${a.anchor}`} onClick={() => setOpen(false)}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {a.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="menu__foot">
          <a href={phone.href}>Call {phone.value}</a>
          <QualityToggle />
        </div>
      </div>
    </header>
  );
}

/** Bottom strip: where you are on the route, and a tick for every chapter. */
export function Hud() {
  return (
    <div className="hud">
      <p className="hud__where" aria-hidden="true">
        <span data-hud-index>01</span>
        <span className="hud__of">/ {ACTS.length}</span>
        <span data-hud-label>{ACTS[0].label}</span>
      </p>
      <nav className="rail" aria-label="Flight plan">
        <ol>
          {ACTS.map((a) => (
            <li key={a.id}>
              <a href={`#${a.anchor}`} data-rail={a.id}>
                <span>{a.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
