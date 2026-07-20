import Link from 'next/link';
import type { Metadata } from 'next';
import { listArticles } from '../../lib/api';

export const metadata: Metadata = {
  title: 'Betting Guides & Content — Overlay Bets',
  description:
    'Guides and how-tos on closing line value, expected value, bankroll management, bookies and finding the overlay. Learn to bet like the sharps.',
  alternates: { canonical: '/content' },
};

// Always fetch fresh article data so published/deleted changes reflect immediately.
export const revalidate = 0;

export default async function ContentIndex({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  const tag = searchParams?.tag;
  const articles = await listArticles({ tag, category: 'content' });

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        Content{tag ? `: ${tag}` : ''}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Guides and how-tos — closing line value, expected value, bankroll math,
        choosing bookies, and the concepts behind a verified edge.
      </p>

      {articles.length === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: '2rem' }}>
          No guides published yet. Check back soon.
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
