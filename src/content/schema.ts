/**
 * Content model. Every factual item carries verification metadata so nothing
 * reaches the public page without a traceable source and an approval state.
 * Shapes mirror what a CMS (Sanity / Payload / Contentful) would store.
 */

export type VerificationStatus = 'approved' | 'needs-client-approval' | 'unverified-claim' | 'rejected';

export interface Verification {
  /** Where the statement came from. */
  source: string;
  /** Who at the client must sign it off. */
  owner: string;
  status: VerificationStatus;
  /** ISO date of the last check, or null if never verified with the client. */
  lastVerifiedAt: string | null;
  note?: string;
}

/** Bilingual field. Amharic stays undefined until an approved translation exists. */
export interface Localized {
  en: string;
  am?: string;
}

export type ServiceId = 'charter' | 'medevac' | 'cargo';

export interface Service {
  id: ServiceId;
  index: string;
  name: Localized;
  kicker: Localized;
  summary: Localized;
  points: Localized[];
  cta: Localized;
  responseNote: Localized;
  verification: Verification;
}

export interface Destination {
  id: string;
  name: Localized;
  country: Localized;
  lat: number;
  lon: number;
  hub?: boolean;
  verification: Verification;
}

export type ProgrammeId = 'ppl' | 'cpl' | 'ir' | 'me' | 'fi';

export interface Programme {
  id: ProgrammeId;
  code: string;
  name: Localized;
  /** General description of the licence/rating — not an academy-specific claim. */
  summary: Localized;
  focus: Localized[];
  /** Academy-specific facts. null = not yet supplied/approved, never guessed. */
  duration: Localized | null;
  entryRequirements: Localized | null;
  nextIntake: Localized | null;
  verification: Verification;
}

export interface ProofItem {
  id: string;
  title: Localized;
  body: Localized;
  verification: Verification;
}

export interface Claim {
  id: string;
  statement: string;
  verification: Verification;
}

export interface Testimonial {
  id: string;
  quote: string;
  attribution: string;
  verification: Verification;
}

export interface ContactDetail {
  id: string;
  label: string;
  value: string;
  href?: string;
  verification: Verification;
}
