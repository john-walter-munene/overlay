import Link from 'next/link';
import type { Metadata } from 'next';
import {
  listMarketplace,
  SITE_URL,
  API_URL,
  type MarketplaceParams,
  type MarketplaceSort,
} from '../../lib/api';

export const metadata: Metadata = {
  title: 'Tipsters — Verified edge, ranked · Overlay Bets',
  description:
    'Browse verified sports tipsters and see the leaderboard. Filter by sport, price and settled sample; sort by yield, closing line value or win rate. Every record is cryptographically locked before kickoff.',
  alternates: { canonical: `${SITE_URL}/tipsters` },
};

export const revalidate = 60;

const SPORTS = ['soccer', 'basketball', 'tennis', 'baseball', 'hockey'];

const SORTS: { value: MarketplaceSort; label: string }[] = [
  { value: 'yield', label: 'Yield' },
  { value: 'clv', label: 'CLV' },
  { value: 'winRate', label: 'Win rate' },
];

interface LeaderboardRow {
  tipsterId: string;
  yield: number;
  clvAvg: number;
  winRate: number;
  sampleSize: number;
}

async function getLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return (await res.json()) as LeaderboardRow[];
  } catch {
    return [];
  }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.45rem 0.6rem',
  fontSize: '0.9rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  color: 'var(--muted)',
  fontSize: '0.8rem',
};

function pageHref(base: MarketplaceParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  qs.set('page', String(page));
  return `/tipsters?${qs.toString()}`;
}

export default async function TipstersPage({
  searchParams,
}: {
  searchParams: MarketplaceParams;
}) {
  const params: MarketplaceParams = {
    sport: searchParams.sport,
    maxPrice: searchParams.maxPrice,
    minSample: searchParams.minSample,
    sort: searchParams.sort,
    page: searchParams.page,
  };
  const [data, leaderboard] = await Promise.all([
    listMarketplace(params),
    getLeaderboard(),
  ]);
  const activeSort = (searchParams.sort as MarketplaceSort) ?? 'yield';
  const topTipsters = leaderboard.slice(0, 8);

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>Tipsters</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 640 }}>
        Verified tipsters only. Filter and sort by the metrics that matter —
        every record is locked before kickoff.
      </p>

      <div className="tipsters-layout">
        <div>
          <form
            method="get"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'flex-end',
              margin: '1.75rem 0',
              padding: '1.25rem',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <label style={labelStyle}>
              Sport
              <select name="sport" defaultValue={searchParams.sport ?? ''} style={inputStyle}>
                <option value="">All sports</option>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Max price (¢/mo)
              <input
                type="number"
                name="maxPrice"
                min={0}
                placeholder="Any"
                defaultValue={searchParams.maxPrice ?? ''}
                style={{ ...inputStyle, width: 120 }}
              />
            </label>

            <label style={labelStyle}>
              Min sample
              <input
                type="number"
                name="minSample"
                min={0}
                placeholder="10"
                defaultValue={searchParams.minSample ?? ''}
                style={{ ...inputStyle, width: 110 }}
              />
            </label>

            <label style={labelStyle}>
              Sort by
              <select name="sort" defaultValue={activeSort} style={inputStyle}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="btn btn--primary">
              Apply
            </button>
          </form>

          {data.items.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              No verified tipsters match these filters yet. Try widening your
              filters — tipsters appear here once they reach the minimum settled
              sample, ranked by verified yield and closing line value.
            </p>
          ) : (
            <>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                {data.total} verified tipster{data.total === 1 ? '' : 's'} · page{' '}
                {data.page} of {data.totalPages}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '0.5rem 0' }}>Tipster</th>
                    <th>Sports</th>
                    <th>Yield</th>
                    <th>CLV</th>
                    <th>Win %</th>
                    <th>Picks</th>
                    <th>Price/mo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.tipsterId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 0' }}>
                        <Link
                          href={`/tipsters/${r.tipsterId}`}
                          style={{ color: 'var(--accent)' }}
                        >
                          {r.tipsterId}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {r.sports.length ? r.sports.join(', ') : '—'}
                      </td>
                      <td>{r.yield.toFixed(1)}%</td>
                      <td>{(r.clvAvg * 100).toFixed(2)}%</td>
                      <td>{(r.winRate * 100).toFixed(0)}%</td>
                      <td>{r.sampleSize}</td>
                      <td>
                        {r.subscriptionPriceCents > 0
                          ? `$${(r.subscriptionPriceCents / 100).toFixed(2)}`
                          : 'Free'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data.totalPages > 1 ? (
                <nav
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '1.5rem',
                  }}
                >
                  {data.page > 1 ? (
                    <Link href={pageHref(params, data.page - 1)} className="btn btn--secondary btn--sm">
                      ← Previous
                    </Link>
                  ) : (
                    <span />
                  )}
                  {data.page < data.totalPages ? (
                    <Link href={pageHref(params, data.page + 1)} className="btn btn--secondary btn--sm">
                      Next →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </div>

        <aside className="tipsters-aside">
          <div className="panel">
            <h2>Leaderboard</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0 0 0.9rem' }}>
              Top verified tipsters by yield.
            </p>
            {topTipsters.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                No ranked tipsters yet. Records appear once tipsters reach the
                minimum settled sample.
              </p>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {topTipsters.map((r, i) => (
                  <li
                    key={r.tipsterId}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flex: '0 0 auto',
                        width: 22,
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        background: i < 3 ? 'var(--accent)' : 'var(--surface-2)',
                        color: i < 3 ? 'var(--on-accent)' : 'var(--muted)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                    <Link
                      href={`/tipsters/${r.tipsterId}`}
                      style={{ color: 'var(--fg)', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.tipsterId}
                    </Link>
                    <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
                      {r.yield.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
