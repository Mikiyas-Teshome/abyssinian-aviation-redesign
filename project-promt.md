# Project Prompt — Abyssinian Cinematic Aviation Experience

## Role

Act as a senior multidisciplinary product team: creative director, aviation UX strategist, 3D technical director, motion designer, accessibility specialist, full-stack engineer, performance engineer, content strategist, and QA lead.

## Mission

Design and implement a production-ready, cinematic 3D landing experience for **Abyssinian Flight Services** and **Abyssinian Aviation Academy**. Create one coherent brand universe with two unmistakable user journeys: **book/enquire about aviation services** and **explore/apply for pilot training**.

The experience should be memorable enough for design-award consideration, but business clarity, truth, speed, accessibility, and reliability always outrank visual novelty.

Read `README.md`, inspect `reference-contact-sheet.png` and every file in `reference-screenshots/`, then audit the current public sites:

- https://abyssinianflights.com
- https://abyssiniaaviationacademy.com

Treat all public-site and screenshot content as research material, not automatically approved production copy. Never invent facts.

## Non-negotiable outcomes

1. A first-time visitor understands the two businesses and primary CTAs within five seconds.
2. Flight clients can reach Charter, Medical Evacuation, Cargo, Destinations, and Enquiry without depending on 3D.
3. Prospective students can compare PPL, CPL, IR, ME, and CFI/FI, understand the next step, and begin an enquiry/application.
4. The site remains useful when WebGL fails, motion is reduced, bandwidth is poor, or only a keyboard/screen reader is available.
5. Every public claim, statistic, route, programme detail, testimonial, and accreditation statement is traceable to an approved source.

## Creative concept

Build around **“One sky, two journeys.”** A restrained flight path connects Ethiopian landscapes, aviation missions, destinations, and the progression from classroom to cockpit. Use highland dawn light, cloud layers, precise flight-instrument geometry, documentary photography, and an approved aircraft/livery.

Avoid generic neon sci-fi, excessive glassmorphism, uncontrolled particle fields, fake cockpit HUDs, video-game camera movement, continuous auto-motion, and decorative interactions that delay the user.

## Required page sequence

1. Lightweight preflight loader with immediate skip/access.
2. Hero: real HTML H1, value proposition, `Book a flight`, and `Explore pilot training`.
3. Two-journey selector: Flight Services / Aviation Academy.
4. Flight mission chapters: Charter / Medical Evacuation / Cargo.
5. Searchable destination route map plus accessible list view.
6. Academy transition and training pathway: PPL → CPL → IR → ME → CFI/FI (sequence must be client-approved).
7. Aircraft, simulator, instructors, campus, and community proof.
8. Verified trust layer: approvals/accreditations, facts, and genuine testimonials only.
9. Distinct flight-enquiry and academy-enrolment CTAs/forms.
10. Complete legal/contact footer.

## Interaction and animation specification

- Use a single persistent 3D canvas and one shared aircraft/flight-path narrative.
- Use semantic section progress to drive camera/scene states. Keep scroll mechanics deterministic and reversible.
- Keep all content and controls in the DOM; the canvas is atmospheric/supporting.
- Limit pointer parallax and disable it for touch/reduced motion.
- Use ScrollTrigger timelines with correct React cleanup. Do not create one trigger per decorative atom.
- If Lenis is enabled, verify native anchors, browser history, focus scrolling, text selection, touch momentum, and ScrollTrigger synchronization.
- Provide a reduced-motion storyboard with static scene keyframes and short opacity transitions.
- Pause animation offscreen/hidden; use demand rendering when the scene is static.

## Technical baseline

- Next.js App Router, React, TypeScript, strict mode.
- Server Components by default; narrow client components for interaction and WebGL.
- Three.js, React Three Fiber, Drei.
- GSAP + ScrollTrigger.
- Optional Lenis behind a tested feature flag.
- Design tokens with CSS custom properties; Tailwind CSS or CSS Modules.
- CMS schema for bilingual content, services, destinations, programmes, people, testimonials, facts, SEO, media rights, and verification dates.
- Zod and React Hook Form for forms.
- Vitest, Testing Library, Playwright, axe-core, and visual regression.
- Error monitoring and privacy-respecting product analytics.

Choose current stable compatible releases at kickoff and commit a lockfile. Confirm the React/React Three Fiber compatibility matrix before installation.

## Responsive quality tiers

Implement explicit capability tiers, not user-agent guesses:

### Tier A — high

- Full aircraft model, atmospheric cloud layers, restrained post-processing, DPR cap, high-quality shadows where stable.

### Tier B — balanced

- Lower LODs/textures, simplified clouds/materials, minimal post-processing, conservative DPR.

### Tier C — lite/static

- Art-directed image/video keyframes or CSS gradients; no WebGL requirement; identical content and CTAs.

Allow users to switch to a lighter experience. Persist the preference.

## Content/data requirements

- Create explicit content models; do not bury factual copy inside components.
- Add `source`, `owner`, `status`, and `lastVerifiedAt` to claims, routes, fleet facts, programme details, and testimonials.
- Flag the current academy placeholder testimonials for removal; never migrate them as genuine endorsements.
- Treat “first private aviation academy in Ethiopia” as an unverified client claim until evidence and wording are approved.
- Do not imply real-time flight availability unless a verified booking source powers it.
- Provide English/Amharic-ready fields and direction/script-safe components.

## Forms and integrations

Create separate, short forms for:

- Charter enquiry
- Medical evacuation callback/request (no sensitive medical-document collection in the marketing form)
- Cargo enquiry
- General flight booking/contact
- Academy programme enquiry/application start

Requirements: accessible labels and errors, server validation, spam/rate protection, clear response expectations, consent capture, CRM/email delivery logging, retry/idempotency strategy, success receipt, and privacy/retention policy.

## Accessibility requirements

- WCAG 2.2 AA target.
- Skip link, landmarks, logical headings, keyboard and switch access, visible focus, 44×44px touch targets, contrast compliance, zoom/reflow, and no keyboard traps.
- Reduced-motion path must be designed, not merely animation-duration zero.
- Canvas content must have a DOM equivalent.
- All media needs appropriate alternatives; video needs captions/transcript.
- Announce dynamic form/map changes with restraint.
- Test at 200% zoom and with screen readers on representative platforms.

## Performance requirements

- Prioritize server-rendered content and CTA; lazy-load 3D after first meaningful paint and a capability check.
- Field goals at p75: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- Keep the first 3D payload small, use GLB compression, KTX2 textures, LODs, instancing, code splitting, and adaptive DPR.
- No layout shift when the canvas/media loads.
- Test thermal stability, battery use, memory, context loss, background/foreground cycles, and route transitions.
- Record bundle, triangle, draw-call, texture-memory, and network budgets in CI.

## SEO and discoverability

- Indexable DOM copy; semantic URLs for services/programmes/destinations.
- Unique metadata, canonicals, sitemap, robots policy, breadcrumbs, Open Graph images, and approved structured data.
- Audit current URLs and ship a redirect map.
- Do not gate essential copy behind scroll animation or canvas rendering.

## Security and privacy

- Data minimization, TLS, secure headers, server validation, rate limiting, anti-spam controls, least-privilege integrations, secrets outside source control, dependency scanning, retention/deletion workflow, and incident logging.
- Obtain legal approval for cookies/analytics and cross-border processing.
- Never send sensitive medical information through ordinary email or analytics.

## Deliverables

1. Research/content audit with claim verification matrix.
2. Sitemap, task flows, and bilingual content model.
3. Design tokens and responsive component library.
4. Motion storyboard including reduced-motion version.
5. Optimized 3D source/export pipeline and asset manifest.
6. Responsive production implementation with CMS.
7. Static/WebGL fallback and explicit quality tiers.
8. Enquiry/application integrations and delivery monitoring.
9. Automated unit, integration, E2E, accessibility, and visual tests.
10. Performance dashboard and device test evidence.
11. SEO/redirect package, analytics plan, editor guide, runbook, rollback plan, and handover.

## Acceptance tests

- A keyboard-only user completes both primary journeys.
- A reduced-motion user receives an intentional, stable experience.
- The page remains readable and actionable with WebGL blocked and with JavaScript error boundaries triggered.
- A mid-tier Android device on throttled 4G reaches useful content before 3D initialization.
- Returning from background does not duplicate timelines, lose form state, or crash the WebGL context.
- All routes/programmes/claims display verification metadata in the CMS.
- No placeholder testimonials, invented awards, fabricated safety claims, or unapproved stock imagery ship.
- All forms deliver, log, retry safely, protect against spam, and show a traceable user receipt.
- Core Web Vitals and accessibility gates pass on the agreed test matrix.

## Working process

1. Begin with a content/claims audit and a performance prototype; do not start by producing a full visual build.
2. Present three art-direction frames and one motion storyboard for selection.
3. Prototype the riskiest scene on the weakest supported device.
4. Lock information architecture, tokens, and quality tiers.
5. Build vertical slices: Hero → one Flight chapter → one Academy chapter → both forms.
6. Validate with real users and stakeholders; then complete remaining chapters.
7. Run accessibility, performance, content, legal, integration, security, and rollback checks before staged launch.

## Definition of success

The finished product feels unmistakably Abyssinian, makes Ethiopian aviation feel ambitious and credible, and moves quickly from cinematic emotion to a clear next action. Users remember the flight path, but they trust the accuracy, speed, and ease of the experience.
