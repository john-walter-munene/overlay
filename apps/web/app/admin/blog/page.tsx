'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { getProfile } from '../../../lib/auth';
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