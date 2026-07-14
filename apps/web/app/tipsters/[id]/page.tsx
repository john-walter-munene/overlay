import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTipster, SITE_URL } from '../../../lib/api';
import SubscribeButton from '../../SubscribeButton';

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
      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
    </div>
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

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Leaderboard
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        {t.tipsterId}
      </h1>
      {t.bio ? <p style={{ color: 'var(--fg)' }}>{t.bio}</p> : null}
      {t.sports.length ? (
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t.sports.join(' · ')}</p>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          margin: '1.5rem 0',
          padding: '1.25rem',
          border: '1px solid var(--border)',
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
          <p style={{ gridColumn: '1 / -1', color: 'var(--muted)', margin: 0 }}>
            Not enough settled picks yet to publish verified stats.
          </p>
        )}
      </section>

      <div style={{ margin: '1.5rem 0' }}>
        <SubscribeButton
          tipsterId={t.tipsterId}
          priceCents={t.subscriptionPriceCents}
        />
      </div>

      <h2 style={{ marginTop: '2rem' }}>Recent settled picks</h2>
      {t.recentPicks.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No settled picks yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '0.5rem 0' }}>Selection</th>
              <th>Market</th>
              <th>Odds</th>
              <th>CLV</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {t.recentPicks.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
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
    </main>
  );
}
