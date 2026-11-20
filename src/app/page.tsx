import { ScrollRig } from '@/animation/ScrollRig';
import { ACTS } from '@/animation/stage';
import { Campus, WalkRound } from '@/components/Campus';
import { Destinations } from '@/components/Destinations';
import { EnquiryPanel } from '@/components/EnquiryPanel';
import { Header, Hud, Wordmark } from '@/components/Header';
import { Pathway } from '@/components/Pathway';
import { Preloader } from '@/components/Preloader';
import { QualityToggle } from '@/components/QualityToggle';
import { contact, contactById, destinations, programmes, services } from '@/content/site';
import { Experience } from '@/experience/Experience';

const len = (id: string) => ({ '--len': ACTS.find((a) => a.id === id)!.len }) as React.CSSProperties;

export default function Home() {
  const emergency = contactById('phone-247');
  const office = contactById('phone-main');

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Preloader />
      <Experience />
      <ScrollRig />
      <Header />
      <Hud />

      <main id="main">
        {/* 01 — the hangar at dawn */}
        <section id="top" className="act act--hero" data-act="hero" style={len('hero')} aria-labelledby="hero-title">
          <div className="stage">
            <div className="stage__inner">
              <div className="copy copy--bl hero">
                <p className="tag hero__tag">Abyssinian Flight Services <span aria-hidden="true">×</span> Aviation Academy</p>
                <h1 id="hero-title" className="mega">
                  <span className="ln"><span>One sky.</span></span>
                  <span className="ln"><span>Two <i>journeys.</i></span></span>
                </h1>
                <div className="hero__foot">
                  <p className="body">
                    Charter, medical evacuation and cargo flights across Ethiopia and the region — and the academy that
                    trains the pilots who fly them.
                  </p>
                  <div className="actions">
                    <a className="btn btn--gold" href="#enquire" data-enquiry="general">Book a flight</a>
                    <a className="btn btn--line" href="#academy">Explore pilot training</a>
                  </div>
                </div>
              </div>
              <a className="cue" href="#journeys">Scroll to roll out</a>
            </div>
          </div>
        </section>

        {/* 02 — out front, between the two taxi signs */}
        <section id="journeys" className="act act--journeys" data-act="journeys" style={len('journeys')} aria-labelledby="journeys-title">
          <div className="stage">
            <div className="stage__inner">
              <h2 id="journeys-title" className="tag journeys__title" data-in><b>02</b> Choose your journey</h2>
              <div className="way way--fly" data-anchor="sign:fly">
                <p className="tag tag--gold" data-in>Abyssinian Flight Services</p>
                <h3 className="mid"><span className="ln"><span>Fly <i>with us</i></span></span></h3>
                <p className="body" data-in>Private charter, air ambulance and cargo, arranged around where you need to be.</p>
                <a className="btn btn--gold" href="#charter" data-in>Flight services</a>
              </div>
              <div className="way way--train" data-anchor="sign:train">
                <p className="tag tag--cyan" data-in>Abyssinian Aviation Academy</p>
                <h3 className="mid"><span className="ln"><span>Become <i>a pilot</i></span></span></h3>
                <p className="body" data-in>Ground school, simulator and flight training, from first licence to instructor rating.</p>
                <a className="btn btn--line" href="#academy" data-in>Pilot training</a>
              </div>
            </div>
          </div>
        </section>

        {/* 03–05 — three missions */}
        {services.map((s, i) => (
          <section key={s.id} id={s.id} className={`act act--${s.id}`} data-act={s.id} style={len(s.id)} aria-labelledby={`${s.id}-title`}>
            <div className="stage">
              <div className="stage__inner">
                <div className={`copy ${s.id === 'medevac' ? 'copy--r' : 'copy--l'} mission`}>
                  <p className={`tag ${s.id === 'medevac' ? 'tag--red' : 'tag--gold'}`} data-in>
                    <b>{String(i + 3).padStart(2, '0')}</b> Flight Services — {s.kicker.en}
                  </p>
                  <h2 id={`${s.id}-title`} className="giant">
                    {s.id === 'medevac' ? (
                      <>
                        <span className="ln"><span>Medical</span></span>
                        <span className="ln"><span><i>evacuation.</i></span></span>
                      </>
                    ) : (
                      <span className="ln"><span>{s.name.en}<i>.</i></span></span>
                    )}
                  </h2>
                  <p className="lede" data-in>{s.summary.en}</p>
                  <ul className="pts" data-in>
                    {s.points.map((p) => (
                      <li key={p.en}>{p.en}</li>
                    ))}
                  </ul>
                  <div className="actions" data-in>
                    {s.id === 'medevac' && <a className="btn btn--red" href={emergency.href}>Call 24/7 · {emergency.value}</a>}
                    <a className={`btn ${s.id === 'medevac' ? 'btn--line' : 'btn--gold'}`} href="#enquire" data-enquiry={s.id}>{s.cta.en}</a>
                  </div>
                  <p className="fine" data-in>{s.responseNote.en}</p>
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* 06 — the chart */}
        <section id="destinations" className="act act--destinations" data-act="destinations" style={len('destinations')} aria-label="Destinations">
          <div className="stage">
            <div className="stage__inner">
              <Destinations />
            </div>
          </div>
        </section>

        {/* 07 — home again, from the academy side */}
        <section id="academy" className="act act--academy" data-act="academy" style={len('academy')} aria-labelledby="academy-title">
          <div className="stage">
            <div className="stage__inner">
              <div className="copy copy--bl mission">
                <p className="tag tag--cyan" data-in><b>07</b> Abyssinian Aviation Academy</p>
                <h2 id="academy-title" className="giant giant--long">
                  <span className="ln"><span>From ground school</span></span>
                  <span className="ln"><span>to <i>the cockpit.</i></span></span>
                </h2>
                <p className="lede" data-in>
                  Learn in the classroom, practise in the simulator, then fly. {programmes.length} programmes take you from
                  your first licence to teaching others.
                </p>
                <div className="actions" data-in>
                  <a className="btn btn--gold" href="#pathway">See the training pathway</a>
                  <a className="btn btn--line" href="#apply" data-enquiry="academy">Start an application enquiry</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pathway" className="act act--pathway" data-act="pathway" style={len('pathway')} aria-label="Training pathway">
          <div className="stage">
            <div className="stage__inner">
              <Pathway />
            </div>
          </div>
        </section>

        <section id="training-environment" className="act act--environment" data-act="environment" style={len('environment')} aria-label="Training environment">
          <div className="stage">
            <div className="stage__inner">
              <Campus />
            </div>
          </div>
        </section>

        <section id="trust" className="act act--trust" data-act="trust" style={len('trust')} aria-label="Trust">
          <div className="stage">
            <div className="stage__inner">
              <WalkRound />
            </div>
          </div>
        </section>

        {/* 11 — sunset departure, and the forms */}
        <section id="enquire" className="act act--enquire" data-act="enquire" aria-labelledby="enquire-title">
          <div className="stage">
            <div className="stage__inner">
              <header className="enquire__head">
                <p className="tag" data-in><b>{ACTS.length}</b> Choose your next journey</p>
                <h2 id="enquire-title" className="giant">
                  <span className="ln"><span>Ready when</span></span>
                  <span className="ln"><span><i>you are.</i></span></span>
                </h2>
                <div className="enquire__call" data-in>
                  <p className="lede">Prefer to talk?</p>
                  <a className="btn btn--line" href={office.href}>Call {office.value}</a>
                </div>
              </header>
              <EnquiryPanel />
              <noscript>
                <p className="callout">The enquiry forms need JavaScript. Please call {office.value} or email bookings@abyssinianflights.com.</p>
              </noscript>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <p className="foot__mark" aria-hidden="true">Abyssinian</p>
        <div className="foot__grid">
          <div>
            <Wordmark />
            <p className="fine">Abyssinian Flight Services and Abyssinian Aviation Academy. {destinations.length - 1} listed destinations.</p>
            <QualityToggle />
          </div>
          <nav aria-label="Footer">
            <h2>Explore</h2>
            <ul>
              <li><a href="#charter">Flight services</a></li>
              <li><a href="#destinations">Destinations</a></li>
              <li><a href="#academy">Aviation academy</a></li>
              <li><a href="#pathway">Training pathway</a></li>
              <li><a href="#enquire">Enquire</a></li>
              <li><a href="/privacy">Privacy notice</a></li>
            </ul>
          </nav>
          <div>
            <h2>Contact</h2>
            <dl>
              {contact.map((c) => (
                <div key={c.id}>
                  <dt>{c.label}</dt>
                  <dd>{c.href ? <a href={c.href}>{c.value}</a> : c.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="foot__legal">
          <p>
            <strong>In a medical emergency</strong>, contact local emergency services first. This website is not monitored in
            real time; for urgent air ambulance requests, call {emergency.value}.
          </p>
          <p>© {new Date().getFullYear()} Abyssinian Flight Services. Destinations shown are not a timetable or a guarantee of availability.</p>
        </div>
      </footer>
    </>
  );
}
