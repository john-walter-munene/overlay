import Link from 'next/link';
import type { Metadata } from 'next';
import { listArticles } from '../../lib/api';

// SEO metadata for the Strategy Blog.
// Provides richer metadata for search engines and social sharing.
export const metadata: Metadata = {
  title: 'Sports Betting Strategy Blog',

  description:
    'Learn sports betting strategy with guides on Closing Line Value (CLV), Expected Value (EV), bankroll management, betting psychology and finding profitable betting opportunities.',

  keywords: [
    'sports betting blog',
    'betting strategy',
    'closing line value',
    'CLV',
    'expected value',
    'EV betting',
    'bankroll management',
    'sports betting guides',
    'betting education',
    'Overlay Bets',
  ],

  alternates: {
    canonical: '/blog',
  },

  openGraph: {
    title: 'Sports Betting Strategy Blog | Overlay Bets',
    description:
      'Guides on Closing Line Value (CLV), Expected Value (EV), bankroll management and profitable sports betting.',
    url: '/blog',
    type: 'website',
    images: [
      {
        url: '/overlay.png',
        alt: 'Overlay Bets Strategy Blog',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Sports Betting Strategy Blog | Overlay Bets',
    description:
      'Sports betting strategy guides covering CLV, EV, bankroll management and profitable betting.',
    images: ['/overlay.png'],
  },
};

export const revalidate = 300;

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  const tag = searchParams?.tag;
  const articles = await listArticles(tag);

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        Strategy Blog{tag ? `: ${tag}` : ''}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Closing line value, expected value, bankroll math — the concepts behind
        a verified edge.
      </p>

      {articles.length === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: '2rem' }}>
          No articles published yet. Check back soon.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '2rem' }}>
          {articles.map((a) => (
            <li
              key={a.slug}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '1.25rem 0',
              }}
            >
              <Link
                href={`/blog/${a.slug}`}
                style={{ color: 'var(--fg)', textDecoration: 'none' }}
              >
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.35rem' }}>
                  {a.title}
                </h2>
              </Link>
              <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
                {a.excerpt}
              </p>
              <small style={{ color: 'var(--muted)' }}>
                {a.readingMinutes} min read
                {a.publishedAt
                  ? ` · ${new Date(a.publishedAt).toLocaleDateString()}`
                  : ''}
                {a.tags.length ? ` · ${a.tags.join(', ')}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
