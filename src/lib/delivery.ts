import type { Enquiry } from './enquiry-schema';

export interface DeliveryResult {
  delivered: boolean;
  channel: 'webhook' | 'dev-log';
}

/**
 * Hands a validated enquiry to the client's CRM / email relay.
 * There is intentionally no silent success: in production, a missing or failing
 * webhook is an error the visitor sees (with the phone fallback).
 */
export async function deliverEnquiry(reference: string, enquiry: Enquiry): Promise<DeliveryResult> {
  const url = process.env.ENQUIRY_WEBHOOK_URL;
  const { company: _honeypot, ...payload } = enquiry;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENQUIRY_WEBHOOK_URL is not configured');
    }
    // Development only: log routing metadata, never the message body or contact details.
    console.info('[enquiry:dev-log]', { reference, kind: enquiry.kind, receivedAt: new Date().toISOString() });
    return { delivered: false, channel: 'dev-log' };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': reference },
        body: JSON.stringify({ reference, receivedAt: new Date().toISOString(), ...payload }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        console.info('[enquiry:delivered]', { reference, kind: enquiry.kind, attempt });
        return { delivered: true, channel: 'webhook' };
      }
      lastError = new Error(`Webhook responded ${res.status}`);
      if (res.status < 500) break; // retrying a 4xx will not help
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  console.error('[enquiry:delivery-failed]', { reference, kind: enquiry.kind, error: String(lastError) });
  throw lastError instanceof Error ? lastError : new Error('Delivery failed');
}
