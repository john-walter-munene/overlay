'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../../lib/auth';
import { roleHasPermission } from '@overlay/shared/rbac';
import { formStyles } from '../../formStyles';

type Outcome = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost';
type StatusFilter = '' | Outcome;

interface Settlement {
  id: string;
  tipsterId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: Outcome;
  closingOdds: number | null;
  clv: number | null;
  settledAt: string | null;
  tipster: {
    displayName: string | null;
    user: { username: string | null; email: string };
  } | null;
  event: {
    sport: string;
    league: string | null;
    home: string;
    away: string;
    startTime: string;
  } | null;
}

interface SettlementsResponse {
  items: Settlement[];
  total: number;
  take: number;
  skip: number;
}

const PAGE_SIZE = 50;
const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: '' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
  { label: 'Void', value: 'void' },
  { label: '½ Won', value: 'half_won' },
  { label: '½ Lost', value: 'half_lost' },
];

const muted = { color: 'var(--muted)' } as const;

const outcomeColor: Record<Outcome, string> = {
  won: '#4ade80',
  lost: '#ff6b8a',
  void: 'var(--muted)',
  half_won: '#86efac',
  half_lost: '#fca5b5',
};

function formatClv(clv: number | null): string {
  if (clv === null) return '—';
  return `${(clv * 100).toFixed(1)}%`;
}

export default function AdminSettlementsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('');
  const [skip, setSkip] = useState(0);
  const [data, setData] = useState<SettlementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (s: StatusFilter, sk: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(sk),
      });
      if (s) qs.set('status', s);
      const res = await authFetch(`/api/admin/settlements?${qs.toString()}`);
      if (!res.ok) throw new Error(`Failed to load settlements (${res.status})`);
      setData((await res.json()) as SettlementsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settlements');
      setData(null);
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
      if (!roleHasPermission(profile.role, 'finance:manage')) {
        router.replace('/account');
        return;
      }
      setAuthorized(true);
    })();
  }, [router]);

  useEffect(() => {
    if (authorized) load(status, skip);
  }, [authorized, status, skip, load]);

  async function rerun() {
    setRerunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch('/api/admin/settlements/rerun', {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Re-run failed (${res.status})`);
      setNotice('Settlement cycle re-run triggered.');
      await load(status, skip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-run failed');
    } finally {
      setRerunning(false);
    }
  }

  async function voidPick(pick: Settlement) {
    const reason = window.prompt(
      `Void this ${pick.status} pick (${pick.market} — ${pick.selection})?\n\nA reason is required and recorded in the audit log:`,
      '',
    );
    if (reason === null) return; // cancelled
    if (!reason.trim()) {
      setError('A void reason is required.');
      return;
    }
    setBusyId(pick.id);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch(`/api/admin/settlements/${pick.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Void failed (${res.status})`);
      }
      setNotice('Pick voided; audit entry written and stats recomputed.');
      await load(status, skip);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!authorized) {
    return (
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={muted}>Loading…</p>
      </main>
    );
  }

  const page = data ? Math.floor(data.skip / PAGE_SIZE) + 1 : 1;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Settlement oversight</h1>
      <p style={muted}>
        Read-only view of recent settlement outcomes. Trigger a manual re-run for
        a stuck cycle, or void a pick for an objective data error — voids require
        a reason and are recorded in the audit log.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          margin: '1.5rem 0 1rem',
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => {
              setSkip(0);
              setStatus(f.value);
            }}
            style={{
              background: status === f.value ? 'var(--border)' : 'transparent',
              color: status === f.value ? '#fff' : 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.4rem 0.9rem',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={rerun}
          disabled={rerunning}
          style={{ ...formStyles.button, marginLeft: 'auto' }}
        >
          {rerunning ? 'Re-running…' : 'Re-run settlement cycle'}
        </button>
      </div>

      {error ? <p style={formStyles.error}>{error}</p> : null}
      {notice ? <p style={{ color: 'var(--accent)', margin: 0 }}>{notice}</p> : null}

      {loading && !data ? (
        <p style={muted}>Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p style={muted}>No settled picks found.</p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}
        >
          <thead>
            <tr style={{ textAlign: 'left', ...muted }}>
              <th style={{ padding: '0.5rem 0' }}>Settled</th>
              <th>Tipster</th>
              <th>Event</th>
              <th>Market / selection</th>
              <th>Outcome</th>
              <th>CLV</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '0.6rem 0', ...muted }}>
                  {s.settledAt ? new Date(s.settledAt).toLocaleString() : '—'}
                </td>
                <td>
                  {s.tipster
                    ? (s.tipster.displayName ??
                      s.tipster.user.username ??
                      s.tipster.user.email)
                    : s.tipsterId}
                </td>
                <td style={muted}>
                  {s.event ? `${s.event.home} v ${s.event.away}` : '—'}
                </td>
                <td>
                  {s.market} — {s.selection}
                </td>
                <td style={{ color: outcomeColor[s.status], fontWeight: 600 }}>
                  {s.status}
                </td>
                <td style={muted}>{formatClv(s.clv)}</td>
                <td>
                  {s.status === 'void' ? (
                    <span style={muted}>—</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => voidPick(s)}
                      style={{
                        background: 'transparent',
                        color: '#ff6b8a',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '0.4rem 0.9rem',
                        cursor: busyId === s.id ? 'default' : 'pointer',
                      }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            disabled={skip <= 0 || loading}
            onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              cursor: skip <= 0 ? 'default' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={muted}>
            Page {page} of {totalPages} · {data.total} settled
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              cursor: page >= totalPages ? 'default' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      ) : null}
    </main>
  );
}
