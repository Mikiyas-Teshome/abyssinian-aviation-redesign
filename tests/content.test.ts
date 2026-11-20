import { describe, expect, it } from 'vitest';
import { claims, contact, destinations, distanceKm, hub, programmes, proof, services, testimonials, trust } from '../src/content/site';
import { enquirySchema } from '../src/lib/enquiry-schema';

const verified = [...services, ...destinations, ...programmes, ...proof, ...trust, ...contact, ...claims, ...testimonials];

describe('content model', () => {
  it('gives every item a source, owner and status', () => {
    for (const item of verified) {
      expect(item.verification.source).not.toBe('');
      expect(item.verification.owner).not.toBe('');
      expect(item.verification.status).toBeTruthy();
    }
  });

  it('never marks something approved without a verification date', () => {
    for (const item of verified) {
      if (item.verification.status === 'approved') expect(item.verification.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps placeholder testimonials and unverified claims out of the approved set', () => {
    expect(testimonials.every((t) => t.verification.status === 'rejected')).toBe(true);
    expect(claims.find((c) => c.id === 'first-private-academy')!.verification.status).toBe('unverified-claim');
    // a superlative or a headline figure the operator reports about itself stays unverified,
    // however many of its own pages repeat it
    expect(claims.find((c) => c.id === 'over-50-destinations')!.verification.status).toBe('unverified-claim');
  });

  it('does not invent programme facts', () => {
    for (const p of programmes) {
      expect(p.duration).toBeNull();
      expect(p.entryRequirements).toBeNull();
      expect(p.nextIntake).toBeNull();
    }
  });

  it('sources every claim to a page and a date', () => {
    for (const c of claims) {
      expect(c.verification.source).toMatch(/\d{4}-\d{2}-\d{2}|snapshot/);
      expect(c.verification.note ?? '').not.toBe('');
    }
  });

  it('computes plausible straight-line distances', () => {
    const nairobi = destinations.find((d) => d.id === 'nairobi')!;
    expect(distanceKm(hub, nairobi)).toBeGreaterThan(1100);
    expect(distanceKm(hub, nairobi)).toBeLessThan(1250);
  });
});

const person = { name: 'Test Person', email: 'test@example.com', phone: '+251 911 000 000', consent: true };

describe('enquiry validation', () => {
  it('accepts a complete charter enquiry', () => {
    const r = enquirySchema.safeParse({ kind: 'charter', ...person, from: 'Addis Ababa', to: 'Lalibela', passengers: '4' });
    expect(r.success).toBe(true);
  });

  it('requires consent', () => {
    const r = enquirySchema.safeParse({ kind: 'general', ...person, consent: false, subject: 'Hello' });
    expect(r.success).toBe(false);
  });

  it('rejects free-text medical detail on medevac requests', () => {
    const ok = { kind: 'medevac', ...person, location: 'Jinka', urgency: 'within-hours' };
    expect(enquirySchema.safeParse(ok).success).toBe(true);
    expect(enquirySchema.safeParse({ ...ok, message: 'diagnosis details' }).success).toBe(false);
  });

  it('rejects a filled honeypot and bad phone numbers', () => {
    const base = { kind: 'academy', ...person, programme: 'ppl', experience: 'none' };
    expect(enquirySchema.safeParse(base).success).toBe(true);
    expect(enquirySchema.safeParse({ ...base, company: 'Acme' }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, phone: 'call me' }).success).toBe(false);
  });
});
