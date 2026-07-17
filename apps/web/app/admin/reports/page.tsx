'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProfile,
  adminListReports,
  adminReviewReport,
  POSITIVE_REASON_LABELS,
  NEGATIVE_REASON_LABELS,
  type AdminReport,
} from '../../../lib/auth';

type StatusFilter = '' | 'open' | 'reviewing' | 'resolved' | 'dismissed';

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const NEXT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'];

const statusColor: Record<string, string> = {
  open: 'var(--warning)',
  reviewing: 'var(--accent)',
  resolved: 'var(--success)',
  dismissed: 'var(--muted)',
};

export default function AdminReportsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setReports(null);
    try {
      setReports(await adminListReports(status || undefined));
    } catch {
      setError('Failed to load reports.');
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

  async function review(r: AdminReport, status: string) {
    if (status === r.status) return;
    const note = window.prompt('Optional review note:') ?? undefined;
    setBusyId(r.id);
    setError(null);
    try {
      await adminReviewReport(r.id, status, note);
      await load(filter);
    } catch {
      setError('Failed to update report.');
    } finally {
      setBusyId(null);
    }
  }

  if (!authorized) return null;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p>
        <Link href="/admin" style={{ color: 'var(--accent)' }}>
          ← Admin
        </Link>
      </p>
      <h1>Tipster feedback</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Feedback from subscribers about tipsters — praise and complaints. Review
        and update each one.
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

      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : null}

      {reports === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : reports.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No reports in this view.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {reports.map((r) => (
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
                <div>
                  <strong>
                    <span aria-hidden style={{ marginRight: '0.4rem' }}>
                      {r.sentiment === 'positive' ? '👍' : '👎'}
                    </span>
                    {(
                      (r.sentiment === 'positive'
                        ? POSITIVE_REASON_LABELS
                        : NEGATIVE_REASON_LABELS) as Record<string, string>
                    )[r.reason] ?? r.reason}
                  </strong>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    Tipster:{' '}
                    <Link href={`/tipsters/${r.tipsterId}`} style={{ color: 'var(--accent)' }}>
                      {r.tipsterName || r.tipsterId}
                    </Link>{' '}
                    · From: {r.reporter.username || r.reporter.email} ·{' '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span style={{ color: statusColor[r.status] ?? 'var(--muted)', fontWeight: 600 }}>
                  {r.status}
                </span>
              </div>

              {r.details ? (
                <p style={{ margin: '0.6rem 0 0', color: 'var(--fg)', fontSize: '0.9rem' }}>
                  {r.details}
                </p>
              ) : null}
              {r.reviewNote ? (
                <p style={{ margin: '0.4rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Note: {r.reviewNote}
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {NEXT_STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busyId === r.id}
                    onClick={() => review(r, s)}
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
