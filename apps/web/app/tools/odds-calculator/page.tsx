import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import OddsCalculator from './OddsCalculator';

export const metadata: Metadata = {
  title: 'Odds Converter & Bet Returns Calculator — Overlay Bets',
  description:
    'Free odds calculator: convert decimal, fractional, American and implied-probability odds, and work out potential returns and profit from your stake in any currency.',
  alternates: { canonical: '/tools/odds-calculator' },
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
