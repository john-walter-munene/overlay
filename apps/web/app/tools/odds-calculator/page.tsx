import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import OddsCalculator from './OddsCalculator';

// SEO metadata for the Odds Calculator page.
// Utility pages are valuable for search traffic, so this page includes
// richer metadata than the site defaults.
export const metadata: Metadata = {
  title: 'Odds Calculator & Odds Converter',
  description: 'Free sports betting odds calculator. Convert decimal, fractional, American and implied probability odds, then calculate stake, potential returns, profit and implied probability instantly.',

  keywords: [
    'odds calculator',
    'bet calculator',
    'odds converter',
    'decimal odds',
    'fractional odds',
    'american odds',
    'implied probability',
    'sports betting calculator',
    'betting odds',
    'Overlay Bets',
  ],
  alternates: { canonical: '/tools/odds-calculator', },
  openGraph: {
    title: 'Free Odds Calculator | Overlay Bets',
    description:
      'Convert betting odds and calculate potential returns, profit and implied probability instantly.',
    url: '/tools/odds-calculator',
    type: 'website',
    images: [
      {
        url: '/overlay.png',
        alt: 'Overlay Bets Odds Calculator',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Free Odds Calculator | Overlay Bets',
    description:
      'Convert betting odds and calculate returns instantly.',
    images: ['/overlay.png'],
  },
};

export default function OddsCalculatorPage() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        Odds &amp; bet calculator
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 640 }}>
        Convert odds between every common format and calculate your potential
        returns and profit. Everything runs in your browser — nothing you type
        is sent anywhere.
      </p>

      <Suspense
        fallback={<p style={{ color: 'var(--muted)' }}>Loading calculator…</p>}
      >
        <OddsCalculator />
      </Suspense>
    </main>
  );
}