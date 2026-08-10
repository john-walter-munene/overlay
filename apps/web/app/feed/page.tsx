'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authFetch, getProfile } from '../../lib/auth';
import type { FeedPick } from '../../lib/api';
import { EmptyState } from '../EmptyState';

/** How often we poll for settlement status updates (ms). */
const POLL_MS = 30_000;

function statusColor(status: string): string {
  if (status === 'won' || status === 'half_won') return 'var(--success)';
  if (status === 'lost' || status === 'half_lost') return 'var(--danger)';
  if (status === 'void') return 'var(--muted)';
  return 'var(--accent)'; // pending / live
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
  const t = useTranslations('feed');
  const router = useRouter();
  const [picks, setPicks] = useState<FeedPick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipsterFilter, setTipsterFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const active = useRef(true);

  const statusLabel = (status: string): string => {
    if (status === 'pending') return t('statusLive');
    if (status === 'won') return t('statusWon');
    if (status === 'lost') return t('statusLost');
    if (status === 'void') return t('statusVoid');
    if (status === 'half_won') return t('halfWon');
    if (status === 'half_lost') return t('halfLost');
    return status;
  };

  const timeAgo = (ms: number): string => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('justNow');
    if (mins < 60) return t('minsAgo', { mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('hrsAgo', { hrs });
    return t('daysAgo', { days: Math.floor(hrs / 24) });
  };

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
      if (active.current) setError(t('refreshError'));
    }
  }, [t]);

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
      <h1>{t('title')}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {t('subtitle')}
      </p>

      {error ? (
        <p style={{ color: 'var(--danger)', margin: '0 0 1rem' }}>{error}</p>
      ) : null}

      {picks === null ? (
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      ) : list.length === 0 ? (
        <div style={{ marginTop: '2rem' }}>
          <EmptyState
            icon="📭"
            title={t('emptyTitle')}
            description={t('emptyBody')}
            actions={[{ href: '/tipsters', label: t('findTipster') }]}
          />
        </div>
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
                {t('filterTipster')}
                <select
                  value={tipsterFilter}
                  onChange={(e) => setTipsterFilter(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">{t('allTipsters')}</option>
                  {tipsters.map((t2) => (
                    <option key={t2} value={t2}>
                      {tipsterNames.get(t2) ?? t2}
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
                  {s === 'live'
                    ? t('statusLive')
                    : s === 'settled'
                      ? t('statusSettled')
                      : t('statusAll')}
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
                    {o === 'all'
                      ? t('statusAll')
                      : o === 'won'
                        ? t('outcomeWon')
                        : o === 'lost'
                          ? t('outcomeLost')
                          : t('outcomeVoid')}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
              {t('noMatch')}
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
                    title={t('liveTitle')}
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
                    ● {t('statusLive')}
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
                {t('locked', { ago: timeAgo(p.lockedAt) })}
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
