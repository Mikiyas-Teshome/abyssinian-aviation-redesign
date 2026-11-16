import { z } from 'zod';

export const ENQUIRY_KINDS = ['charter', 'medevac', 'cargo', 'general', 'academy'] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);
const required = (label: string, max = 120) => text(max).min(1, `${label} is required`);
const optional = (max = 120) => text(max).optional().default('');

const base = {
  name: required('Your name'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address').max(160),
  phone: text(30)
    .min(1, 'Phone number is required')
    .regex(/^\+?[\d\s()./-]{7,}$/, 'Enter a phone number, e.g. +251 911 000 000'),
  message: optional(1200),
  consent: z.literal(true, { error: 'Please confirm we may contact you about this enquiry' }),
  marketing: z.boolean().optional().default(false),
  /** Honeypot. Real visitors never see or fill this. */
  company: z.string().max(0).optional().default(''),
};

const count = (label: string) =>
  text(6)
    .min(1, `${label} is required`)
    .regex(/^\d+$/, 'Enter a whole number');

export const enquirySchemas = {
  charter: z.object({
    kind: z.literal('charter'),
    ...base,
    from: required('Departure'),
    to: required('Destination'),
    date: optional(40),
    passengers: count('Number of passengers'),
  }),
  // Deliberately collects no clinical information — only how to reach the caller.
  medevac: z.object({
    kind: z.literal('medevac'),
    ...base,
    location: required('Patient location'),
    urgency: z.enum(['within-hours', 'within-24h', 'planning'], { error: 'Choose how soon transport is needed' }),
    message: z.string().max(0, 'Please do not send medical details here').optional().default(''),
  }),
  cargo: z.object({
    kind: z.literal('cargo'),
    ...base,
    from: required('Origin'),
    to: required('Destination'),
    weight: count('Approximate weight'),
    description: required('What you are sending', 300),
  }),
  general: z.object({
    kind: z.literal('general'),
    ...base,
    subject: required('Subject'),
  }),
  academy: z.object({
    kind: z.literal('academy'),
    ...base,
    programme: z.enum(['ppl', 'cpl', 'ir', 'me', 'fi', 'unsure'], { error: 'Choose a programme' }),
    experience: z.enum(['none', 'some', 'licensed'], { error: 'Choose your experience level' }),
    start: optional(60),
  }),
} as const;

export const enquirySchema = z.discriminatedUnion('kind', [
  enquirySchemas.charter,
  enquirySchemas.medevac,
  enquirySchemas.cargo,
  enquirySchemas.general,
  enquirySchemas.academy,
]);

export type Enquiry = z.infer<typeof enquirySchema>;
