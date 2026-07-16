import type { Metadata } from 'next';
import './globals.css';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import CookieConsent from './CookieConsent';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),

  title: {
    default: 'Overlay Bets — Verified Tipster Marketplace',
    template: '%s | Overlay Bets',
  },

  description: 'Find the overlay. Beat the close. Follow verified sports tipsters ranked by transparent ROI, Closing Line Value (CLV), and immutable pre-match picks.',

  applicationName: 'Overlay Bets',

  keywords: [
    'sports betting',
    'sports tipsters',
    'verified tipsters',
    'betting tips',
    'football predictions',
    'sports picks',
    'closing line value',
    'CLV',
    'ROI',
    'Overlay Bets',
  ],

  authors: [
    {
      name: 'Overlay Bets',
    },
  ],

  creator: 'Overlay Bets',
  publisher: 'Overlay Bets',

  robots: {
    index: true,
    follow: true,
  },

  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Overlay Bets',
    title: 'Overlay Bets — Verified Tipster Marketplace',
    description:
      'Find the overlay. Beat the close. Follow verified sports tipsters ranked by transparent ROI and Closing Line Value.',
    url: '/',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Overlay Bets — Verified Tipster Marketplace',
    description:
      'Verified sports tipsters. Transparent statistics. Immutable pre-match picks.',
  },

  icons: { icon: '/overlay.png', apple: '/overlay.png', },
};

// Applied before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('overlay-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children, }: { children: React.ReactNode; }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>

      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <SiteFooter />
        <CookieConsent />
      </body>
    </html>
  );
}