import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';

// Barlow was drawn from highway and airfield signage — the same vocabulary the world is built in.
const body = Barlow({ subsets: ['latin'], variable: '--font-body', display: 'swap', weight: ['400', '500', '600'] });
const display = Barlow_Condensed({ subsets: ['latin'], variable: '--font-display', display: 'swap', weight: ['500', '600', '700'] });
const mono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['400', '500'] });
const serif = Instrument_Serif({ subsets: ['latin'], variable: '--font-serif', display: 'swap', weight: '400', style: ['normal', 'italic'] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Abyssinian — Flight Services & Aviation Academy',
    template: '%s · Abyssinian',
  },
  description:
    'One sky, two journeys. Charter, medical evacuation and cargo flights with Abyssinian Flight Services, and pilot training with Abyssinian Aviation Academy.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'Abyssinian — One sky, two journeys',
    description: 'Charter, medical evacuation and cargo flights, and pilot training from PPL to flight instructor.',
    url: '/',
    siteName: 'Abyssinian',
    locale: 'en',
  },
};

export const viewport: Viewport = {
  themeColor: '#04070c',
  width: 'device-width',
  initialScale: 1,
};

// Runs before first paint: marks JS as available, skips the loader on repeat
// views, and guarantees reveal-hidden content appears even if the app bundle fails.
const boot = `(function(){var d=document.documentElement;d.classList.add('js');try{if(sessionStorage.getItem('aby-seen'))d.classList.add('seen')}catch(e){}setTimeout(function(){if(!window.__motionReady)d.classList.add('reveal-all')},4000)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${body.variable} ${display.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
