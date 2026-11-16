# Abyssinian Flight Services × Aviation Academy

## Cinematic 3D website redesign brief

This repository brief defines a complete redesign of the public-facing experience for **Abyssinian Flight Services (AFS)** and **Abyssinian Aviation Academy (AAA)**. The product should feel like one coherent aviation brand with two clear journeys: **Fly** and **Train**.

The goal is not spectacle for its own sake. The result must convert visitors into charter/medevac/cargo enquiries and academy applications while expressing Ethiopian identity, operational confidence, and the wonder of flight.

> Research snapshot: 16 November 2026. Public claims, routes, prices, aircraft details, accreditations, safety statistics, testimonials, and contact details must be revalidated with the client before launch.

## Source material

- Flight Services: https://abyssinianflights.com
- Aviation Academy: https://abyssiniaaviationacademy.com
- Eight supplied screenshots: `reference-screenshots/`
- Visual overview: `reference-contact-sheet.png`

Publicly visible service/content inventory at the time of research:

- Flight Services: charter flights, cargo flights, medical evacuation, destination search, featured destinations, booking CTA, and GERD/Guba charter content.
- Destinations currently shown include Axum, Bahir Dar, Dire Dawa, Djibouti, Gondar, Jinka, Juba, Lalibela, and Nairobi.
- Academy: Private Pilot Licence, Commercial Pilot Licence, Instrument Rating, Multi-Engine Rating, and Flight Instructor Rating.
- Training modes: ground, flight, simulator, single-engine, night-flight, instrument, multi-engine, and ground-school instruction.
- Academy positioning: “The First Private Aviation Academy in Ethiopia.” Treat this as a client-supplied claim requiring approval and evidence before publication.

## Product concept: One sky, two journeys

The landing page opens above a dawn-lit Ethiopian landscape. A hero aircraft passes through volumetric cloud, then banks gently as the user scrolls. The flight path becomes a gold navigation line connecting two worlds:

1. **Fly with Abyssinian** — charter, medevac, cargo, destinations, booking.
2. **Become a pilot** — academy story, training pathway, programmes, campus, enrolment.

The visitor can switch journeys at any point without losing scroll context. Mobile receives a deliberately art-directed lightweight experience, not a shrunken desktop scene.

## Brand direction

### Design language

- Premium African aviation: precise, warm, assured, never generic sci-fi.
- Ethiopian landscape and light are the emotional signature: highland dawn, basalt shadow, cloud white, and restrained ceremonial gold.
- Use aviation instrumentation as a subtle grid and motion vocabulary, not literal cockpit decoration.
- Photography remains documentary and human; 3D provides continuity and atmosphere.

### Working palette

These are design hypotheses to validate against official brand files.

| Token | Hex | Use |
|---|---:|---|
| Flight Navy | `#071A2B` | Primary canvas, authority |
| Altitude Blue | `#0D3B66` | Surfaces, gradients |
| Sky Cyan | `#63C7E8` | Focus, flight path, data |
| Cloud | `#F4F7F8` | Typography, light sections |
| Ethiopian Gold | `#D6A53A` | Premium accent and key CTAs |
| Earth | `#9B5A38` | Landscape warmth |
| Signal Red | `#D7463D` | Emergency/medevac only |

Use no more than one gold focal point per viewport. Preserve AAA/AFS official logo colours when supplied.

### Typography

- Display: a licensed high-contrast or engineered grotesk with strong numerals.
- UI/body: `Inter`, `Manrope`, or equivalent variable sans.
- Ethiopic support: choose a font with complete Amharic glyph coverage (for example, Noto Sans Ethiopic) and test mixed-script line heights.
- Use fluid type via `clamp()` and keep body text at 16px minimum.

## Landing-page narrative

### 0. Preflight loader

- Minimal logo/flight-path animation, 1.5–2.5 seconds maximum on a warm visit.
- Stream critical assets first; never block access to navigation or reduced-motion mode.
- Show meaningful progress only when measurable.

### 1. Hero — “Ethiopia takes flight”

- Full-viewport WebGL scene with an optimized, client-approved aircraft model.
- Dawn-to-day lighting tied gently to scroll.
- Primary CTAs: `Book a flight` and `Explore pilot training`.
- Persistent utility actions: call, enquire, accessibility, language.
- The H1 and CTAs render as real HTML, never inside the canvas.

### 2. Two journeys

- A split composition reveals Flight Services and Aviation Academy.
- Pointer movement changes parallax by no more than 2–3 degrees.
- Keyboard users receive the same content and clear focus order.

### 3. Flight Services — mission selector

- Three cinematic chapters: Charter, Medical Evacuation, Cargo.
- Scroll transitions reconfigure one shared aircraft scene rather than loading three canvases.
- Each service has a direct enquiry CTA, concise proof, response expectations, and required-field disclosure.

### 4. Destinations — living route map

- Stylized 3D/2.5D map centred on Ethiopia and regional connections.
- Routes draw only when visible; destination details remain DOM-based.
- Provide list view, search, and keyboard navigation.
- Do not imply a route is scheduled/current unless confirmed by a live source or CMS status.

### 5. Academy — from ground to cockpit

- The flight path becomes a training timeline.
- Reveal PPL → CPL → IR → ME → CFI/FI as a logical pathway, without implying prerequisites until approved.
- Each programme includes outcome, entry requirements, duration, syllabus overview, next intake, and enquiry/enrol CTA when verified.

### 6. Training environment

- Layered media story for aircraft, simulator, instructors, classrooms, and student community.
- Use real media and approved captions; avoid stock imagery presented as the academy.
- Optional 360 tour loads only after explicit interaction.

### 7. Trust and proof

- Approved regulator/accreditation references, fleet facts, years operating, safety/process commitments, and genuine student/client voices.
- Remove the current placeholder testimonials before any public release.
- Every number needs a CMS source field and “last verified” date.

### 8. Conversion finale

- A unified “Choose your next journey” panel.
- Flight enquiry and academy application are distinct short flows.
- Save progress locally, validate inline, support phone fallback, and provide consent/privacy copy.

### 9. Footer

- Correct business entities, verified addresses, phone/email, operating hours, policies, sitemap, social links, and emergency disclaimer.

## Motion system

- Motion communicates altitude, direction, continuity, and cause/effect.
- One master scroll narrative; local interactions use short independent timelines.
- Use transforms and opacity for DOM motion. Avoid layout-thrashing properties.
- Target 200–450ms for UI feedback, 700–1200ms for editorial reveals, and scroll-scrubbed motion for scene transitions.
- Respect `prefers-reduced-motion`: replace camera travel with crossfades and static keyframes; remove auto-rotation, turbulence, and smooth-scroll interpolation.
- Pause rendering when the tab/canvas is hidden or offscreen.

## Recommended architecture

### Core

- **Next.js App Router + React + TypeScript**, using Server Components by default and client islands only for interaction/3D.
- **Three.js + React Three Fiber + Drei** for the shared WebGL scene.
- **GSAP + ScrollTrigger** for authored timelines; use React-safe cleanup and a single scroll orchestration layer.
- **Lenis** only after native-scroll accessibility and touch behaviour pass testing; the site must work with it disabled.
- **CSS variables + Tailwind CSS or CSS Modules** for tokens and layout. Avoid runtime styling for critical UI.
- **Sanity, Contentful, or Payload** for bilingual editorial content, programme facts, destinations, media rights, and verification dates.
- **Zod + React Hook Form** for enquiry/application validation.
- **Playwright + Vitest + Testing Library + axe-core** for regression, unit, and accessibility coverage.
- **Sentry + privacy-conscious analytics** for errors and funnel measurement.

Use exact stable versions selected and locked at implementation kickoff; do not hard-code “latest” into the brief. React Three Fiber must match the chosen React major version.

### Suggested project structure

```text
src/
  app/
    (marketing)/
    api/
    layout.tsx
    page.tsx
  components/
    ui/
    sections/
    forms/
  experience/
    Canvas.tsx
    scenes/
    camera/
    shaders/
    quality/
  animation/
    scroll-orchestrator.ts
    motion-policy.ts
  content/
    schema/
    queries/
  lib/
  styles/
public/
  models/
  textures/
  images/
tests/
```

### Rendering strategy

- Server-render navigation, copy, programme/service cards, metadata, and forms.
- Dynamically load WebGL after first meaningful paint and device capability check.
- One persistent canvas; scene state is a finite state machine driven by semantic section progress.
- Provide a full static fallback using art-directed AVIF/WebP keyframes.
- Do not require WebGL for booking, enquiry, content, navigation, or SEO.

## 3D asset pipeline

1. Confirm rights and exact aircraft/livery.
2. Model in Blender with clean topology and named animation anchors.
3. Bake lighting/detail where appropriate; keep materials physically plausible.
4. Export GLB, compress geometry with Meshopt/Draco as tested, and textures with KTX2/Basis.
5. Use LODs and instancing; avoid unique high-resolution textures on mobile.
6. Validate scale, normals, colour space, draw calls, triangles, texture memory, and loading waterfall.

Initial budgets (adjust after prototype):

- Hero aircraft: 80k–150k visible triangles desktop; 30k–70k mobile.
- Active draw calls: under 100 desktop, under 60 mid-tier mobile.
- Initial compressed 3D payload: ideally under 2.5MB desktop and under 1.2MB mobile.
- Largest individual texture: 2K desktop, 1K mobile unless visual testing proves otherwise.
- Prefer a 30fps quality mode on constrained devices over unstable 60fps.

## Performance gates

- Lighthouse lab targets are supporting signals, not the definition of success.
- Field goals at the 75th percentile: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 on representative mobile traffic.
- HTML content and CTA must appear before WebGL is ready.
- Adaptive DPR, post-processing tiers, texture LODs, and on-demand rendering are mandatory.
- Test on a real mid-tier Android device, iPhone Safari, low-power laptop, high-DPI desktop, throttled 4G, and keyboard/screen reader combinations.

## Accessibility and inclusion

- Target WCAG 2.2 AA.
- Semantic landmarks, skip link, logical headings, visible focus, 44×44px targets, and complete keyboard operation.
- Canvas is decorative unless an equivalent DOM control/content model exists.
- Captions/transcripts for video, descriptive alternatives for meaningful images, and no information conveyed by colour alone.
- English/Amharic layout must tolerate text expansion and Ethiopic line breaking.
- Forms announce errors and success; emergency/medical copy is reviewed for clarity.

## SEO, structured data, and content

- Unique metadata and canonical URLs for every service, destination, and programme.
- Use Organization/LocalBusiness, Course where applicable, BreadcrumbList, FAQPage only for visible FAQs, and VideoObject for owned video.
- Generate XML sitemap, robots policy, Open Graph imagery, and human-readable URLs.
- Preserve useful legacy URLs with an explicit redirect map.
- Never publish generated testimonials, unverified claims, fabricated statistics, fake ratings, or route availability.

## Security and privacy

- Minimize personal data; separate marketing consent from service requests.
- Server-side validation, rate limiting, spam protection, secure headers, upload restrictions, audit logs, and retention/deletion rules.
- Medical evacuation enquiries must not solicit sensitive health records in a general marketing form. Route confidential cases into an approved secure workflow.
- Document third-party processors, cookies, analytics, and cross-border data handling with legal review.

## Delivery plan

### Phase 0 — Discovery (1–2 weeks)

- Stakeholder interviews, brand asset audit, content/legal matrix, analytics baseline, user journeys, technical spike, and success metrics.

### Phase 1 — Experience definition (2–3 weeks)

- Information architecture, bilingual wireframes, conversion flows, motion storyboard, accessibility plan, and content model.

### Phase 2 — Visual/3D prototype (3–4 weeks)

- Hero art direction, aircraft prototype, map prototype, performance proof on target hardware, static fallback, design system.

### Phase 3 — Production build (5–8 weeks)

- CMS, responsive UI, scene chapters, forms/integrations, content migration, analytics, SEO, and automated testing.

### Phase 4 — Hardening and launch (2–3 weeks)

- Device/browser matrix, accessibility audit, performance tuning, security review, stakeholder training, redirect validation, staged launch, rollback drill.

### Phase 5 — Optimization (ongoing)

- Field performance, enquiry/application funnel, search visibility, content freshness, A/B tests, asset and dependency maintenance.

## Definition of done

- All public facts and claims have named client owners and approval dates.
- Core journeys work with JavaScript failure, WebGL disabled, reduced motion, keyboard only, and 200% zoom.
- No placeholder copy, stock “student” claims, broken links, dead CTAs, or duplicate forms.
- Performance and accessibility gates pass on agreed devices, not only developer machines.
- Analytics, consent, CRM/email delivery, spam protection, error reporting, backups, rollback, and incident ownership are tested.
- Editors can update destinations, programmes, service content, media, SEO, and verification dates without code changes.

## Immediate decisions required

1. One domain or two linked domains?
2. Exact legal entities and conversion owners?
3. Approved logos, brand manual, aircraft/livery files, and media rights?
4. Booking engine/CRM/application integrations?
5. Confirmed routes, fleet, programme facts, accreditation language, and safety claims?
6. English only at launch or English + Amharic?
7. Target countries, privacy obligations, hosting region, and analytics policy?
8. Device/performance baseline and launch date?

## Primary technical references

- Next.js App Router: https://nextjs.org/docs/app
- React Three Fiber introduction: https://r3f.docs.pmnd.rs/getting-started/introduction
- React Three Fiber performance: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- GSAP ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Lenis: https://github.com/darkroomengineering/lenis
- Web Content Accessibility Guidelines: https://www.w3.org/TR/WCAG22/
- Core Web Vitals: https://web.dev/articles/vitals

## Companion execution brief

Use [`project-promt.md`](project-promt.md) as the implementation prompt for a design/development team or coding agent. It intentionally preserves the requested filename.
