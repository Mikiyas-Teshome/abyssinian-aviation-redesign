import type {
  Claim,
  ContactDetail,
  Destination,
  Programme,
  ProofItem,
  Service,
  Testimonial,
  Verification,
} from './schema';

const SNAPSHOT = '2026-11-16';

const fromFlightSite = (note?: string): Verification => ({
  source: `abyssinianflights.com public site, research snapshot ${SNAPSHOT}`,
  owner: 'AFS commercial lead (to be named)',
  status: 'needs-client-approval',
  lastVerifiedAt: null,
  note,
});

const fromAcademySite = (note?: string): Verification => ({
  source: `abyssiniaaviationacademy.com public site, research snapshot ${SNAPSHOT}`,
  owner: 'AAA head of training (to be named)',
  status: 'needs-client-approval',
  lastVerifiedAt: null,
  note,
});

export const services: Service[] = [
  {
    id: 'charter',
    index: '01',
    name: { en: 'Charter' },
    kicker: { en: 'Passenger charter' },
    summary: {
      en: 'Fly on your schedule, to the airstrip closest to where you actually need to be. Tell us the route, the date and who is travelling, and we will come back with what is possible.',
    },
    points: [
      { en: 'Itineraries planned around your group, not a timetable' },
      { en: 'Regional and remote destinations on request' },
      { en: 'One point of contact from enquiry to landing' },
    ],
    cta: { en: 'Enquire about a charter' },
    responseNote: { en: 'Charter enquiries are answered during business hours.' },
    verification: fromFlightSite('Service exists on current site. Copy is new and needs approval.'),
  },
  {
    id: 'medevac',
    index: '02',
    name: { en: 'Medical evacuation' },
    kicker: { en: 'Air ambulance' },
    summary: {
      en: 'When a patient needs to move, call us. The form below only requests a callback — the fastest route is always the phone.',
    },
    points: [
      { en: 'Call the 24/7 line for urgent cases' },
      { en: 'Callback form for non-urgent coordination' },
      { en: 'Never send medical records through this website' },
    ],
    cta: { en: 'Request a callback' },
    responseNote: { en: 'For emergencies do not wait for a reply — call.' },
    verification: fromFlightSite('24/7 availability wording must be confirmed by operations before launch.'),
  },
  {
    id: 'cargo',
    index: '03',
    name: { en: 'Cargo' },
    kicker: { en: 'Air freight' },
    summary: {
      en: 'Move what matters to places roads make slow. Share the origin, destination, weight and what you are sending, and we will advise on how it can fly.',
    },
    points: [
      { en: 'Send dimensions and weight for an accurate answer' },
      { en: 'Remote-site deliveries on request' },
      { en: 'Dangerous-goods questions handled by phone' },
    ],
    cta: { en: 'Enquire about cargo' },
    responseNote: { en: 'Cargo enquiries are answered during business hours.' },
    verification: fromFlightSite('Service exists on current site. Copy is new and needs approval.'),
  },
];

const dest = (id: string, name: string, country: string, lat: number, lon: number): Destination => ({
  id,
  name: { en: name },
  country: { en: country },
  lat,
  lon,
  verification: fromFlightSite('Listed as a destination on the current site. Not a schedule or availability claim.'),
});

export const destinations: Destination[] = [
  {
    ...dest('addis-ababa', 'Addis Ababa', 'Ethiopia', 9.03, 38.74),
    hub: true,
    verification: fromFlightSite('Base inferred from the published Bole, Addis Ababa office address.'),
  },
  dest('axum', 'Axum', 'Ethiopia', 14.13, 38.72),
  dest('bahir-dar', 'Bahir Dar', 'Ethiopia', 11.6, 37.39),
  dest('dire-dawa', 'Dire Dawa', 'Ethiopia', 9.6, 41.87),
  dest('djibouti', 'Djibouti', 'Djibouti', 11.59, 43.15),
  dest('gondar', 'Gondar', 'Ethiopia', 12.6, 37.47),
  dest('jinka', 'Jinka', 'Ethiopia', 5.78, 36.57),
  dest('juba', 'Juba', 'South Sudan', 4.85, 31.58),
  dest('lalibela', 'Lalibela', 'Ethiopia', 12.03, 39.04),
  dest('nairobi', 'Nairobi', 'Kenya', -1.29, 36.82),
];

const prog = (
  id: Programme['id'],
  code: string,
  name: string,
  summary: string,
  focus: string[],
): Programme => ({
  id,
  code,
  name: { en: name },
  summary: { en: summary },
  focus: focus.map((en) => ({ en })),
  duration: null,
  entryRequirements: null,
  nextIntake: null,
  verification: fromAcademySite(
    'Programme is listed on the current site. Duration, entry requirements, intake dates and fees are not approved and are deliberately empty.',
  ),
});

/** Order follows the brief (PPL → CPL → IR → ME → CFI/FI) and is not yet client-approved. */
export const programmes: Programme[] = [
  prog(
    'ppl',
    'PPL',
    'Private Pilot Licence',
    'The first licence: learn to fly a single-engine aircraft and act as pilot in command for non-commercial flying.',
    ['Ground school', 'Single-engine flight training', 'Navigation and solo flying'],
  ),
  prog(
    'cpl',
    'CPL',
    'Commercial Pilot Licence',
    'The professional licence: the standard of flying and knowledge required to be paid to fly.',
    ['Advanced flight training', 'Commercial procedures', 'Night flying'],
  ),
  prog(
    'ir',
    'IR',
    'Instrument Rating',
    'Fly by reference to instruments alone, in cloud and low visibility, under instrument flight rules.',
    ['Instrument flight training', 'Simulator sessions', 'Procedures and approaches'],
  ),
  prog(
    'me',
    'ME',
    'Multi-Engine Rating',
    'Step up to aircraft with more than one engine, including asymmetric handling and systems management.',
    ['Multi-engine handling', 'Engine-out procedures', 'Systems and performance'],
  ),
  prog(
    'fi',
    'CFI / FI',
    'Flight Instructor Rating',
    'Learn to teach: the rating that lets a qualified pilot train the next generation.',
    ['Instructional technique', 'Briefing and debriefing', 'Supervised teaching practice'],
  ),
];

export const proof: ProofItem[] = [
  {
    id: 'aircraft',
    title: { en: 'Training aircraft' },
    body: { en: 'Single- and multi-engine flying is part of the programme list. Ask admissions which aircraft you would train on.' },
    verification: fromAcademySite('Fleet types and numbers not approved — none stated.'),
  },
  {
    id: 'simulator',
    title: { en: 'Simulator' },
    body: { en: 'Simulator instruction is one of the academy’s published training modes, used alongside flight and ground training.' },
    verification: fromAcademySite('Device type/qualification level not approved — none stated.'),
  },
  {
    id: 'instructors',
    title: { en: 'Instructors' },
    body: { en: 'Meet the people who would teach you before you commit. Request an introduction when you enquire.' },
    verification: fromAcademySite('No instructor names, counts or hours published until supplied.'),
  },
  {
    id: 'campus',
    title: { en: 'Ground school' },
    body: { en: 'Classroom ground school underpins every licence and rating. Visits can be arranged through admissions.' },
    verification: fromAcademySite('Campus address and facilities list pending.'),
  },
  {
    id: 'community',
    title: { en: 'Student community' },
    body: { en: 'Training is done alongside a cohort. We will only publish student stories that students have agreed to share.' },
    verification: fromAcademySite('Awaiting consented, genuine student stories and photography.'),
  },
];

/** Claims seen on the current sites. Only `approved` items may render publicly. */
export const claims: Claim[] = [
  {
    id: 'first-private-academy',
    statement: 'The First Private Aviation Academy in Ethiopia',
    verification: {
      source: `abyssiniaaviationacademy.com positioning line, ${SNAPSHOT}`,
      owner: 'AAA managing director (to be named)',
      status: 'unverified-claim',
      lastVerifiedAt: null,
      note: 'Requires evidence and approved wording before publication. Not rendered.',
    },
  },
  {
    id: 'since-1999',
    statement: 'Since 1999 (logo lock-up) / 25th-year anniversary graduation banner',
    verification: {
      source: `Logo and pop-up banner in supplied screenshots, ${SNAPSHOT}`,
      owner: 'AFS/AAA managing director (to be named)',
      status: 'unverified-claim',
      lastVerifiedAt: null,
      note: 'Founding year not confirmed. Not rendered.',
    },
  },
  {
    id: 'academy-stat-band',
    statement: 'Numeric statistics band on the academy home page',
    verification: {
      source: `Academy home page screenshot, ${SNAPSHOT}`,
      owner: 'AAA head of training (to be named)',
      status: 'unverified-claim',
      lastVerifiedAt: null,
      note: 'Figures have no stated source. Not migrated.',
    },
  },
  {
    id: 'gerd-guba-charter',
    statement: 'GERD / Guba charter content',
    verification: fromFlightSite('Present on current site; route status unknown. Not rendered as a destination.'),
  },
  {
    id: 'aerial-survey',
    statement: 'Aerial survey & photography service',
    verification: fromFlightSite('Present in current navigation but outside the brief’s three mission chapters. Awaiting decision.'),
  },
];

/** The academy site's current testimonials are placeholders. They are flagged, never displayed. */
export const testimonials: Testimonial[] = [
  {
    id: 'academy-placeholder-testimonials',
    quote: '[placeholder testimonials on current academy site — text intentionally not migrated]',
    attribution: 'n/a',
    verification: {
      source: `abyssiniaaviationacademy.com, ${SNAPSHOT}`,
      owner: 'AAA marketing (to be named)',
      status: 'rejected',
      lastVerifiedAt: null,
      note: 'Flagged for removal. Replace only with genuine, consented testimonials.',
    },
  },
];

export const contact: ContactDetail[] = [
  {
    id: 'phone-main',
    label: 'Office',
    value: '+251 116 62 0622 / 23',
    href: 'tel:+251116620622',
    verification: fromFlightSite(),
  },
  {
    id: 'phone-247',
    label: '24/7 line',
    value: '0911 456 684 / 85',
    href: 'tel:+251911456684',
    verification: fromFlightSite('Shown as “[For 24/7 Call]” in the current footer.'),
  },
  {
    id: 'email-bookings',
    label: 'Bookings',
    value: 'bookings@abyssinianflights.com',
    href: 'mailto:bookings@abyssinianflights.com',
    verification: fromFlightSite(),
  },
  {
    id: 'email-info',
    label: 'General',
    value: 'info@abyssinianflights.com',
    href: 'mailto:info@abyssinianflights.com',
    verification: fromFlightSite(),
  },
  {
    id: 'address',
    label: 'Address',
    value: 'Bole, in front of Yougo City Church, Addis Ababa',
    verification: fromFlightSite('Transcribed from current footer (“infront of Yougo city church … 7716”). Confirm exact wording and P.O. box.'),
  },
  {
    id: 'hours',
    label: 'Business hours',
    value: 'Monday – Friday, 8:00 AM – 5:00 PM',
    verification: fromFlightSite(),
  },
];

export const contactById = (id: string) => contact.find((c) => c.id === id)!;

export const hub = destinations.find((d) => d.hub)!;

/** Great-circle distance in km — geometry, not a flight-time or availability claim. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
}

/** Trust layer. Deliberately contains no numbers, badges or endorsements until approved ones exist. */
export const trust: ProofItem[] = [
  {
    id: 'approvals',
    title: { en: 'Approvals, on paper' },
    body: { en: 'Ask to see our current operating approvals and training authorisations. We would rather show you the documents than a badge.' },
    verification: {
      source: 'New copy written for this build',
      owner: 'AFS/AAA accountable manager (to be named)',
      status: 'needs-client-approval',
      lastVerifiedAt: null,
      note: 'Replace with named regulator approvals and certificate references once supplied.',
    },
  },
  {
    id: 'facts',
    title: { en: 'Facts with dates' },
    body: { en: 'Fleet, route and programme details are confirmed directly with you when you enquire, so what you are told is current.' },
    verification: {
      source: 'New copy written for this build',
      owner: 'AFS commercial lead (to be named)',
      status: 'needs-client-approval',
      lastVerifiedAt: null,
      note: 'Becomes a verified facts band (with “last verified” dates) when the CMS is populated.',
    },
  },
  {
    id: 'voices',
    title: { en: 'Real voices only' },
    body: { en: 'Client and student stories appear here only when the people in them have agreed to share them.' },
    verification: {
      source: 'New copy written for this build',
      owner: 'AAA marketing (to be named)',
      status: 'needs-client-approval',
      lastVerifiedAt: null,
      note: 'Placeholder testimonials on the current academy site are rejected, not migrated.',
    },
  },
];
