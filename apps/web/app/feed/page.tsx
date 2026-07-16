'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../lib/auth';
import type { FeedPick } from '../../lib/api';

/** How often we poll for settlement status updates (ms). */
const POLL_MS = 30_000;

function statusColor(status: string): string {
  if (status === 'won' || status === 'half_won') return '#3fb950';
  if (status === 'lost' || status === 'half_lost') return '#f85149';
  if (status === 'void') return '#9aa4b2';
  return '#6ea8fe'; // pending / live
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

export default function FeedPage() {
  const router = useRouter();
  const [picks, setPicks] = useState<FeedPick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>My feed</h1>
      <p style={{ color: '#9aa4b2' }}>
        Live and settled picks from every tipster you subscribe to, newest
        first. Updates automatically.
      </p>

      {error ? (
        <p style={{ color: '#f85149', margin: '0 0 1rem' }}>{error}</p>
      ) : null}

      {picks === null ? (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      ) : picks.length === 0 ? (
        <p style={{ color: '#9aa4b2' }}>
          No picks yet.{' '}
          <Link href="/tipsters" style={{ color: '#6ea8fe' }}>
            Find a tipster to subscribe to
          </Link>{' '}
          and their live picks will show up here.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0' }}>
          {picks.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid #1c2430',
                borderRadius: 8,
                padding: '0.9rem 1.1rem',
                marginBottom: '0.75rem',
                background: '#111826',
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
                  style={{ color: '#6ea8fe', fontWeight: 600 }}
                >
                  {p.tipsterId}
                </Link>
                <span style={{ color: statusColor(p.status), fontWeight: 600 }}>
                  {statusLabel(p.status)}
                </span>
              </div>

              <div style={{ margin: '0.4rem 0 0.2rem' }}>
                <strong>{p.selection}</strong>{' '}
                <span style={{ color: '#9aa4b2' }}>
                  ({p.market} @ {p.oddsAtPick.toFixed(2)} · {p.stakeUnits}u)
                </span>
              </div>

              {p.event ? (
                <div style={{ color: '#9aa4b2', fontSize: '0.9rem' }}>
                  {p.event.home} vs {p.event.away} · {p.event.sport}
                </div>
              ) : null}

              {p.note ? (
                <p
                  style={{
                    margin: '0.5rem 0 0',
                    color: '#c9d1d9',
                    fontSize: '0.9rem',
                    fontStyle: 'italic',
                    borderLeft: '2px solid #30363d',
                    paddingLeft: '0.6rem',
                  }}
                >
                  {p.note}
                </p>
              ) : null}

              <div
                style={{
                  color: '#6b7280',
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
    </main>
  );
}
