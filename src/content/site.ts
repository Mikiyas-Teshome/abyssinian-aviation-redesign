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
/** Second pass: the operator's own site read directly, page by page. */
const SCRAPE = '2026-11-19';
const fromOperator = (page: string, owner: string, note?: string): Verification => ({
  source: `abyssinianflights.com \u2014 ${page}, read ${SCRAPE}`,
  owner,
  status: 'needs-client-approval',
  lastVerifiedAt: null,
  note,
});
/** A superlative or a figure the operator reports about itself is not evidence. */
const selfReported = (page: string, owner: string, note: string): Verification => ({
  ...fromOperator(page, owner, note),
  status: 'unverified-claim',
});
const AFS_LEAD = 'AFS commercial lead (to be named)';
const AFS_AM = 'AFS/AAA accountable manager (to be named)';

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
    body: {
      en: 'The operator flies the Cessna Grand Caravan on its charter, cargo and air-ambulance work. Single- and multi-engine flying is part of the programme list \u2014 ask admissions which aircraft you would train on.',
    },
    verification: fromOperator(
      'Air Ambulance (page 2310) and Flight Hub (page 2190)',
      AFS_LEAD,
      'Grand Caravan named by the operator. Fleet count, registrations and which types are used for training are not published and are not stated here.',
    ),
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
    statement: 'In 2007 AFS launched Abyssinian Pilot Training School, Ethiopia\u2019s first private pilot training school, later an Approved Training Organization and full Aviation Academy',
    verification: selfReported(
      'Flight Hub / About (page 2190)',
      'AAA managing director (to be named)',
      'The operator\u2019s own wording, with a date and the original school name \u2014 more specific than the bare first private aviation academy line. Still a self-reported first: needs evidence and approved wording before publication.',
    ),
  },
  {
    id: 'since-1999',
    statement: 'Established in 1999; 25 years marked on 17 November 2024',
    verification: fromOperator(
      'Flight Hub / About (page 2190) and the 25-year anniversary post (11 Dec 2024)',
      AFS_AM,
      'Two places on the operator\u2019s own site agree, and the anniversary date is consistent with 1999. Publishable once the client confirms the founding date.',
    ),
  },
  {
    id: 'air-operator-certificate',
    statement: 'Private air charter operator holding an Air Operator Certificate from the Ethiopian Civil Aviation Authority, for international and domestic non-scheduled commercial air transport',
    verification: fromOperator('Flight Hub / About (page 2190)', AFS_AM, 'Rendered in the trust chapter. Certificate number and validity still needed.'),
  },
  {
    id: 'ato-status',
    statement: 'Approved Training Organization (ATO) status for the Aviation Academy',
    verification: fromOperator('Flight Hub / About (page 2190)', 'AAA head of training (to be named)', 'Rendered in the trust chapter. Approval reference and scope still needed.'),
  },
  {
    id: 'over-50-destinations',
    statement: 'Explore over 50 destinations with Abyssinian Flight Services',
    verification: selfReported(
      'Destinations (page 2010)',
      AFS_LEAD,
      'The site names nine destinations but claims over fifty. Not rendered: the destination chapter shows only the nine that are named.',
    ),
  },
  {
    id: 'gerd-guba-charter',
    statement: 'Specialised charter flights to Guba for the GERD from 25 September 2025: about 1h45\u20132h each way and a five-hour guided tour; five flights flown at the time of writing',
    verification: fromOperator(
      'GERD tours post (20 Nov 2025)',
      AFS_LEAD,
      'Dated and specific. A candidate for a destination or news entry once the client confirms it still runs and the flight count is current.',
    ),
  },
  {
    id: 'aerial-survey',
    statement: 'Aerial Survey & Photography \u2014 a fourth published service, for identifying minerals, vegetation and wildlife for investors and agriculture',
    verification: fromOperator(
      'Aerial Survey & Photography (page 2324)',
      AFS_LEAD,
      'A full service page on the operator\u2019s site that this build does not yet cover. Awaiting a decision on whether it becomes a fourth mission chapter.',
    ),
  },
  {
    id: 'recognitions',
    statement: 'Certificates of recognition from the Ethiopian Public Health Institute (2025\u201326 Marburg response) and the Addis Ababa No. 2 Medium Taxpayers Branch Office (2024/25 tax compliance)',
    verification: fromOperator('News posts (16 Feb 2026)', AFS_AM, 'Third-party recognitions with dates. Not rendered: awaiting a decision on a news or recognition section.'),
  },
  {
    id: 'motto-and-vision',
    statement: 'Motto Integrity Is Our Hallmark; vision to be a competitive general aviation service provider in East Africa by 2030',
    verification: fromOperator('Tax compliance post and Five-Year Strategic Plan post (2026)', AFS_AM, 'Not rendered. Useful if the client wants their own words in the trust chapter.'),
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
    label: 'Office',
    value: 'Cameron Street, Bole, Addis Ababa 7716',
    verification: fromOperator('Contact Us (page 2229) \u2014 Business Physical Address', AFS_LEAD, 'The site gives a separate billing address: Bole, in front of Yougo City Church, Addis Ababa 7716.'),
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
    body: {
      en: 'We hold an Air Operator Certificate from the Ethiopian Civil Aviation Authority, and the academy is an Approved Training Organization. Ask to see the certificates \u2014 we would rather show you the documents than a badge.',
    },
    verification: fromOperator(
      'Flight Hub / About (page 2190)',
      AFS_AM,
      'Operator states both approvals on its own site. Certificate numbers, holder name and validity dates still to be supplied before launch.',
    ),
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
