import type { Metadata } from 'next';
import type { Verification } from '@/content/schema';
import { claims, contact, destinations, programmes, proof, services, testimonials, trust } from '@/content/site';

export const metadata: Metadata = {
  title: 'Content verification matrix',
  robots: { index: false, follow: false },
};

interface Row {
  group: string;
  item: string;
  rendered: boolean;
  v: Verification;
}

const rows: Row[] = [
  ...services.map((s) => ({ group: 'Service', item: s.name.en, rendered: true, v: s.verification })),
  ...destinations.map((d) => ({ group: 'Destination', item: d.name.en, rendered: true, v: d.verification })),
  ...programmes.map((p) => ({ group: 'Programme', item: `${p.code} — ${p.name.en}`, rendered: true, v: p.verification })),
  ...proof.map((p) => ({ group: 'Training environment', item: p.title.en, rendered: true, v: p.verification })),
  ...trust.map((p) => ({ group: 'Trust', item: p.title.en, rendered: true, v: p.verification })),
  ...contact.map((c) => ({ group: 'Contact', item: `${c.label}: ${c.value}`, rendered: true, v: c.verification })),
  ...claims.map((c) => ({ group: 'Claim', item: c.statement, rendered: false, v: c.verification })),
  ...testimonials.map((t) => ({ group: 'Testimonial', item: t.quote, rendered: false, v: t.verification })),
];

/** Internal, noindex: the claim verification matrix generated from the content model. */
export default function ContentAudit() {
  const approved = rows.filter((r) => r.v.status === 'approved').length;
  return (
    <main id="main" className="doc doc--wide">
      <p><a href="/">← Back to the home page</a></p>
      <h1>Content verification matrix</h1>
      <p>
        {rows.length} items · {approved} approved · {rows.length - approved} awaiting client sign-off. Generated from{' '}
        <code>src/content/site.ts</code>.
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Verification matrix">
        <table>
          <thead>
            <tr>
              <th scope="col">Type</th><th scope="col">Item</th><th scope="col">On page</th><th scope="col">Status</th>
              <th scope="col">Source</th><th scope="col">Owner</th><th scope="col">Last verified</th><th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-status={r.v.status}>
                <td>{r.group}</td>
                <th scope="row">{r.item}</th>
                <td>{r.rendered ? 'Yes' : 'No'}</td>
                <td><span className="status">{r.v.status}</span></td>
                <td>{r.v.source}</td>
                <td>{r.v.owner}</td>
                <td>{r.v.lastVerifiedAt ?? 'Never'}</td>
                <td>{r.v.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
