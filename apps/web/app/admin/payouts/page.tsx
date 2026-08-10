'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { roleHasPermission } from '@overlay/shared/rbac';
import {
  getProfile,
  adminListAwaitingPayouts,
  adminApprovePayout,
  adminRejectPayout,
  type AwaitingPayout,
} from '../../../lib/auth';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<AwaitingPayout[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await adminListAwaitingPayouts());
    } catch {
      setError('Failed to load payout requests.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (!roleHasPermission(profile.role, 'finance:manage')) {
        router.replace('/account');
        return;
      }
      setAuthorized(true);
    })();
  }, [router]);

  useEffect(() => {
    if (authorized) load();
  }, [authorized, load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      if (action === 'approve') await adminApprovePayout(id);
      else await adminRejectPayout(id);
      await load();
    } catch {
      setError(`Failed to ${action} payout.`);
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
      <h1>Payout approvals</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Off-schedule (on-demand) payout requests from tipsters. The regular batch
        runs every Tuesday; these are the ones asking to be paid sooner.
      </p>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      {rows === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No payout requests awaiting approval.</p>
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
                display: 'flex',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <Link href={`/tipsters/${r.tipsterId}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {r.tipsterName || r.tipsterId}
                </Link>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  Net {money(r.amountCents)} (gross {money(r.grossCents)} · fee{' '}
                  {money(r.feeCents)}) · requested{' '}
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busyId === r.id}
                  onClick={() => act(r.id, 'approve')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={busyId === r.id}
                  onClick={() => act(r.id, 'reject')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
