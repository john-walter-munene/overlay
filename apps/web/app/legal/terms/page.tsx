import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Overlay Bets',
  description:
    'The terms governing your use of Overlay Bets. Overlay Bets is an information and analytics service only — we take no bets and accept no wagers.',
  alternates: { canonical: '/legal/terms' },
};

const UPDATED = 'July 14, 2026';

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        Terms of Service
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Last updated: {UPDATED}</p>

      <section
        style={{
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          borderRadius: 10,
          padding: '1rem 1.25rem',
          margin: '1.5rem 0',
        }}
      >
        <strong style={{ color: 'var(--warning)' }}>
          Information only — we take no bets.
        </strong>
        <p style={{ color: 'var(--fg)', margin: '0.5rem 0 0' }}>
          Overlay Bets is an information, analytics and tipster-marketplace
          service. We do not accept, place, broker or settle wagers of any kind,
          we do not hold betting stakes, and we are not a bookmaker, sportsbook
          or gambling operator. Nothing on this platform is a solicitation to
          gamble or a guarantee of any outcome or profit.
        </p>
      </section>

      <div style={{ color: 'var(--fg)', lineHeight: 1.7 }}>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By accessing or using Overlay Bets (the &ldquo;Service&rdquo;), you
          agree to be bound by these Terms of Service and by our{' '}
          <Link href="/legal/privacy" style={{ color: 'var(--accent)' }}>
            Privacy Policy
          </Link>
          . If you do not agree, do not use the Service.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be of legal age in your jurisdiction and permitted to use a
          sports-information service where you live. You are responsible for
          ensuring your use of the Service is lawful in your location.
        </p>

        <h2>3. Nature of the Service</h2>
        <p>
          Overlay Bets ranks tipsters by verified performance and lets users
          subscribe to their picks and analysis. All picks, ratings, statistics
          and commentary are provided for informational and entertainment
          purposes only. They are opinions and analysis, not financial, betting
          or investment advice, and they do not guarantee any result. Any
          decision you make based on the Service is made solely at your own risk.
        </p>

        <h2>4. No wagering</h2>
        <p>
          The Service does not facilitate gambling. We take no bets, hold no
          stakes, and pay out no winnings. Subscription payments are for access
          to information and analytics only. If you choose to bet with a
          third-party operator, that activity is entirely between you and that
          operator and is outside the scope of the Service.
        </p>

        <h2>5. Accounts and subscriptions</h2>
        <p>
          You are responsible for keeping your account credentials secure and
          for all activity under your account. Paid subscriptions are billed
          through our payment processor. Fees, renewal and cancellation terms are
          shown at the point of purchase.
        </p>

        <h2>6. Acceptable use</h2>
        <p>
          You agree not to misuse the Service, including by scraping, reselling
          data without permission, attempting to disrupt the platform, or using
          it for any unlawful purpose.
        </p>

        <h2>7. Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any
          kind. To the fullest extent permitted by law, Overlay Bets is not
          liable for any losses — including gambling losses — arising from your
          use of, or reliance on, the Service.
        </p>

        <h2>8. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the
          Service after changes take effect constitutes acceptance of the
          updated terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a href="mailto:legal@overlaybets.com" style={{ color: 'var(--accent)' }}>
            legal@overlaybets.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
