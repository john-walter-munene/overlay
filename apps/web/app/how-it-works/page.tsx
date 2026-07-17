import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works · Overlay Bets',
  description:
    'How Overlay Bets keeps tipster records honest: every pick is hashed and locked before kickoff, settled automatically from the result, and ranked by verified yield and closing line value.',
};

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'A tipster posts a pick',
    body: 'They choose the event, market and selection, and record the odds they took.',
  },
  {
    n: '02',
    title: 'It’s locked before kickoff',
    body: 'The pick is hashed and timestamped the moment it’s submitted. It can never be edited, deleted or backdated — that’s the whole point.',
  },
  {
    n: '03',
    title: 'It settles automatically',
    body: 'When the match finishes, the pick is graded from the official result. We also capture the closing line to measure closing line value (CLV).',
  },
  {
    n: '04',
    title: 'They’re ranked by real edge',
    body: 'Verified yield and CLV — not follower counts or screenshots — decide where a tipster sits on the leaderboard.',
  },
];

export default function HowItWorksPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>How it works</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '1.05rem', lineHeight: 1.6 }}>
        Overlay Bets exists to make a tipster’s track record impossible to fake.
        Here’s the loop that keeps everyone honest.
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0' }}>
        {STEPS.map((s) => (
          <li
            key={s.n}
            style={{
              display: 'flex',
              gap: '1.1rem',
              padding: '1.1rem 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ color: 'var(--accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {s.n}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <p style={{ color: 'var(--muted)', margin: '0.25rem 0 0', lineHeight: 1.6 }}>
                {s.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <section style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.25rem' }}>
          Judged on more than a win rate
        </h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          A high strike rate is easy to cherry-pick over a short run. Overlay
          Bets judges tipsters on the numbers that survive variance — verified
          ROI and yield, closing line value, sample size and drawdowns —
          calculated only from settled, locked picks, never from screenshots or
          self-reported results.
        </p>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: '1rem 0 0' }}>
          Because every pick is recorded before kickoff and can’t be edited,
          removed or selectively hidden afterwards, losing runs stay visible
          too. The record you see is the complete one — which is exactly what
          makes it worth trusting.
        </p>
      </section>

      <section style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          Want the detail on verification, fees and payouts? See the{' '}
          <Link href="/support" style={{ color: 'var(--accent)' }}>
            Support Center
          </Link>
          , or{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            browse verified tipsters
          </Link>{' '}
          to see it in action.
        </p>
      </section>
    </main>
  );
}
