import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Us & How It Works',

  description:
    'Overlay Bets is a verified tipster marketplace built on trust: locked and hashed picks, verified settled stats and Closing Line Value (CLV). Learn how bettors find tipsters and how tipsters get verified and paid.',

  keywords: [
    'about overlay bets',
    'verified tipsters',
    'sports betting analytics',
    'closing line value',
    'CLV',
    'ROI',
    'sports picks',
    'tipster marketplace',
  ],

  alternates: {
    canonical: '/about',
  },

  openGraph: {
    title: 'About Overlay Bets',
    description:
      'Learn how Overlay Bets verifies sports tipsters through immutable picks, transparent ROI, and Closing Line Value (CLV).',
    url: '/about',
    type: 'website',
    images: [
      {
        url: '/overlay.png',
        alt: 'Overlay Bets',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'About Overlay Bets',
    description:
      'Learn how Overlay Bets verifies sports tipsters through immutable picks and transparent performance.',
    images: ['/overlay.png'],
  },
};

/** A single step in one of the "How It Works" tracks. */
const BETTOR_STEPS: { title: string; body: string }[] = [
  {
    title: 'Browse verified tipsters',
    body: 'Explore the marketplace and leaderboard ranked by verified, settled performance — not marketing claims or cherry-picked screenshots.',
  },
  {
    title: 'Check the proof',
    body: 'Every profile shows independently settled results, hit rate and closing-line value (CLV) over time, so you can judge a tipster on evidence before you pay anything.',
  },
  {
    title: 'Subscribe and follow',
    body: 'Subscribe to the tipsters you trust to unlock their live picks the moment they are published — timestamped and locked so nothing can be edited after the fact.',
  },
];

const TIPSTER_STEPS: { title: string; body: string }[] = [
  {
    title: 'Get verified',
    body: 'Complete identity verification and connect a payout account. Verification gates publishing, so subscribers know a real, accountable person is behind every pick.',
  },
  {
    title: 'Publish locked picks',
    body: 'When you post a pick it is hashed and timestamped at publication. The locked record is what gets graded — building a track record you cannot rewrite.',
  },
  {
    title: 'Build a track record',
    body: 'Picks are settled against real results and your stats — win rate, ROI and CLV — update automatically. Honest, consistent tipsters rise on the leaderboard.',
  },
  {
    title: 'Get paid',
    body: 'Earn from subscriptions to your picks, with transparent payouts handled through our billing partner.',
  },
];

/** How each part of the trust model protects bettors. */
const TRUST_PILLARS: { title: string; body: string }[] = [
  {
    title: 'Locked & hashed picks',
    body: 'Each pick is cryptographically hashed and timestamped at the moment it is published. That proof means a pick cannot be quietly changed, deleted or back-dated — what you see is exactly what was called.',
  },
  {
    title: 'Verified settled stats',
    body: 'Results are settled against real-world outcomes by us, not self-reported by tipsters. Hit rate, ROI and profit are computed from that verified history so the numbers you see are the numbers that happened.',
  },
  {
    title: 'Closing-line value (CLV)',
    body: 'We track how each pick priced up versus the closing line — the single best long-run indicator of skill. Consistent positive CLV is hard to fake and shows a tipster is genuinely finding an edge.',
  },
  {
    title: 'Identity verification',
    body: 'Tipsters must pass identity verification before they can publish. Accountability sits behind every pick, and picks are gated until a tipster is fully verified.',
  },
];

const cardStyle = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 10,
  padding: '1rem 1.25rem',
} as const;

export default function AboutPage() {
  // Structured data helps search engines understand the purpose of this page.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'About Overlay Bets',
    description:
      'Learn how Overlay Bets verifies sports tipsters using immutable picks, verified statistics, and Closing Line Value.',
    url: `${
      process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    }/about`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ margin: 0 }}>
          <Link href="/" style={{ color: 'var(--accent)' }}>
            ← Overlay Bets
          </Link>
        </p>

        <h1 style={{ fontSize: '2.3rem', marginBottom: '0.25rem' }}>
          About Overlay Bets
        </h1>

        <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '1.05rem' }}>
          A verified tipster marketplace built on proof, not promises.
        </p>

        <div style={{ color: 'var(--fg)', lineHeight: 1.7 }}>
          <h2>Our mission</h2>

          <p>
            Sports betting is drowning in noise — screenshots, deleted losers and
            &ldquo;100% verified&rdquo; claims nobody can check. Overlay Bets
            exists to fix that. We give bettors an honest, evidence-first way to
            find genuinely skilled tipsters, and we give skilled tipsters a place
            where a real track record actually gets rewarded.
          </p>

          <p>
            Trust is the entire product. Everything below explains exactly how we
            earn it and how you can verify it for yourself.
          </p>

          <h2>How it works — for bettors</h2>

          <ol style={{ paddingLeft: '1.1rem' }}>
            {BETTOR_STEPS.map((step) => (
              <li key={step.title} style={{ marginBottom: '0.75rem' }}>
                <strong>{step.title}.</strong> {step.body}
              </li>
            ))}
          </ol>

          <h2>How it works — for tipsters</h2>

          <ol style={{ paddingLeft: '1.1rem' }}>
            {TIPSTER_STEPS.map((step) => (
              <li key={step.title} style={{ marginBottom: '0.75rem' }}>
                <strong>{step.title}.</strong> {step.body}
              </li>
            ))}
          </ol>

          <h2>Why you can trust the numbers</h2>

          <p>
            This is where we want to win. Our trust model is designed so that a
            tipster&apos;s record cannot be inflated, edited or cherry-picked
            after the fact.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
              margin: '1.25rem 0',
            }}
          >
            {TRUST_PILLARS.map((pillar) => (
              <section key={pillar.title} style={cardStyle}>
                <strong style={{ color: 'var(--accent)' }}>{pillar.title}</strong>

                <p style={{ margin: '0.4rem 0 0' }}>{pillar.body}</p>
              </section>
            ))}
          </div>

          <p>
            Want to see it in action? Browse the{' '}
            <Link href="/marketplace" style={{ color: 'var(--accent)' }}>
              marketplace
            </Link>{' '}
            or open any tipster profile to inspect their settled picks and CLV
            history yourself.
          </p>

          <section
            style={{
              ...cardStyle,
              margin: '2rem 0 0',
            }}
          >
            <strong style={{ color: 'var(--warning)' }}>
              Information only — please gamble responsibly.
            </strong>

            <p style={{ margin: '0.5rem 0 0' }}>
              Overlay Bets is a sports-information, analytics and
              tipster-marketplace service. We take no bets, hold no stakes and are
              not a bookmaker. Picks and stats are for informational purposes only
              and are not betting or financial advice. 18+. If you choose to bet,
              only stake what you can afford to lose — see our{' '}
              <Link
                href="/legal/responsible-gambling"
                style={{ color: 'var(--accent)' }}
              >
                Responsible Gambling
              </Link>{' '}
              resources.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}