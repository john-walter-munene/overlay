'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { search, type SearchResults } from '../../lib/api';
import Avatar from '../Avatar';
import Flag from '../Flag';

const MUTED = 'var(--muted)';

export default function SearchClient() {
  const tr = useTranslations('search');
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') ?? '';

  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search as the user types; keeps the URL in sync for sharable links.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const data = await search(q);
      setResults(data);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const q = query.trim();
    const next = q ? `/search?q=${encodeURIComponent(q)}` : '/search';
    router.replace(next, { scroll: false });
  }, [query, router]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasResults =
    results && (results.tipsters.length > 0 || results.articles.length > 0);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>{tr('title')}</h1>

      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr('placeholder')}
        aria-label={tr('title')}
        style={{
          width: '100%',
          padding: '0.8rem 1rem',
          fontSize: '1.05rem',
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--fg)',
        }}
      />

      {query.trim().length > 0 && query.trim().length < 2 ? (
        <p style={{ color: MUTED, marginTop: '1rem' }}>
          {tr('minChars')}
        </p>
      ) : null}

      {loading && !results ? (
        <p style={{ color: MUTED, marginTop: '1.5rem' }}>{tr('searching')}</p>
      ) : null}

      {results && !hasResults && query.trim().length >= 2 ? (
        <p style={{ color: MUTED, marginTop: '1.5rem' }}>
          {tr('noMatches', { query: results.query })}
        </p>
      ) : null}

      {results && results.tipsters.length > 0 ? (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{tr('tipsters')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {results.tipsters.map((t) => (
              <li
                key={t.tipsterId}
                style={{
                  borderTop: '1px solid var(--border)',
                  padding: '0.85rem 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <Avatar src={t.avatarUrl} seed={t.name ?? t.tipsterId} size={40} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={`/tipsters/${t.tipsterId}`}
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                  >
                    {t.name ?? t.tipsterId}
                  </Link>
                  {t.country ? (
                    <Flag code={t.country} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
                  ) : null}
                  <div style={{ color: MUTED, fontSize: '0.85rem' }}>
                    {t.yield != null
                      ? tr('yieldLabel', { value: t.yield.toFixed(1) })
                      : tr('newTipster')}
                    {t.sampleSize ? tr('picksSuffix', { count: t.sampleSize }) : ''}
                  </div>
                </div>
                <span style={{ color: MUTED, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                  {t.subscriptionPriceCents > 0
                    ? tr('pricePerMonth', {
                        price: `$${(t.subscriptionPriceCents / 100).toFixed(2)}`,
                      })
                    : tr('free')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results && results.articles.length > 0 ? (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            {tr('contentNews')}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {results.articles.map((a) => (
              <li
                key={a.slug}
                style={{
                  borderTop: '1px solid var(--border)',
                  padding: '0.85rem 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--on-accent)',
                      background: a.category === 'news' ? 'var(--accent)' : 'var(--muted)',
                      borderRadius: 999,
                      padding: '0.1rem 0.5rem',
                    }}
                  >
                    {a.category === 'news' ? tr('badgeNews') : tr('badgeContent')}
                  </span>
                  <Link
                    href={`/blog/${a.slug}`}
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                  >
                    {a.title}
                  </Link>
                </div>
                <p style={{ color: MUTED, margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
                  {a.excerpt}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
