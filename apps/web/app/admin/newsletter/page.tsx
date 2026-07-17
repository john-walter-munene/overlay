'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProfile,
  adminListNewsletter,
  type AdminNewsletterSubscriber,
} from '../../../lib/auth';

type StatusFilter = '' | 'subscribed' | 'unsubscribed';

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'subscribed', label: 'Subscribed' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
];

export default function AdminNewsletterPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('subscribed');
  const [rows, setRows] = useState<AdminNewsletterSubscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setRows(null);
    setError(null);
    try {
      setRows(await adminListNewsletter(status || undefined));
    } catch {
      setError('Failed to load subscribers.');
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

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const header = 'email,status,createdAt';
    const body = rows
      .map((r) => `${r.email},${r.status},${r.createdAt}`)
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!authorized) return null;

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p>
        <Link href="/admin" style={{ color: 'var(--accent)' }}>
          ← Admin
        </Link>
      </p>
      <h1>Newsletter subscribers</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Email opt-ins from the public newsletter signup.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          margin: '1.25rem 0',
        }}
      >
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
        <button
          type="button"
          onClick={exportCsv}
          disabled={!rows || rows.length === 0}
          className="btn btn--secondary btn--sm"
          style={{ marginLeft: 'auto' }}
        >
          Export CSV
        </button>
      </div>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {rows === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No subscribers in this view.</p>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {rows.length} subscriber{rows.length === 1 ? '' : 's'}
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={cellStyle}>Email</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={cellStyle}>{r.email}</td>
                  <td style={cellStyle}>{r.status}</td>
                  <td style={cellStyle}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

const cellStyle = {
  padding: '0.6rem 0.5rem',
  borderBottom: '1px solid var(--border)',
  fontSize: '0.9rem',
} as const;
