'use client';

import { useEffect, useRef, useState } from 'react';
import type { EnquiryKind } from '@/lib/enquiry-schema';
import { contactById } from '@/content/site';
import { EnquiryForm } from './EnquiryForm';

const FLIGHT_TABS: [EnquiryKind, string][] = [
  ['charter', 'Charter'],
  ['medevac', 'Medical evacuation'],
  ['cargo', 'Cargo'],
  ['general', 'General'],
];

/** The conversion finale: two distinct flows, flight enquiry and academy application. */
export function EnquiryPanel() {
  const [flightKind, setFlightKind] = useState<EnquiryKind>('charter');
  const [prefill, setPrefill] = useState<{ kind: EnquiryKind; values: Record<string, string> } | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const emergency = contactById('phone-247');

  // Any CTA on the page can open the right form with context: <a href="#enquire" data-enquiry="cargo">.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-enquiry]');
      if (!el) return;
      const kind = el.dataset.enquiry as EnquiryKind;
      if (kind !== 'academy') setFlightKind(kind);
      const values: Record<string, string> = {};
      if (el.dataset.destination) values.to = el.dataset.destination;
      if (el.dataset.programme) values.programme = el.dataset.programme;
      setPrefill(Object.keys(values).length ? { kind, values } : null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const i = FLIGHT_TABS.findIndex(([k]) => k === flightKind);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % FLIGHT_TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + FLIGHT_TABS.length) % FLIGHT_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = FLIGHT_TABS.length - 1;
    else return;
    e.preventDefault();
    setFlightKind(FLIGHT_TABS[next][0]);
    tabs.current[next]?.focus();
  };

  return (
    <div className="enq" data-in>
      <section aria-labelledby="enquire-fly" className="enq__col">
        <p className="tag tag--gold"><b>A</b> Fly</p>
        <h3 id="enquire-fly">Flight enquiry</h3>
        <div role="tablist" aria-label="Type of flight enquiry" className="tabs" onKeyDown={onKey}>
          {FLIGHT_TABS.map(([kind, label], i) => (
            <button
              key={kind}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`enq-tab-${kind}`}
              aria-selected={flightKind === kind}
              aria-controls="enq-panel"
              tabIndex={flightKind === kind ? 0 : -1}
              data-kind={kind}
              onClick={() => setFlightKind(kind)}
            >
              {label}
            </button>
          ))}
        </div>
        <div id="enq-panel" role="tabpanel" aria-labelledby={`enq-tab-${flightKind}`}>
          {flightKind === 'medevac' && (
            <p className="callout callout--red">
              <strong>Emergency?</strong> Call the 24/7 line now: <a href={emergency.href}>{emergency.value}</a>. This form
              requests a callback only. Do not send medical records or diagnoses here.
            </p>
          )}
          <EnquiryForm key={flightKind} kind={flightKind} prefill={prefill?.kind === flightKind ? prefill.values : undefined} />
        </div>
      </section>

      <section id="apply" aria-labelledby="enquire-train" className="enq__col">
        <p className="tag tag--cyan"><b>B</b> Train</p>
        <h3 id="enquire-train">Academy application enquiry</h3>
        <p className="fine">
          Tell admissions which programme interests you. They will confirm entry requirements, intake dates and fees and
          explain how to apply.
        </p>
        <EnquiryForm kind="academy" prefill={prefill?.kind === 'academy' ? prefill.values : undefined} />
      </section>
    </div>
  );
}
