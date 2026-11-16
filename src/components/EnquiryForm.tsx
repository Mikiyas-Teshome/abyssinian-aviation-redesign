'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { enquirySchemas, type EnquiryKind } from '@/lib/enquiry-schema';
import { contactById, programmes } from '@/content/site';

interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'date' | 'select' | 'textarea';
  options?: [value: string, label: string][];
  autoComplete?: string;
  inputMode?: 'numeric' | 'tel' | 'email';
  hint?: string;
  optional?: boolean;
  wide?: boolean;
}

const CONTACT: FieldDef[] = [
  { name: 'name', label: 'Your name', autoComplete: 'name' },
  { name: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel', hint: 'Include the country code' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', inputMode: 'email', wide: true },
];

const FIELDS: Record<EnquiryKind, FieldDef[]> = {
  charter: [
    { name: 'from', label: 'Flying from' },
    { name: 'to', label: 'Flying to' },
    { name: 'date', label: 'Preferred date', type: 'date', optional: true },
    { name: 'passengers', label: 'Passengers', inputMode: 'numeric' },
    ...CONTACT,
    { name: 'message', label: 'Anything else we should know', type: 'textarea', optional: true, wide: true },
  ],
  medevac: [
    { name: 'location', label: 'Where is the patient now?', hint: 'Town, airstrip or facility — no medical details', wide: true },
    {
      name: 'urgency',
      label: 'How soon is transport needed?',
      type: 'select',
      options: [['within-hours', 'Within hours'], ['within-24h', 'Within 24 hours'], ['planning', 'Planning ahead']],
      wide: true,
    },
    ...CONTACT,
  ],
  cargo: [
    { name: 'from', label: 'Origin' },
    { name: 'to', label: 'Destination' },
    { name: 'weight', label: 'Approximate weight (kg)', inputMode: 'numeric' },
    { name: 'description', label: 'What are you sending?' },
    ...CONTACT,
    { name: 'message', label: 'Dimensions or special handling', type: 'textarea', optional: true, wide: true },
  ],
  general: [
    { name: 'subject', label: 'What is it about?', wide: true },
    ...CONTACT,
    { name: 'message', label: 'Message', type: 'textarea', optional: true, wide: true },
  ],
  academy: [
    {
      name: 'programme',
      label: 'Programme',
      type: 'select',
      options: [...programmes.map((p): [string, string] => [p.id, `${p.code} — ${p.name.en}`]), ['unsure', 'Not sure yet']],
    },
    {
      name: 'experience',
      label: 'Flying experience',
      type: 'select',
      options: [['none', 'None yet'], ['some', 'Some lessons or hours'], ['licensed', 'Already hold a licence']],
    },
    { name: 'start', label: 'When would you like to start?', optional: true, wide: true },
    ...CONTACT,
    { name: 'message', label: 'Questions for admissions', type: 'textarea', optional: true, wide: true },
  ],
};

const SUBMIT: Record<EnquiryKind, string> = {
  charter: 'Send charter enquiry',
  medevac: 'Request a callback',
  cargo: 'Send cargo enquiry',
  general: 'Send message',
  academy: 'Start my application enquiry',
};

type Values = Record<string, string | boolean>;
type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; reference: string; delivered: boolean }
  | { state: 'error'; message: string };

const draftKey = (kind: EnquiryKind) => `aby-draft-${kind}`;

export function EnquiryForm({ kind, prefill }: { kind: EnquiryKind; prefill?: Record<string, string> }) {
  const uid = useId();
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const idempotencyKey = useRef<string>('');
  const receipt = useRef<HTMLDivElement>(null);
  // Medevac requests are never written to local storage.
  const persist = kind !== 'medevac';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(enquirySchemas[kind]) as unknown as Resolver<Values>,
    defaultValues: { kind, consent: false, marketing: false, company: '' },
    mode: 'onBlur',
  });

  // Restore a saved draft after mount (keeps server and client markup identical).
  useEffect(() => {
    if (!persist) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(kind)) ?? 'null') as Values | null;
      if (saved) for (const [k, v] of Object.entries(saved)) setValue(k, v);
    } catch {
      /* ignore unreadable drafts */
    }
  }, [kind, persist, setValue]);

  useEffect(() => {
    if (!prefill) return;
    for (const [k, v] of Object.entries(prefill)) setValue(k, v, { shouldDirty: true });
  }, [prefill, setValue]);

  useEffect(() => {
    if (!persist) return;
    const sub = watch((values) => {
      try {
        const { consent: _c, company: _h, kind: _k, ...draft } = values;
        localStorage.setItem(draftKey(kind), JSON.stringify(draft));
      } catch {
        /* storage unavailable */
      }
    });
    return () => sub.unsubscribe();
  }, [kind, persist, watch]);

  useEffect(() => {
    if (status.state === 'sent') receipt.current?.focus();
  }, [status.state]);

  const onSubmit = async (values: Values) => {
    setStatus({ state: 'sending' });
    idempotencyKey.current ||= crypto.randomUUID();
    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey.current },
        body: JSON.stringify({ ...values, kind }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reference?: string;
        delivered?: boolean;
        error?: string;
        fields?: Record<string, string[]>;
      };
      if (res.ok && data.reference) {
        setStatus({ state: 'sent', reference: data.reference, delivered: data.delivered !== false });
        idempotencyKey.current = '';
        try {
          localStorage.removeItem(draftKey(kind));
        } catch {
          /* ignore */
        }
        reset({ kind, consent: false, marketing: false, company: '' });
        return;
      }
      if (data.fields) {
        for (const [name, messages] of Object.entries(data.fields)) {
          if (messages?.[0]) setError(name, { message: messages[0] });
        }
      }
      setStatus({ state: 'error', message: data.error ?? 'Something went wrong. Please try again.' });
    } catch {
      // Network failure: the idempotency key is kept so retrying cannot create a duplicate.
      setStatus({ state: 'error', message: 'You appear to be offline. Your details are still here — try again, or call us.' });
    }
  };

  const phone = contactById(kind === 'medevac' ? 'phone-247' : 'phone-main');

  if (status.state === 'sent') {
    return (
      <div ref={receipt} className="receipt" role="status" tabIndex={-1}>
        <p className="receipt__tick" aria-hidden="true">✓</p>
        <h4>{kind === 'medevac' ? 'Callback requested' : 'Enquiry received'}</h4>
        <p>
          Your reference is <strong className="receipt__ref">{status.reference}</strong>. Keep it for any follow-up.
        </p>
        {status.delivered ? (
          <p className="fine">
            {kind === 'medevac'
              ? 'If the situation is urgent, call now rather than waiting.'
              : 'We reply during business hours, Monday to Friday.'}
          </p>
        ) : (
          <p className="receipt__dev">
            Development mode: the request was validated and logged, but no delivery channel is configured, so nobody
            has been notified.
          </p>
        )}
        <div className="cta-row">
          <a className="btn btn--line btn--small" href={phone.href}>Call {phone.value}</a>
          <button type="button" className="btn btn--line btn--small" onClick={() => setStatus({ state: 'idle' })}>
            Send another
          </button>
        </div>
      </div>
    );
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)} aria-busy={status.state === 'sending'}>
      <p className="form__legend">
        All fields are required unless marked optional.
        {persist && ' Your progress is saved on this device until you send.'}
      </p>
      <div className="form__grid">
        {FIELDS[kind].map((f) => {
          const id = `${uid}-${f.name}`;
          const error = errors[f.name]?.message as string | undefined;
          const describedBy = [f.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
          const common = {
            id,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy,
            'aria-required': !f.optional,
            ...register(f.name),
          };
          return (
            <div key={f.name} className={`field${f.wide ? ' field--wide' : ''}${error ? ' field--error' : ''}`}>
              <label htmlFor={id}>
                {f.label} {f.optional && <span className="field__optional">optional</span>}
              </label>
              {f.type === 'select' ? (
                <select {...common} defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {f.options!.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea rows={3} {...common} />
              ) : (
                <input type={f.type ?? 'text'} autoComplete={f.autoComplete} inputMode={f.inputMode} {...common} />
              )}
              {f.hint && <p id={`${id}-hint`} className="field__hint">{f.hint}</p>}
              {error && <p id={`${id}-error`} className="field__error">{error}</p>}
            </div>
          );
        })}
      </div>

      {/* honeypot: hidden from people and assistive tech */}
      <div className="hp" aria-hidden="true">
        <label>
          Company
          <input type="text" tabIndex={-1} autoComplete="off" {...register('company')} />
        </label>
      </div>

      <div className={`check${errors.consent ? ' field--error' : ''}`}>
        <input id={`${uid}-consent`} type="checkbox" aria-describedby={errors.consent ? `${uid}-consent-error` : undefined} {...register('consent')} />
        <label htmlFor={`${uid}-consent`}>
          I agree that Abyssinian may use these details to respond to this enquiry. See the{' '}
          <a href="/privacy">privacy notice</a>.
        </label>
        {errors.consent && <p id={`${uid}-consent-error`} className="field__error">{errors.consent.message as string}</p>}
      </div>
      {kind !== 'medevac' && (
        <div className="check">
          <input id={`${uid}-marketing`} type="checkbox" {...register('marketing')} />
          <label htmlFor={`${uid}-marketing`}>
            Also send me occasional news <span className="field__optional">optional</span>
          </label>
        </div>
      )}

      <div role="alert" className="form__alert">
        {status.state === 'error' && <p>{status.message} <a href={phone.href}>Call {phone.value}</a>.</p>}
        {status.state !== 'error' && errorCount > 0 && (
          <p>{errorCount === 1 ? 'One field needs' : `${errorCount} fields need`} attention above.</p>
        )}
      </div>

      <button type="submit" className={`btn ${kind === 'medevac' ? 'btn--red' : 'btn--gold'}`} disabled={status.state === 'sending'}>
        {status.state === 'sending' ? 'Sending…' : SUBMIT[kind]}
      </button>
    </form>
  );
}
