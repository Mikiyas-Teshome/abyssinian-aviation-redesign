'use client';

import { useEffect } from 'react';
import { proof, trust } from '@/content/site';
import { scrollToProgress } from '@/animation/ScrollRig';
import { stage } from '@/animation/stage';
import { useActProgress, useActStep, useImmersive } from '@/animation/useAct';

const ENV_BOUNDS = [0.125, 0.25, 0.375, 0.5];
const TRUST_BOUNDS = [0.2, 0.4];
/** The note takes this much of the act to arrive; the labels wait for it. */
const AFTER_NOTE = 0.07;

/** Training environment: five things to see, each pinned to its building on the campus. */
export function Campus() {
  const step = useActStep('environment', ENV_BOUNDS);
  const immersive = useImmersive();
  // One label at a time, and not until the note has finished arriving: five
  // of them sliding about while the text fades in is just noise.
  const marked = useActProgress('environment') > AFTER_NOTE ? step : -1;
  useEffect(() => stage.refreshAnchors?.(), [immersive]);

  return (
    <>
      <div className="copy copy--bl env">
        <p className="tag tag--cyan" data-in><b>09</b> Training environment</p>
        <h2 className="mid">
          <span className="ln"><span>Where you <i>will learn.</i></span></span>
        </h2>
        <ol className="steps" data-in>
          {proof.map((item, i) => (
            <li key={item.id} data-active={!immersive || i === step}>
              <h3>
                {immersive ? (
                  <button type="button" aria-expanded={i === step} onClick={() => scrollToProgress('environment', i * 0.125 + 0.03)}>
                    <span>{String(i + 1).padStart(2, '0')}</span> {item.title.en}
                  </button>
                ) : (
                  <>
                    <span>{String(i + 1).padStart(2, '0')}</span> {item.title.en}
                  </>
                )}
              </h3>
              <p className="body">{item.body.en}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="marks" aria-hidden="true">
        {proof.map((item, i) => (
          <span
            key={item.id}
            className="mark"
            data-anchor={`env:${item.id}`}
            data-on={i === marked}
            {...(i === marked ? {} : { 'data-anchor-hidden': '' })}
          >
            <b>{String(i + 1).padStart(2, '0')}</b> {item.title.en}
          </span>
        ))}
      </div>
    </>
  );
}

/** Trust: a walk-round of the aircraft, one check at each station. */
export function WalkRound() {
  const step = useActStep('trust', TRUST_BOUNDS);
  const immersive = useImmersive();
  const marked = useActProgress('trust') > AFTER_NOTE ? step : -1;
  useEffect(() => stage.refreshAnchors?.(), [immersive]);

  return (
    <>
      <div className="copy copy--l trust">
        <p className="tag" data-in><b>10</b> Trust</p>
        <h2 className="big">
          <span className="ln"><span>Claims you</span></span>
          <span className="ln"><span><i>can check.</i></span></span>
        </h2>
        <p className="body" data-in>Aviation runs on verification. So does this page.</p>
        <ol className="steps steps--open" data-in>
          {trust.map((item, i) => (
            <li key={item.id} data-active={!immersive || i === step}>
              <h3><span>{String(i + 1).padStart(2, '0')}</span> {item.title.en}</h3>
              <p className="body">{item.body.en}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="marks" aria-hidden="true">
        {trust.map((item, i) => (
          <span
            key={item.id}
            className="mark mark--dot"
            data-anchor={`trust:${i}`}
            data-anchor-origin="center"
            data-on={i === marked}
            {...(i === marked ? {} : { 'data-anchor-hidden': '' })}
          >
            <b>{String(i + 1).padStart(2, '0')}</b>
          </span>
        ))}
      </div>
    </>
  );
}
