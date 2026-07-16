import type { Metadata } from 'next';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const metadata: Metadata = {
  title: 'Verified Tipster Marketplace',

  description:
    'Discover verified sports tipsters with transparent ROI, Closing Line Value (CLV), and immutable pre-match picks. Browse the marketplace, compare performance, and find your betting edge.',

  keywords: [
    'verified sports tipsters',
    'sports betting',
    'betting marketplace',
    'football predictions',
    'sports picks',
    'ROI',
    'closing line value',
    'CLV',
  ],

  alternates: {
    canonical: '/',
  },

  openGraph: {
    title: 'Overlay Bets — Verified Tipster Marketplace',
    description:
      'Discover verified sports tipsters ranked by transparent ROI, Closing Line Value (CLV), and immutable pre-match picks.',
    url: '/',
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
    title: 'Overlay Bets — Verified Tipster Marketplace',
    description:
      'Find the overlay. Beat the close. Verified sports tipsters with transparent performance.',
    images: ['/overlay.png'],
  },
};

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

export default async function Home() {
  const rows = await getLeaderboard();

  // Structured data helps search engines understand the website and
  // improves eligibility for rich search results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Overlay Bets',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    description:
      'Verified sports tipster marketplace with transparent ROI, Closing Line Value (CLV), and immutable pre-match picks.',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontSize: '2.4rem', marginBottom: '0.25rem' }}>
          Overlay Bets
        </h1>

        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Find the overlay. Beat the close. Verified edge, not screenshots.
        </p>

        <p style={{ marginTop: '0.5rem' }}>
          <Link href="/marketplace" style={{ color: 'var(--accent)' }}>
            Browse the tipster marketplace →
          </Link>
        </p>

        <p style={{ marginTop: '0.5rem' }}>
          <Link href="/blog" style={{ color: 'var(--accent)' }}>
            Read the strategy blog →
          </Link>
        </p>

        <h2 style={{ marginTop: '2.5rem' }}>Leaderboard</h2>

        {rows.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            No verified tipsters yet. Once tipsters reach 50+ settled picks they
            appear here, ranked by verified yield and closing line value.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '0.5rem 0' }}>Tipster</th>
                <th>Yield</th>
                <th>CLV</th>
                <th>Win %</th>
                <th>Picks</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.tipsterId}
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <td style={{ padding: '0.5rem 0' }}>
                    <Link
                      href={`/tipsters/${r.tipsterId}`}
                      style={{ color: 'var(--accent)' }}
                    >
                      {r.tipsterId}
                    </Link>
                  </td>

                  <td>{r.yield.toFixed(1)}%</td>
                  <td>{(r.clvAvg * 100).toFixed(2)}%</td>
                  <td>{(r.winRate * 100).toFixed(0)}%</td>
                  <td>{r.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}