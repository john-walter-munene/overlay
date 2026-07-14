'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marked } from 'marked';
import { sanitizeHtml } from '@overlay/shared/markdown';
import { authFetch, getProfile } from '../../../lib/auth';
import { formStyles } from '../../formStyles';

type Status = 'draft' | 'pending' | 'published' | 'archived';

const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  published: 'Published',
  archived: 'Archived',
};

interface ManagedArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  status: Status;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

interface Draft {
  id: string | null;
  title: string;
  slug: string;
  tags: string;
  coverImage: string;
  status: Status;
  body: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  title: '',
  slug: '',
  tags: '',
  coverImage: '',
  status: 'draft',
  body: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
};

const MUTED = '#9aa4b2';

function toDraft(a: ManagedArticle): Draft {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    tags: a.tags.join(', '),
    coverImage: a.coverImage ?? '',
    status: a.status,
    body: a.body,
    seoTitle: a.seoTitle ?? '',
    seoDescription: a.seoDescription ?? '',
    canonicalUrl: a.canonicalUrl ?? '',
  };
}

export default function BlogAuthoringPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<'admin' | 'tipster' | null>(null);
  const [articles, setArticles] = useState<ManagedArticle[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/articles/manage/mine');
      if (!res.ok) throw new Error(`Failed to load articles (${res.status})`);
      setArticles((await res.json()) as ManagedArticle[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles');
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
      if (profile.role !== 'admin' && profile.role !== 'tipster') {
        router.replace('/account');
        return;
      }
      setRole(profile.role);
      setAuthorized(true);
      await load();
    })();
  }, [router, load]);

  // Live, safely-sanitized preview of the markdown body.
  const previewHtml = useMemo(() => {
    if (!draft) return '';
    const raw = marked.parse(draft.body ?? '', { async: false }) as string;
    return sanitizeHtml(raw);
  }, [draft]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const tags = draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        title: draft.title,
        body: draft.body,
        coverImage: draft.coverImage || undefined,
        tags,
        status: draft.status,
        seoTitle: draft.seoTitle || undefined,
        seoDescription: draft.seoDescription || undefined,
        canonicalUrl: draft.canonicalUrl || undefined,
        ...(draft.id ? {} : { slug: draft.slug || undefined }),
      };
      const res = draft.id
        ? await authFetch(`/api/articles/${draft.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await authFetch('/api/articles', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const msg = Array.isArray(body?.message)
          ? body?.message.join(', ')
          : body?.message;
        throw new Error(msg || `Save failed (${res.status})`);
      }
      setNotice(draft.id ? 'Article updated.' : 'Article created.');
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this article? This cannot be undone.')) return;
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch(`/api/articles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setNotice('Article deleted.');
      if (draft?.id === id) setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (!authorized) {
    return (
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ color: MUTED }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/blog" style={{ color: '#6ea8fe' }}>
          ← Blog
        </Link>
      </p>
      <h1>Blog authoring</h1>
      <p style={{ color: MUTED }}>
        Write articles in Markdown with a live, sanitized preview. Approved
        tipsters can author their own posts and submit them for review; an admin
        approves each post before it goes live. Admins can manage and publish all
        posts.
      </p>

      {error ? <p style={formStyles.error}>{error}</p> : null}
      {notice ? <p style={{ color: '#4ade80' }}>{notice}</p> : null}

      {draft ? (
        <section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: '1.5rem',
              marginTop: '1.5rem',
            }}
          >
            <div style={formStyles.form}>
              <label>
                Title
                <input
                  style={formStyles.input}
                  value={draft.title}
                  onChange={(e) => update('title', e.target.value)}
                />
              </label>
              {!draft.id ? (
                <label>
                  Slug (optional — derived from title)
                  <input
                    style={formStyles.input}
                    value={draft.slug}
                    onChange={(e) => update('slug', e.target.value)}
                  />
                </label>
              ) : null}
              <label>
                Cover image URL
                <input
                  style={formStyles.input}
                  value={draft.coverImage}
                  placeholder="https://…"
                  onChange={(e) => update('coverImage', e.target.value)}
                />
              </label>
              {draft.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.coverImage}
                  alt="Cover preview"
                  style={{
                    maxWidth: '100%',
                    borderRadius: 8,
                    border: '1px solid #1c2430',
                  }}
                />
              ) : null}
              <label>
                Tags (comma separated)
                <input
                  style={formStyles.input}
                  value={draft.tags}
                  onChange={(e) => update('tags', e.target.value)}
                />
              </label>
              <label>
                Status
                <select
                  style={formStyles.input}
                  value={draft.status}
                  onChange={(e) => update('status', e.target.value as Status)}
                >
                  <option value="draft">Draft</option>
                  {role === 'admin' ? (
                    <>
                      <option value="pending">Pending review</option>
                      <option value="published">Published</option>
                    </>
                  ) : (
                    <option value="pending">Submit for review</option>
                  )}
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Body (Markdown)
                <textarea
                  style={{
                    ...formStyles.input,
                    minHeight: 260,
                    fontFamily: 'monospace',
                  }}
                  value={draft.body}
                  onChange={(e) => update('body', e.target.value)}
                />
              </label>
              <label>
                SEO title (optional)
                <input
                  style={formStyles.input}
                  value={draft.seoTitle}
                  onChange={(e) => update('seoTitle', e.target.value)}
                />
              </label>
              <label>
                SEO description (optional)
                <input
                  style={formStyles.input}
                  value={draft.seoDescription}
                  onChange={(e) => update('seoDescription', e.target.value)}
                />
              </label>
              <label>
                Canonical URL (optional)
                <input
                  style={formStyles.input}
                  value={draft.canonicalUrl}
                  onChange={(e) => update('canonicalUrl', e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  style={formStyles.button}
                  onClick={save}
                  disabled={saving || !draft.title.trim() || !draft.body.trim()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  style={{
                    ...formStyles.button,
                    background: '#1c2430',
                    color: '#e6e6e6',
                  }}
                  onClick={() => setDraft(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>

            <div>
              <h3 style={{ marginTop: 0 }}>Preview</h3>
              <article
                style={{
                  background: '#0f1420',
                  border: '1px solid #1c2430',
                  borderRadius: 8,
                  padding: '1.25rem',
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </section>
      ) : (
        <>
          <button
            style={{ ...formStyles.button, marginTop: '1rem' }}
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
          >
            New article
          </button>

          {loading ? (
            <p style={{ color: MUTED }}>Loading…</p>
          ) : articles.length === 0 ? (
            <p style={{ color: MUTED }}>No articles yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
              {articles.map((a) => (
                <li
                  key={a.id}
                  style={{
                    borderTop: '1px solid #1c2430',
                    padding: '1rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{a.title}</strong>
                    <div style={{ color: MUTED, fontSize: '0.85rem' }}>
                      {STATUS_LABELS[a.status]} · /{a.slug}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        ...formStyles.button,
                        background: '#1c2430',
                        color: '#e6e6e6',
                      }}
                      onClick={() => setDraft(toDraft(a))}
                    >
                      Edit
                    </button>
                    <button
                      style={{
                        ...formStyles.button,
                        background: '#3a1420',
                        color: '#ff9db0',
                      }}
                      onClick={() => remove(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
