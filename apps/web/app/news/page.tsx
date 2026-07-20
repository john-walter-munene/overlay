import Link from 'next/link';
import type { Metadata } from 'next';
import { listArticles } from '../../lib/api';

export const metadata: Metadata = {
  title: 'Sports & Betting News — Overlay Bets',
  description:
    'The latest happenings across sport and betting — market moves, results, industry updates and what they mean for your edge.',
  alternates: { canonical: '/news' },
};

// Always fetch fresh article data so published/deleted changes reflect immediately.
export const revalidate = 0;

export default async function NewsIndex({
  searchParams,
}: {
  searchParams: { tag?: string };
}) {
  const tag = searchParams?.tag;
  const articles = await listArticles({ tag, category: 'news' });

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        News{tag ? `: ${tag}` : ''}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        The latest happenings across sport and betting — market moves, results
        and industry updates, and what they mean for your edge.
      </p>

      {articles.length === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: '2rem' }}>
          No news published yet. Check back soon.
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
