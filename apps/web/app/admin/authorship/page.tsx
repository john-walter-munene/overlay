'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { authFetch, getProfile } from '../../../lib/auth';
import { formStyles } from '../../formStyles';

type ArticleAuthorStatus = 'pending' | 'approved' | 'suspended';

interface Author {
  userId: string;
  displayName: string | null;
  email: string;
  articleAuthorStatus: ArticleAuthorStatus;
  status: string;
}

export default function BlogAuthorshipPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [authors, setAuthors] = useState<Author[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch('/api/articles/admin/authors');
      if (!res.ok) {
        throw new Error('Failed to load authors');
      }
      setAuthors(await res.json());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load authors',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (profile.role !== 'admin') {
        router.replace('/account');
        return;
      }
      setAuthorized(true);
      await load();
    })();
  }, [router, load]);

  async function updateStatus(
    userId: string,
    articleAuthorStatus: ArticleAuthorStatus,
  ) {
    setSaving(userId);
    setError(null);
    setNotice(null);

    try {
      const res = await authFetch(
        `/api/articles/admin/authors/${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ articleAuthorStatus }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
        throw new Error(msg || `Failed to update author (${res.status})`);
      }

      setNotice('Author updated.');
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Update failed',
      );
    } finally {
      setSaving(null);
    }
  }

  const STATUS_BADGE: Record<ArticleAuthorStatus, { bg: string; fg: string }> = {
    pending:   { bg: '#1a1a2e', fg: '#b0b8ff' },
    approved:  { bg: '#0f2e1a', fg: '#6bdb9b' },
    suspended: { bg: '#2e1015', fg: '#ff8a9e' },
  };

  if (!authorized) {
    return (
      <main
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: '3rem 1.5rem',
        }}
      >
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '3rem 1.5rem',
      }}
    >
      <p style={{ margin: 0 }}>
        <Link
          href="/blog"
          style={{ color: 'var(--accent)' }}
        >
          ← Blog
        </Link>
      </p>

      <h1>Article authorship</h1>

      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Manage which tipsters are allowed to write
        articles. Marketplace approval and article
        authorship are independent.
      </p>

      {/* Admin nav links — matching the dashboard pattern */}
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          margin: '0 0 1.5rem',
        }}
      >
        {[
          { href: '/admin', label: 'Dashboard' },
          { href: '/admin/blog', label: 'Blog authoring' },
          { href: '/admin/authorship', label: 'Tipster authorship' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0.55rem 0.95rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontSize: '0.95rem',
            }}
          >
            {item.label} →
          </Link>
        ))}
      </nav>

      {error && (
        <p style={formStyles.error}>{error}</p>
      )}

      {notice && (
        <p style={{ color: '#4ade80', margin: '0.5rem 0' }}>
          {notice}
        </p>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>
          Loading authors…
        </p>
      ) : authors.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No tipsters found.
        </p>
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            marginTop: '0.5rem',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <th
                  align="left"
                  style={{
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  Name
                </th>
                <th
                  align="left"
                  style={{
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  Email
                </th>
                <th
                  align="left"
                  style={{
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  Tipster
                </th>
                <th
                  align="left"
                  style={{
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--muted)',
                    fontWeight: 600,
                  }}
                >
                  Article author
                </th>
              </tr>
            </thead>

            <tbody>
              {authors.map((author, idx) => {
                const badge = STATUS_BADGE[author.articleAuthorStatus];
                return (
                  <tr
                    key={author.userId}
                    style={{
                      borderBottom:
                        idx < authors.length - 1
                          ? '1px solid var(--border)'
                          : 'none',
                    }}
                  >
                    <td
                      style={{
                        padding: '0.85rem 1rem',
                        fontWeight: 500,
                      }}
                    >
                      {author.displayName ?? 'Unnamed'}
                    </td>

                    <td
                      style={{
                        padding: '0.85rem 1rem',
                        color: 'var(--muted)',
                      }}
                    >
                      {author.email}
                    </td>

                    <td
                      style={{
                        padding: '0.85rem 1rem',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          background: badge.bg,
                          color: badge.fg,
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.6rem',
                          borderRadius: 6,
                          textTransform: 'capitalize',
                        }}
                      >
                        {author.status}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: '0.85rem 1rem',
                      }}
                    >
                      <select
                        value={author.articleAuthorStatus}
                        disabled={saving === author.userId}
                        onChange={(e) =>
                          updateStatus(
                            author.userId,
                            e.target.value as ArticleAuthorStatus,
                          )
                        }
                        style={{
                          background: '#0d1117',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '0.45rem 0.7rem',
                          color: 'inherit',
                          fontSize: '0.9rem',
                          cursor: saving === author.userId ? 'wait' : 'pointer',
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}