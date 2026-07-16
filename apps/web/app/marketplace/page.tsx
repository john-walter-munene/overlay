import Link from 'next/link';
import type { Metadata } from 'next';
import {
  listMarketplace,
  SITE_URL,
  type MarketplaceParams,
  type MarketplaceSort,
} from '../../lib/api';

// SEO metadata for the Marketplace page.
// This overrides the defaults from the root layout and helps search engines
// understand this specific page.
export const metadata: Metadata = {
  title: 'Verified Tipster Marketplace',
  description: 'Browse verified sports tipsters ranked by ROI, Closing Line Value (CLV), win rate and settled picks. Filter by sport, subscription price and performance to find your betting edge.',

  keywords: [
    'verified tipsters',
    'sports betting marketplace',
    'football tipsters',
    'basketball tipsters',
    'tennis tipsters',
    'sports picks',
    'ROI',
    'CLV',
    'closing line value',
    'betting analytics',
  ],

  alternates: {
    canonical: `${SITE_URL}/marketplace`,
  },

  openGraph: {
    title: 'Verified Tipster Marketplace | Overlay Bets',
    description:
      'Browse verified sports tipsters ranked by transparent ROI, Closing Line Value (CLV) and settled performance.',
    url: `${SITE_URL}/marketplace`,
    type: 'website',
    images: [
      {
        url: '/overlay.png',
        alt: 'Overlay Bets Marketplace',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Verified Tipster Marketplace | Overlay Bets',
    description:
      'Compare verified sports tipsters by ROI, CLV and settled betting performance.',
    images: ['/overlay.png'],
  },
};

export const revalidate = 60;

const SPORTS = ['soccer', 'basketball', 'tennis', 'baseball', 'hockey'];

const SORTS: { value: MarketplaceSort; label: string }[] = [
  { value: 'yield', label: 'Yield' },
  { value: 'clv', label: 'CLV' },
  { value: 'winRate', label: 'Win rate' },
];

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
  return `/marketplace?${qs.toString()}`;
}

export default async function MarketplacePage({
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
  const data = await listMarketplace(params);
  const activeSort = (searchParams.sort as MarketplaceSort) ?? 'yield';

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        Tipster Marketplace
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Verified tipsters only. Filter and sort by the metrics that matter —
        every record is locked before kickoff.
      </p>

      <form
        method="get" aria-label="Filter verified tipsters"
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

        <button
          type="submit"
          style={{
            ...inputStyle,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid var(--accent)',
          }}
        >
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
          <table aria-label="Verified tipster marketplace results"
            style={{ width: '100%', borderCollapse: 'collapse' }}>
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
            <nav aria-label="Marketplace pagination"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1.5rem',
              }}
            >
              {data.page > 1 ? (
                <Link
                  href={pageHref(params, data.page - 1)}
                  style={{ color: 'var(--accent)' }}
                >
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              {data.page < data.totalPages ? (
                <Link
                  href={pageHref(params, data.page + 1)}
                  style={{ color: 'var(--accent)' }}
                >
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}