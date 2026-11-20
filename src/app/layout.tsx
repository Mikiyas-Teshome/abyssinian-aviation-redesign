import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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

// Runs before first paint, so nothing it decides can flash.
//  · marks JS as available, and locks scrolling until the world is ready —
//    there is nothing to see behind the cover, and scrolling past it means
//    arriving somewhere with the chapter already half over;
//  · stops the browser restoring a scroll position, because the page is one
//    screen tall before it hydrates and many screens tall afterwards, so a
//    restored position lands somewhere else entirely, mid-flight;
//  · marks a reload, which skips the intro entirely. `navigation.type` is how
//    a reload is told apart from arriving at the page, which storage cannot
//    do: a refresh keeps the same tab, the same origin and the same storage.
//
// All of it goes in attributes, never in `class`. React owns this element's
// className and restores the server's value when it hydrates, which silently
// threw away everything decided here — including the flag that says a reload
// needs no intro, and so the one that releases the scroll lock.
//
// The fallback deadline sits past the cover's own (9s), so the cover always
// gets to leave under its own power and unbind its scroll lock; this is only
// for the case where the bundle never runs at all.
const boot = `(function(){var d=document.documentElement;d.setAttribute('data-js','');d.setAttribute('data-mode','immersive');d.setAttribute('data-hold','');
if('scrollRestoration' in history&&!location.hash)history.scrollRestoration='manual';
var isFresh=false;
try{
  if(sessionStorage.getItem('abyssinian:fresh')==='1'){
    sessionStorage.removeItem('abyssinian:fresh');
    sessionStorage.removeItem('abyssinian:place');
    isFresh=true;
  }
}catch(e){}
var seen=false;
if(!isFresh){
  try{
    var n=performance.getEntriesByType('navigation')[0];
    var isReload=!!(n&&n.type!=='navigate');
    var saved=null;
    try{saved=JSON.parse(sessionStorage.getItem('abyssinian:place')||'null')}catch(e){}
    seen=isReload&&!!(saved&&saved.y>100);
  }catch(e){}
}
if(seen)d.setAttribute('data-seen','');
window.addEventListener('keydown',function(e){
  if(((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==='R'||e.key==='r'))||((e.ctrlKey||e.shiftKey)&&(e.key==='F5'||e.keyCode===116))){
    try{sessionStorage.removeItem('abyssinian:place');sessionStorage.setItem('abyssinian:fresh','1')}catch(err){}
  }
},true);
setTimeout(function(){if(!d.hasAttribute('data-entered'))d.setAttribute('data-boot-timeout','');
d.setAttribute('data-entered','');d.removeAttribute('data-hold')},12000)})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-mode="immersive" data-js className={`${body.variable} ${display.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <Script id="boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
