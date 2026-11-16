import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'What the Abyssinian enquiry forms collect and why.',
  alternates: { canonical: '/privacy' },
};

export default function Privacy() {
  return (
    <main id="main" className="doc">
      <p><a href="/">← Back to the home page</a></p>
      <h1>Privacy notice</h1>
      <p className="callout">Draft. This notice describes what the website does technically and must be reviewed and completed by legal counsel before launch.</p>
      <h2>What the enquiry forms collect</h2>
      <ul>
        <li>Your name, phone number and email address, so we can reply.</li>
        <li>The details of your request: route, date, passenger numbers, cargo description, or the programme you are interested in.</li>
        <li>For medical evacuation callbacks: the patient’s location and how soon transport is needed. The form does not ask for, and should not be sent, medical records or diagnoses.</li>
      </ul>
      <h2>What stays on your device</h2>
      <ul>
        <li>Unsent form drafts are saved in your browser so you do not lose progress. They are removed when you send the form. Medical evacuation requests are never saved this way.</li>
        <li>Your visual-quality choice is saved in your browser.</li>
        <li>This site sets no advertising or analytics cookies.</li>
      </ul>
      <h2>Still to be confirmed</h2>
      <ul>
        <li>The legal entity responsible for your data and how to contact it.</li>
        <li>How long enquiries are kept and how to request deletion.</li>
        <li>Which service providers process enquiries, and where.</li>
      </ul>
    </main>
  );
}
