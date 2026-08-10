import './globals.css';
import 'flag-icons/css/flag-icons.min.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import CookieConsent from './CookieConsent';
import UsernameGate from './UsernameGate';
import WhatsAppFloat from './WhatsAppFloat';
import FollowProvider from './FollowProvider';

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: 'Overlay Picks — Verified tipster platform',
  description:
    'Find the overlay. Beat the close. Tipsters ranked by verified ROI and closing line value — picks locked before kickoff.',
  openGraph: {
    type: 'website',
    siteName: 'Overlay Picks',
    title: 'Overlay Picks — Verified tipster platform',
    description:
      'Find the overlay. Beat the close. Tipsters ranked by verified ROI and closing line value — picks locked before kickoff.',
    images: [{ url: '/logo-full.png', width: 1200, height: 630, alt: 'Overlay Picks' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Overlay Picks — Verified tipster platform',
    description:
      'Find the overlay. Beat the close. Tipsters ranked by verified ROI and closing line value.',
    images: ['/logo-full.png'],
  },
};

export const viewport = {
  themeColor: '#0c0b0a',
};

// Applied before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('overlay-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <SiteHeader />
          <div id="main-content" tabIndex={-1}>
            <FollowProvider>{children}</FollowProvider>
          </div>
          <SiteFooter />
          <CookieConsent />
          <UsernameGate />
          <WhatsAppFloat />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
