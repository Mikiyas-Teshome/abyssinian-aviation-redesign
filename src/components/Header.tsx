'use client';

import { useEffect, useState } from 'react';
import { ACTS } from '@/animation/stage';
import { contactById } from '@/content/site';
import { QualityToggle } from './QualityToggle';

export function Wordmark() {
  return (
    <span className="wordmark">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 21 29 9 19 29l-3-9-13 1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" />
      </svg>
      <span>Abyssinian</span>
    </span>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const phone = contactById('phone-main');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
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

      <div id="menu" className="menu" hidden={!open}>
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
