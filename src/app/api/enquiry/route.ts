import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverEnquiry } from '@/lib/delivery';
import { enquirySchema } from '@/lib/enquiry-schema';

export const runtime = 'nodejs';

/**
 * In-memory rate limit and idempotency cache. Adequate for a single instance;
 * swap for a shared store (Redis/KV) before running more than one.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();
const receipts = new Map<string, { reference: string; at: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

function makeReference(kind: string): string {
  const d = new Date();
  const stamp = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const prefix = kind === 'academy' ? 'AAA' : 'AFS';
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please call us instead, or try again in a few minutes.' },
      { status: 429, headers: { 'retry-after': '600' } },
    );
  }

  const raw = await request.text();
  if (raw.length > 10_000) return NextResponse.json({ error: 'Request too large' }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Bots that fill the honeypot get a plausible response and nothing is delivered.
  if (typeof body === 'object' && body !== null && (body as { company?: unknown }).company) {
    return NextResponse.json({ reference: makeReference('general') });
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the highlighted fields.', fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
  }

  // A retried submission with the same key returns the original receipt.
  const key = request.headers.get('idempotency-key');
  const now = Date.now();
  if (key) {
    const prior = receipts.get(key);
    if (prior && now - prior.at < 24 * 60 * 60 * 1000) return NextResponse.json({ reference: prior.reference });
  }

  const reference = makeReference(parsed.data.kind);
  try {
    const result = await deliverEnquiry(reference, parsed.data);
    if (key) receipts.set(key, { reference, at: now });
    if (receipts.size > 5000) receipts.clear();
    return NextResponse.json({ reference, delivered: result.delivered });
  } catch {
    return NextResponse.json(
      { error: 'We could not send your enquiry just now. Please call us, or try again shortly.' },
      { status: 502 },
    );
  }
}
