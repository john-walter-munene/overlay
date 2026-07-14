import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Responsible Gambling — Overlay Bets',
  description:
    'Responsible-gambling guidance and support resources. Overlay Bets is an information and analytics service only — we take no bets and accept no wagers.',
  alternates: { canonical: '/legal/responsible-gambling' },
};

const UPDATED = 'July 14, 2026';

/** A responsible-gambling support organisation and where it operates. */
const RESOURCES: { name: string; region: string; url: string }[] = [
  {
    name: 'BeGambleAware',
    region: 'United Kingdom',
    url: 'https://www.begambleaware.org/',
  },
  {
    name: 'GamCare (National Gambling Helpline)',
    region: 'United Kingdom',
    url: 'https://www.gamcare.org.uk/',
  },
  {
    name: 'National Council on Problem Gambling',
    region: 'United States',
    url: 'https://www.ncpgambling.org/',
  },
  {
    name: 'Gambling Therapy',
    region: 'International',
    url: 'https://www.gamblingtherapy.org/',
  },
  {
    name: 'Gamblers Anonymous',
    region: 'International',
    url: 'https://www.gamblersanonymous.org/',
  },
];

export default function ResponsibleGamblingPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        Responsible Gambling
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Last updated: {UPDATED}
      </p>

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
          18+. Gambling can be addictive — please play responsibly.
        </strong>
        <p style={{ color: 'var(--fg)', margin: '0.5rem 0 0' }}>
          Overlay Bets is an information, analytics and tipster-marketplace
          service. We do not accept, place, broker or settle wagers of any kind.
          If you choose to bet with a third-party operator, only stake what you
          can afford to lose.
        </p>
      </section>

      <div style={{ color: 'var(--fg)', lineHeight: 1.7 }}>
        <h2>Stay in control</h2>
        <ul>
          <li>Only gamble with money you can afford to lose.</li>
          <li>Set time and money limits before you start, and stick to them.</li>
          <li>Never chase losses or bet to escape stress or boredom.</li>
          <li>Don&apos;t gamble under the influence of alcohol or drugs.</li>
          <li>Take regular breaks and keep gambling a small part of your life.</li>
        </ul>

        <h2>Signs it may be a problem</h2>
        <p>
          Gambling more than you intended, borrowing money to bet, hiding your
          betting from others, or feeling anxious or irritable when you try to
          stop can all be signs of harm. If any of these sound familiar, help is
          available and confidential.
        </p>

        <h2>Where to get help</h2>
        <p>
          The organisations below offer free, confidential support, advice and
          self-exclusion tools. Many operate 24/7.
        </p>
        <ul>
          {RESOURCES.map((resource) => (
            <li key={resource.url}>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                {resource.name}
              </a>{' '}
              <span style={{ color: 'var(--muted)' }}>— {resource.region}</span>
            </li>
          ))}
        </ul>

        <h2>Self-exclusion and blocking tools</h2>
        <p>
          If you want to take a break, you can use self-exclusion schemes and
          blocking software such as{' '}
          <a
            href="https://www.gamstop.co.uk/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            GAMSTOP
          </a>{' '}
          (UK) or{' '}
          <a
            href="https://www.gamban.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            Gamban
          </a>
          . See also our{' '}
          <Link href="/legal/terms" style={{ color: 'var(--accent)' }}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" style={{ color: 'var(--accent)' }}>
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
