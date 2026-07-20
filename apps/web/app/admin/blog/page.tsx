'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { getProfile } from '../../../lib/auth';
import { marked } from 'marked';
import { sanitizeHtml } from '@overlay/shared/markdown';
import type { Role } from '@overlay/shared/rbac';
import { authFetch, getProfile } from '../../../lib/auth';
import { formStyles } from '../../formStyles';

import {
  Draft,
  ManagedArticle,
  EMPTY_DRAFT,
  toDraft,
  loadArticles,
  createArticle,
  updateArticle,
  deleteArticle,
} from './foundation';

import { Editor } from './editor';
import { ArticleList } from './view';

const MUTED = 'var(--muted)';

export default function BlogAuthoringPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [role, setRole] = useState<'admin' | 'tipster' | null>(null);

  const [role, setRole] = useState<Role | null>(null);
  const [articles, setArticles] = useState<ManagedArticle[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load articles

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await loadArticles();
      setArticles(rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load articles',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Authenticate

  useEffect(() => {
    (async () => {
      const profile = await getProfile();

      if (!profile) {
        router.replace('/login');
        return;
      }

      if (
        profile.role !== 'admin' &&
      if (
        profile.role !== 'admin' &&
        profile.role !== 'staff' &&
        profile.role !== 'tipster'
      ) {
        router.replace('/account');
        return;
      }

      setRole(profile.role);
      setAuthorized(true);

      await load();
    })();
  }, [router, load]);

  // Update draft

  function update<K extends keyof Draft>(
    key: K,
    value: Draft[K],
  ) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  }

  // Save article

  async function save() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (draft.id) {
        await updateArticle(draft);
        setNotice('Article updated.');
      } else {
        await createArticle(draft);
        setNotice('Article created.');
      }

      setDraft(null);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Save failed',
      );
    } finally {
      setSaving(false);
    }
  }

  // Delete article

  async function remove(id: string) {
    if (!confirm('Delete this article? This cannot be undone.')) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await deleteArticle(id);

      if (draft?.id === id) {
        setDraft(null);
      }

      setNotice('Article deleted.');

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Delete failed',
      );
    }
  }

  // Loading

  if (!authorized) {
    return (
      <main
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '3rem 1.5rem',
        }}
      >
        <p style={{ color: MUTED }}>Loading…</p>
      </main>
    );
  }

  // Page

  return (
    <main
      style={{
        maxWidth: 1080,
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

      <h1>Blog authoring</h1>

      <p style={{ color: MUTED }}>
        Write articles in Markdown with a live,
        sanitized preview. Approved tipsters can
        author their own posts and submit them for
        review; admins can publish and manage all
        articles.
      </p>

      {error && (
        <p style={formStyles.error}>{error}</p>
      )}

      {notice && (
        <p style={{ color: '#4ade80' }}>{notice}</p>
      )}

      {draft ? (
        <Editor
          draft={draft}
          role={role}
          saving={saving}
          update={update}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
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
                    border: '1px solid var(--border)',
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
                Section
                <select
                  style={formStyles.input}
                  value={draft.category}
                  onChange={(e) =>
                    update('category', e.target.value as 'content' | 'news')
                  }
                >
                  <option value="content">Content (guides)</option>
                  <option value="news">News</option>
                </select>
              </label>
              <label>
                Status
                <select
                  style={formStyles.input}
                  value={draft.status}
                  onChange={(e) => update('status', e.target.value as Status)}
                >
                  <option value="draft">Draft</option>
                  {role === 'admin' || role === 'staff' ? (
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
                    background: 'var(--border)',
                    color: 'var(--fg)',
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
                  border: '1px solid var(--border)',
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
            style={{
              ...formStyles.button,
              marginTop: '1rem',
            }}
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
          >
            New article
          </button>

          <ArticleList
            loading={loading}
            articles={articles}
            onEdit={(article) => setDraft(toDraft(article))}
            onDelete={remove}
          />
        </>
      )}
    </main>
  );
}