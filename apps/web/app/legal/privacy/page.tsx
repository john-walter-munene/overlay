import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Overlay Bets',
  description:
    'How Overlay Bets collects, uses and protects your personal data, including cookies and consent choices.',
  alternates: { canonical: '/legal/privacy' },
};

const UPDATED = 'July 14, 2026';

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        Privacy Policy
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Last updated: {UPDATED}</p>

      <div style={{ color: 'var(--fg)', lineHeight: 1.7 }}>
        <p>
          This Privacy Policy explains what personal data Overlay Bets (the
          &ldquo;Service&rdquo;) collects, how we use it, and the choices you
          have. It applies alongside our{' '}
          <Link href="/legal/terms" style={{ color: 'var(--accent)' }}>
            Terms of Service
          </Link>
          .
        </p>

        <h2>1. Data we collect</h2>
        <p>
          We collect the information you provide when you create an account
          (such as your email address and role), profile and tipster details you
          choose to publish, subscription and payment metadata handled by our
          payment processor, and technical data such as log and device
          information needed to operate and secure the Service.
        </p>

        <h2>2. How we use your data</h2>
        <p>
          We use your data to provide and improve the Service, authenticate you,
          process subscriptions, rank tipsters by verified performance,
          communicate with you, and comply with legal obligations.
        </p>

        <h2>3. Cookies and consent</h2>
        <p>
          We use strictly necessary cookies and similar technologies to keep you
          signed in and to operate the Service. With your consent, we may also
          use non-essential cookies for analytics and preferences. When you first
          visit, a banner lets you accept or reject non-essential cookies, and we
          remember your choice on your device so we do not ask again unless our
          policy changes. You can change your choice at any time by clearing your
          browser storage for this site.
        </p>

        <h2>4. Sharing</h2>
        <p>
          We share data only with service providers who help us run the platform
          (for example authentication and payment processors) under appropriate
          safeguards, or where required by law. We do not sell your personal
          data.
        </p>

        <h2>5. Data retention</h2>
        <p>
          We keep personal data for as long as your account is active or as
          needed to provide the Service and meet legal obligations, after which
          it is deleted or anonymised.
        </p>

        <h2>6. Your rights</h2>
        <p>
          Depending on your location, you may have the right to access, correct,
          export or delete your personal data, and to object to or restrict
          certain processing. To exercise these rights, contact us using the
          details below.
        </p>

        <h2>7. Security</h2>
        <p>
          We use reasonable technical and organisational measures to protect your
          data. No method of transmission or storage is completely secure, so we
          cannot guarantee absolute security.
        </p>

        <h2>8. Contact</h2>
        <p>
          For privacy questions or requests, email{' '}
          <a href="mailto:privacy@overlaybets.com" style={{ color: 'var(--accent)' }}>
            privacy@overlaybets.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
