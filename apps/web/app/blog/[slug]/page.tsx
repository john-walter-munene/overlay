import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { getArticle, listArticleSlugs, SITE_URL } from '../../../lib/api';

export const revalidate = 300;

/** Pre-render published article routes at build time for SEO/perf. */
export async function generateStaticParams() {
  const slugs = await listArticleSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const article = await getArticle(params.slug);
  if (!article) return { title: 'Not found — Overlay Bets' };

  const title = article.seoTitle ?? article.title;
  const description = article.seoDescription ?? article.excerpt;
  const url = `${SITE_URL}/blog/${article.slug}`;

  return {
    title: `${title} — Overlay Bets`,
    description,
    alternates: { canonical: article.canonicalUrl ?? url },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      images: article.coverImage ? [article.coverImage] : undefined,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.coverImage ? [article.coverImage] : undefined,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const article = await getArticle(params.slug);
  if (!article) notFound();

  const html = await marked.parse(article.body);
  const url = `${SITE_URL}/blog/${article.slug}`;

  // Article structured data for rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    image: article.coverImage ? [article.coverImage] : undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt,
    mainEntityOfPage: url,
    publisher: {
      '@type': 'Organization',
      name: 'Overlay Bets',
    },
  };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p style={{ margin: 0 }}>
        <Link href="/blog" style={{ color: 'var(--accent)' }}>
          ← Blog
        </Link>
      </p>
      <h1 style={{ fontSize: '2.3rem', marginBottom: '0.25rem' }}>
        {article.title}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {article.readingMinutes} min read
        {article.publishedAt
          ? ` · ${new Date(article.publishedAt).toLocaleDateString()}`
          : ''}
      </p>
      <article
        style={{ lineHeight: 1.7, fontSize: '1.05rem' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
