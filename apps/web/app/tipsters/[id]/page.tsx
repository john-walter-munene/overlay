import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildClvChart } from '@overlay/shared/tipster-profile';
import { getTipster, SITE_URL } from '../../../lib/api';
import LivePicks from './LivePicks';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const t = await getTipster(params.id);
  if (!t) return { title: 'Tipster not found — Overlay Bets' };
  const y = t.stats ? `${t.stats.yield.toFixed(1)}% yield` : 'verified picks';
  return {
    title: `${t.tipsterId} — ${y} · Overlay Bets`,
    description:
      t.bio ??
      `Verified betting record for ${t.tipsterId}: ROI, closing line value and settled picks — all cryptographically locked before kickoff.`,
    alternates: { canonical: `${SITE_URL}/tipsters/${t.tipsterId}` },
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#9aa4b2', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/**
 * Public "CLV over time" chart (OB-011): a dependency-free SVG line of the
 * tipster's cumulative-average closing-line value across their settled picks.
 * `points` are percentages produced by the shared, unit-tested buildClvChart.
 */
function ClvChart({ points }: { points: number[] }) {
  const w = 100;
  const h = 40;
  const pad = 2;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) =>
    points.length <= 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2);
  const zeroY = y(0);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 64, display: 'block' }}
      role="img"
      aria-label="Cumulative average closing-line value over time"
    >
      {min < 0 && max > 0 ? (
        <line
          x1={0}
          x2={w}
          y1={zeroY}
          y2={zeroY}
          stroke="#1c2430"
          strokeWidth={0.5}
        />
      ) : null}
      {points.length === 1 ? (
        <circle cx={x(0)} cy={y(points[0])} r={1.5} fill="#a371f7" />
      ) : (
        <polyline
          points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="#a371f7"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/**
 * "How verification works" explainer (OB-011): plain-language walk-through of
 * the hash + server-timestamp integrity guarantee that backs every pick.
 */
function VerificationExplainer() {
  return (
    <section
      aria-labelledby="verify-heading"
      style={{
        marginTop: '2.5rem',
        padding: '1.25rem',
        border: '1px solid #1c2430',
        borderRadius: 12,
      }}
    >
      <h2 id="verify-heading" style={{ marginTop: 0 }}>
        How verification works
      </h2>
      <p style={{ color: '#c7cdd6' }}>
        Every pick is locked before the event starts, so a tipster can never
        edit a selection, odds or stake after the fact.
      </p>
      <ol style={{ color: '#c7cdd6', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
        <li>
          <strong>Hashed at lock time.</strong> When a pick is submitted we
          compute a SHA-256 hash over its canonical fields (selection, market,
          odds and stake) plus a secret server pepper. That hash is stored and
          never changed.
        </li>
        <li>
          <strong>Server timestamp.</strong> The lock time is stamped by our
          server, not the tipster’s device, and picks on events that have
          already started are rejected — proving the call came in pre-kickoff.
        </li>
        <li>
          <strong>Tamper-evident.</strong> Because the hash depends on the exact
          pick, any later change would produce a different hash and fail
          verification. The original hash and timestamp are written to an
          append-only audit log.
        </li>
        <li>
          <strong>Graded transparently.</strong> After the event we record the
          closing odds and settle the pick, so the closing-line value (CLV) and
          results you see above are computed from locked, verifiable data.
        </li>
      </ol>
    </section>
  );
}

export default async function TipsterPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTipster(params.id);
  if (!t) notFound();
  const s = t.stats;
  const clv = buildClvChart(t.recentPicks);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: '#6ea8fe' }}>
          ← Leaderboard
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        {t.tipsterId}
      </h1>
      {t.bio ? <p style={{ color: '#c7cdd6' }}>{t.bio}</p> : null}
      {t.sports.length ? (
        <p style={{ color: '#9aa4b2', marginTop: 0 }}>{t.sports.join(' · ')}</p>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          margin: '1.5rem 0',
          padding: '1.25rem',
          border: '1px solid #1c2430',
          borderRadius: 12,
        }}
      >
        {s ? (
          <>
            <Stat label="Yield" value={`${s.yield.toFixed(1)}%`} />
            <Stat label="CLV" value={`${(s.clvAvg * 100).toFixed(2)}%`} />
            <Stat label="Win rate" value={`${(s.winRate * 100).toFixed(0)}%`} />
            <Stat label="Picks" value={`${s.sampleSize}`} />
          </>
        ) : (
          <p style={{ gridColumn: '1 / -1', color: '#9aa4b2', margin: 0 }}>
            Not enough settled picks yet to publish verified stats.
          </p>
        )}
      </section>

      {clv.sampleSize > 0 ? (
        <section style={{ marginTop: '2rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <h2 style={{ margin: 0 }}>Closing line value</h2>
            <span style={{ fontWeight: 600 }}>
              {clv.averagePct >= 0 ? '+' : ''}
              {clv.averagePct.toFixed(2)}% avg
            </span>
          </div>
          <p style={{ color: '#9aa4b2', marginTop: '0.25rem' }}>
            Cumulative average CLV across {clv.sampleSize} settled pick
            {clv.sampleSize === 1 ? '' : 's'}. Positive CLV means beating the
            closing line — the strongest long-run signal of skill.
          </p>
          <div
            style={{
              padding: '1rem',
              border: '1px solid #1c2430',
              borderRadius: 12,
            }}
          >
            <ClvChart points={clv.points} />
          </div>
        </section>
      ) : null}

      <div style={{ margin: '1.5rem 0' }}>
        <LivePicks
          tipsterId={t.tipsterId}
          priceCents={t.subscriptionPriceCents}
        />
      </div>

      <h2 style={{ marginTop: '2rem' }}>Recent settled picks</h2>
      {t.recentPicks.length === 0 ? (
        <p style={{ color: '#9aa4b2' }}>No settled picks yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#9aa4b2' }}>
              <th style={{ padding: '0.5rem 0' }}>Selection</th>
              <th>Market</th>
              <th>Odds</th>
              <th>CLV</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {t.recentPicks.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid #1c2430' }}>
                <td style={{ padding: '0.5rem 0' }}>{p.selection}</td>
                <td>{p.market}</td>
                <td>{p.oddsAtPick.toFixed(2)}</td>
                <td>
                  {p.clv != null ? `${(p.clv * 100).toFixed(1)}%` : '—'}
                </td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <VerificationExplainer />
    </main>
  );
}
