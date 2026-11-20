'use client';

import { useEffect, useMemo, useState } from 'react';
import { destinations, distanceKm, hub } from '@/content/site';
import { stage } from '@/animation/stage';

const routes = destinations
  .filter((d) => !d.hub)
  .map((d) => ({ ...d, km: distanceKm(hub, d) }))
  .sort((a, b) => a.name.en.localeCompare(b.name.en));

/**
 * The destination list is the interface; the chart in the world is its
 * picture. On wide screens each pin on the chart is also a pointer target,
 * placed on the real 3D position of that pin.
 */
export function Destinations() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => routes.filter((r) => !q || r.name.en.toLowerCase().includes(q) || r.country.en.toLowerCase().includes(q)),
    [q],
  );
  const active = routes.find((r) => r.id === selected) ?? null;

  useEffect(() => {
    stage.selectedDestination = hover ?? selected;
  }, [hover, selected]);
  useEffect(() => {
    stage.refreshAnchors?.();
    return () => {
      stage.selectedDestination = null;
    };
  }, []);

  const toggle = (id: string) => setSelected((s) => (s === id ? null : id));

  return (
    <>
      <div className="copy copy--l dest">
        <p className="tag" data-in><b>06</b> Destinations</p>
        <h2 className="mid">
          <span className="ln"><span>From Addis Ababa,</span></span>
          <span className="ln"><span><i>outward.</i></span></span>
        </h2>
        <p className="body dest__intro" data-in>
          Places we list today. Charter flights are arranged on request, so ask about anywhere that is not here.
        </p>
        <label className="search" data-in>
          <span className="sr-only">Search destinations</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search city or country" autoComplete="off" />
        </label>
        <p className="sr-only" role="status">
          {matches.length} of {routes.length} destinations shown
        </p>
        <ul className="dest__list" data-in>
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={selected === r.id}
                onClick={() => toggle(r.id)}
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.id)}
                onBlur={() => setHover(null)}
              >
                <span className="dest__name">{r.name.en}</span>
                <span className="dest__km">{r.km.toLocaleString('en')} km</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="dest__empty">
              Nothing listed matches “{query}”. <a href="#enquire" data-enquiry="charter">Ask us about it</a>.
            </li>
          )}
        </ul>
        <div className="dest__detail" aria-live="polite" data-in>
          {active ? (
            <>
              <p>
                <strong>{hub.name.en} → {active.name.en}</strong>, {active.country.en}. About {active.km.toLocaleString('en')} km in a
                straight line. Routing and timings are confirmed when you enquire.
              </p>
              <a className="btn btn--gold btn--small" href="#enquire" data-enquiry="charter" data-destination={active.name.en}>
                Enquire about {active.name.en}
              </a>
            </>
          ) : (
            <p className="fine">Distances are straight-line from {hub.name.en}. This chart is not a timetable.</p>
          )}
        </div>
      </div>

      {/* pointer targets on the chart's pins; the list above is the keyboard route */}
      <div className="pins" aria-hidden="true">
        {routes.map((r) => (
          <div
            key={r.id}
            role="presentation"
            className="pin"
            data-anchor={`dest:${r.id}`}
            data-anchor-origin="center"
            data-on={selected === r.id || hover === r.id}
            onClick={() => toggle(r.id)}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span>{r.km.toLocaleString('en')} km</span>
          </div>
        ))}
      </div>
    </>
  );
}
