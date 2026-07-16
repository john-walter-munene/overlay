import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Overlay Bets — Verified tipsters, ranked by real edge',
  description:
    'Find the overlay. Beat the close. Tipsters ranked by verified ROI and closing line value — every pick cryptographically locked before kickoff.',
};

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', lineHeight: 1.2, margin: '0 0 1.1rem', fontWeight: 600 }}>
        Find the overlay. Beat the close.
      </h1>

      <p style={{ fontSize: '1.05rem', lineHeight: 1.65, margin: '0 0 1.1rem' }}>
        Overlay Bets is where sports tipsters build a track record they can’t
        fake. Every pick is locked and timestamped the moment it’s posted —
        before kickoff — then settled automatically from the results. What you
        see is the real record: closing line value, drawdowns and all.
      </p>

      <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 2rem' }}>
        Browse tipsters ranked by verified yield, follow the ones genuinely
        beating the market, or just check today’s free tips.
      </p>

      <p style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center', margin: '0 0 2.5rem' }}>
        <Link href="/tipsters" className="btn btn--primary btn--lg">
          Browse tipsters
        </Link>
        <Link href="/tips" style={{ color: 'var(--accent)' }}>
          Today’s free tips →
        </Link>
      </p>

      <p style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', margin: 0 }}>
        Run your own picks?{' '}
        <Link href="/signup" style={{ color: 'var(--accent)' }}>
          Create an account
        </Link>{' '}
        to start building a verified record and get paid by subscribers.
      </p>
    </main>
  );
}
