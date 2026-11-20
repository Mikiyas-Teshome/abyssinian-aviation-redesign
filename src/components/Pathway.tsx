'use client';

import { programmes } from '@/content/site';
import { scrollToProgress } from '@/animation/ScrollRig';
import { useActStep, useImmersive } from '@/animation/useAct';

const PENDING = 'Confirmed by admissions when you enquire';
/** Scroll progress at which each next programme's board is reached (see the camera route). */
const BOUNDS = [0.14, 0.305, 0.47, 0.635];
const STOPS = [0.02, 0.185, 0.35, 0.515, 0.68];

/**
 * The training pathway. In the world, each programme is a board along the
 * runway edge; scrolling walks the camera from one to the next, and the
 * matching programme is shown here. In the flat document all five are listed.
 */
export function Pathway() {
  const step = useActStep('pathway', BOUNDS);
  const immersive = useImmersive();

  return (
    <div className="copy copy--r path">
      <p className="tag tag--cyan" data-in><b>08</b> Training pathway</p>
      <h2 className="mid">
        <span className="ln"><span>Five stages, <i>one direction.</i></span></span>
      </h2>
      <p className="fine" data-in>
        A common order to train in. Your own route depends on your goals and experience — admissions will advise.
      </p>

      {immersive && (
        <ol className="path__steps" data-in aria-label="Programmes">
          {programmes.map((p, i) => (
            <li key={p.id}>
              <button type="button" aria-current={i === step ? 'step' : undefined} data-done={i < step} onClick={() => scrollToProgress('pathway', STOPS[i])}>
                <span className="sr-only">Stage {i + 1}: </span>
                {p.code}
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="path__panels" data-in>
        {programmes.map((p, i) => (
          <article key={p.id} className="path__panel" data-active={!immersive || i === step} aria-hidden={immersive && i !== step ? true : undefined}>
            <p className="path__count">Stage {i + 1} of {programmes.length} · {p.code}</p>
            <h3>{p.name.en}</h3>
            <p className="body">{p.summary.en}</p>
            <ul className="inline">
              {p.focus.map((f) => (
                <li key={f.en}>{f.en}</li>
              ))}
            </ul>
            <dl className="facts">
              <div><dt>Duration</dt><dd>{p.duration?.en ?? PENDING}</dd></div>
              <div><dt>Entry requirements</dt><dd>{p.entryRequirements?.en ?? PENDING}</dd></div>
              <div><dt>Next intake</dt><dd>{p.nextIntake?.en ?? PENDING}</dd></div>
            </dl>
            <a className="btn btn--gold" href="#apply" data-enquiry="academy" data-programme={p.id} tabIndex={immersive && i !== step ? -1 : undefined}>
              Enquire about {p.code}
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
