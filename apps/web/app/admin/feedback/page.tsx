'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProfile,
  adminListFeedback,
  adminUpdateFeedback,
  FEEDBACK_CATEGORY_LABELS,
  type AdminFeedback,
  type FeedbackCategory,
} from '../../../lib/auth';

type StatusFilter = '' | 'new' | 'reviewed' | 'archived';

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'archived', label: 'Archived' },
];

const NEXT = ['new', 'reviewed', 'archived'];

export default function AdminFeedbackPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('new');
  const [rows, setRows] = useState<AdminFeedback[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setRows(null);
    try {
      setRows(await adminListFeedback(status || undefined));
    } catch {
      setError('Failed to load feedback.');
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
    })();
  }, [router]);

  useEffect(() => {
    if (authorized) load(filter);
  }, [authorized, filter, load]);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    setError(null);
    try {
      await adminUpdateFeedback(id, status);
      await load(filter);
    } catch {
      setError('Failed to update feedback.');
    } finally {
      setBusyId(null);
    }
  }

  if (!authorized) return null;

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p>
        <Link href="/admin" style={{ color: 'var(--accent)' }}>
          ← Admin
        </Link>
      </p>
      <h1>Support &amp; feedback</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Messages from the Support Center — questions, suggestions, bugs and fee
        queries.
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '1.25rem 0' }}>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setFilter(s.value)}
            style={{
              padding: '0.35rem 0.7rem',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: filter === s.value ? 'var(--accent)' : 'transparent',
              color: filter === s.value ? 'var(--on-accent)' : 'var(--muted)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {rows === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No feedback in this view.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '1rem 1.1rem',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <strong>
                  {FEEDBACK_CATEGORY_LABELS[r.category as FeedbackCategory] ??
                    r.category}
                </strong>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {r.status} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>
                {r.message}
              </p>
              {r.email ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                  Reply to:{' '}
                  <a href={`mailto:${r.email}`} style={{ color: 'var(--accent)' }}>
                    {r.email}
                  </a>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {NEXT.filter((s) => s !== r.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busyId === r.id}
                    onClick={() => setStatus(r.id, s)}
                  >
                    Mark {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
