'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../lib/auth';
import type { FeedPick } from '../../lib/api';

/** How often we poll for settlement status updates (ms). */
const POLL_MS = 30_000;

function statusColor(status: string): string {
  if (status === 'won' || status === 'half_won') return 'var(--success)';
  if (status === 'lost' || status === 'half_lost') return 'var(--danger)';
  if (status === 'void') return 'var(--muted)';
  return 'var(--accent)'; // pending / live
}

function statusLabel(status: string): string {
  if (status === 'pending') return 'Live';
  if (status === 'half_won') return '½ won';
  if (status === 'half_lost') return '½ lost';
  return status;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type StatusFilter = 'live' | 'settled' | 'all';
type OutcomeFilter = 'all' | 'won' | 'lost' | 'void';

/** Bucket a raw pick status into won/lost/void (half-results roll up). */
function outcomeBucket(status: string): OutcomeFilter | 'live' {
  if (status === 'pending') return 'live';
  if (status === 'won' || status === 'half_won') return 'won';
  if (status === 'lost' || status === 'half_lost') return 'lost';
  return 'void';
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.35rem 0.7rem',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--on-accent)' : 'var(--muted)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  };
}

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  fontSize: '0.9rem',
};

export default function FeedPage() {
  const router = useRouter();
  const [picks, setPicks] = useState<FeedPick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipsterFilter, setTipsterFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const active = useRef(true);

  const loadFeed = useCallback(async () => {
    try {
      const res = await authFetch('/api/picks/me/feed');
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = (await res.json()) as FeedPick[];
      if (active.current) {
        setPicks(data);
        setError(null);
      }
    } catch {
      if (active.current) setError('Could not refresh your feed.');
    }
  }, []);

  useEffect(() => {
    active.current = true;
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      await loadFeed();
    })();

    // Poll for settlement status updates while the page is open.
    const timer = setInterval(loadFeed, POLL_MS);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [router, loadFeed]);

  const list = picks ?? [];
  const tipsters = [...new Set(list.map((p) => p.tipsterId))].sort();
  // Map each tipster id to a display name (fallback to id) for the filter.
  const tipsterNames = new Map(
    list.map((p) => [p.tipsterId, p.tipsterName ?? p.tipsterId]),
  );
  const filtered = list.filter((p) => {
    if (tipsterFilter && p.tipsterId !== tipsterFilter) return false;
    const bucket = outcomeBucket(p.status);
    if (statusFilter === 'live' && bucket !== 'live') return false;
    if (statusFilter === 'settled') {
      if (bucket === 'live') return false;
      if (outcomeFilter !== 'all' && bucket !== outcomeFilter) return false;
    }
    return true;
  });

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>My feed</h1>
      <p style={{ color: 'var(--muted)' }}>
        Live and settled picks from every tipster you subscribe to, newest
        first. Updates automatically.
      </p>

      {error ? (
        <p style={{ color: 'var(--danger)', margin: '0 0 1rem' }}>{error}</p>
      ) : null}

      {picks === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : list.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No picks yet.{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            Find a tipster to subscribe to
          </Link>{' '}
          and their live picks will show up here.
        </p>
      ) : (
        <>
          {/* Filters: by tipster (for multiple subscriptions) + by status. */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center',
              margin: '1.5rem 0 0.5rem',
            }}
          >
            {tipsters.length > 1 ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                Tipster
                <select
                  value={tipsterFilter}
                  onChange={(e) => setTipsterFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">All tipsters</option>
                  {tipsters.map((t) => (
                    <option key={t} value={t}>
                      {tipsterNames.get(t) ?? t}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['live', 'settled', 'all'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  style={pillStyle(statusFilter === s)}
                >
                  {s === 'live' ? 'Live' : s === 'settled' ? 'Settled' : 'All'}
                </button>
              ))}
            </div>

            {statusFilter === 'settled' ? (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['all', 'won', 'lost', 'void'] as OutcomeFilter[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutcomeFilter(o)}
                    style={pillStyle(outcomeFilter === o)}
                  >
                    {o === 'all' ? 'All' : o[0].toUpperCase() + o.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
              No picks match these filters.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
              {filtered.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.9rem 1.1rem',
                marginBottom: '0.75rem',
                background: 'var(--surface)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: '0.75rem',
                }}
              >
                <Link
                  href={`/tipsters/${p.tipsterId}`}
                  style={{ color: 'var(--accent)', fontWeight: 600 }}
                >
                  {p.tipsterName ?? p.tipsterId}
                </Link>
                <span style={{ color: statusColor(p.status), fontWeight: 600 }}>
                  {statusLabel(p.status)}
                </span>
              </div>

              <div style={{ margin: '0.4rem 0 0.2rem' }}>
                <strong>{p.selection}</strong>{' '}
                {p.pickType === 'live' ? (
                  <span
                    title="Placed in-play (after kickoff). Excluded from CLV and scored separately from pre-match picks."
                    style={{
                      padding: '0.05rem 0.4rem',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--danger)',
                      border: '1px solid var(--danger)',
                    }}
                  >
                    ● Live
                  </span>
                ) : null}{' '}
                <span style={{ color: 'var(--muted)' }}>
                  ({p.market} @ {p.oddsAtPick.toFixed(2)} · {p.stakeUnits}u)
                </span>
              </div>

              {p.event ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {p.event.home} vs {p.event.away} · {p.event.sport}
                </div>
              ) : null}

              {p.note ? (
                <p
                  style={{
                    margin: '0.5rem 0 0',
                    color: 'var(--fg)',
                    fontSize: '0.9rem',
                    fontStyle: 'italic',
                    borderLeft: '2px solid var(--border)',
                    paddingLeft: '0.6rem',
                  }}
                >
                  {p.note}
                </p>
              ) : null}

              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.82rem',
                  marginTop: '0.35rem',
                }}
              >
                Locked {timeAgo(p.lockedAt)}
                {p.clv != null ? ` · CLV ${(p.clv * 100).toFixed(1)}%` : ''}
                {p.result ? ` · ${p.result}` : ''}
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
