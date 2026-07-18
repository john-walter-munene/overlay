'use client';

import { useEffect, useState } from 'react';
import { authFetch, getAccessToken } from '../../../lib/auth';
import { API_URL, type FeedPick } from '../../../lib/api';
import SubscribeButton from '../../SubscribeButton';

const MUTED = 'var(--muted)';
const BORDER = 'var(--border)';

type Filter = 'open' | 'settled' | 'all';
type SettledOutcome = 'all' | 'won' | 'lost' | 'void';

/** Entitlement state for the tipster's open (pre-event) picks. */
type LiveState =
  | { kind: 'loading' }
  | { kind: 'entitled'; picks: FeedPick[] }
  | { kind: 'locked' }
  | { kind: 'signedout' };

/** Bucket a pick status into its coarse settled outcome (halves fold in). */
function outcomeBucket(status: string): 'won' | 'lost' | 'void' | null {
  if (status === 'won' || status === 'half_won') return 'won';
  if (status === 'lost' || status === 'half_lost') return 'lost';
  if (status === 'void') return 'void';
  return null;
}

function pillStyle(active: boolean, small = false): React.CSSProperties {
  return {
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--on-accent)' : MUTED,
    border: `1px solid ${BORDER}`,
    borderRadius: 999,
    padding: small ? '0.25rem 0.75rem' : '0.3rem 0.9rem',
    fontSize: small ? '0.8rem' : '0.85rem',
    cursor: 'pointer',
  };
}

function statusLabel(status: string): string {
  if (status === 'pending') return 'Open';
  if (status === 'half_won') return '½ won';
  if (status === 'half_lost') return '½ lost';
  return status;
}

function statusColor(status: string): string {
  if (status === 'won' || status === 'half_won') return 'var(--success)';
  if (status === 'lost' || status === 'half_lost') return 'var(--danger)';
  if (status === 'void') return MUTED;
  return 'var(--accent)'; // pending / open
}

/** Small pill flagging an in-play (live) pick so it's never mistaken for a
 * pre-match selection — live picks carry no CLV and are scored separately. */
function LiveBadge() {
  return (
    <span
      title="Placed in-play (after kickoff). Excluded from CLV and scored separately from pre-match picks."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        marginLeft: '0.4rem',
        padding: '0.05rem 0.4rem',
        borderRadius: 999,
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        color: 'var(--danger)',
        border: '1px solid var(--danger)',
        verticalAlign: 'middle',
      }}
    >
      <span aria-hidden>●</span> Live
    </span>
  );
}

/**
 * Unified "Tips" browser on a tipster's public profile (OB-012): filter their
 * picks by Open (pre-event) / Settled / All. Settled picks are public; open
 * picks are gated behind an active subscription (paywall otherwise).
 */
export default function TipsterTips({
  tipsterId,
  priceCents,
  billingInterval,
}: {
  tipsterId: string;
  priceCents: number;
  billingInterval: 'weekly' | 'monthly';
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [settledOutcome, setSettledOutcome] = useState<SettledOutcome>('all');
  const [settled, setSettled] = useState<FeedPick[]>([]);
  const [live, setLive] = useState<LiveState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    // Public settled track record.
    fetch(`${API_URL}/api/picks/tipster/${encodeURIComponent(tipsterId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled) setSettled(rows as FeedPick[]);
      })
      .catch(() => {
        if (!cancelled) setSettled([]);
      });

    // Gated open picks — needs an active subscription.
    (async () => {
      const token = await getAccessToken();
      if (cancelled) return;
      if (!token) {
        setLive({ kind: 'signedout' });
        return;
      }
      try {
        const res = await authFetch(
          `/api/picks/tipster/${encodeURIComponent(tipsterId)}/live`,
        );
        if (cancelled) return;
        if (res.status === 403) {
          setLive({ kind: 'locked' });
          return;
        }
        if (!res.ok) {
          setLive({ kind: 'locked' });
          return;
        }
        setLive({ kind: 'entitled', picks: (await res.json()) as FeedPick[] });
      } catch {
        if (!cancelled) setLive({ kind: 'locked' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tipsterId]);

  const entitled = live.kind === 'entitled';
  // When entitled the live feed already contains open + settled; otherwise use
  // the public settled list and paywall the open picks.
  const openPicks = entitled
    ? live.picks.filter((p) => p.status === 'pending')
    : [];
  const settledPicks = entitled
    ? live.picks.filter((p) => p.status !== 'pending')
    : settled;

  const wonCount = settledPicks.filter(
    (p) => outcomeBucket(p.status) === 'won',
  ).length;
  const lostCount = settledPicks.filter(
    (p) => outcomeBucket(p.status) === 'lost',
  ).length;
  const voidCount = settledPicks.filter(
    (p) => outcomeBucket(p.status) === 'void',
  ).length;

  const filteredSettled = settledPicks.filter(
    (p) => settledOutcome === 'all' || outcomeBucket(p.status) === settledOutcome,
  );

  const rows =
    filter === 'open'
      ? openPicks
      : filter === 'settled'
        ? filteredSettled
        : entitled
          ? live.picks
          : settledPicks;

  const showPaywall = !entitled && filter !== 'settled';

  // Open count is gated for non-subscribers, so show a lock instead of a number.
  const openBadge = entitled ? String(openPicks.length) : '🔒';
  const allCount = entitled ? live.picks.length : settledPicks.length;
  const mainTabs: { key: Filter; label: string; badge: string }[] = [
    { key: 'open', label: 'Open', badge: openBadge },
    { key: 'settled', label: 'Settled', badge: String(settledPicks.length) },
    { key: 'all', label: 'All', badge: String(allCount) },
  ];
  const subTabs: { key: SettledOutcome; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: settledPicks.length },
    { key: 'won', label: 'Won', count: wonCount },
    { key: 'lost', label: 'Lost', count: lostCount },
    { key: 'void', label: 'Void', count: voidCount },
  ];

  return (
    <section aria-labelledby="tips-heading" style={{ marginTop: '2rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <h2 id="tips-heading" style={{ margin: 0 }}>
          Tips
        </h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {mainTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              style={pillStyle(filter === t.key)}
            >
              {t.label} ({t.badge})
            </button>
          ))}
        </div>
      </div>

      {filter === 'settled' ? (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
          {subTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSettledOutcome(t.key)}
              style={pillStyle(settledOutcome === t.key, true)}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      ) : null}

      {showPaywall ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
            🔒 Open picks are for subscribers
          </p>
          <p style={{ color: MUTED, margin: '0 0 0.75rem' }}>
            {live.kind === 'signedout'
              ? 'Sign in and subscribe to see this tipster’s picks the moment they’re locked — before kickoff.'
              : 'Subscribe to see this tipster’s picks the moment they’re locked — before kickoff.'}
          </p>
          <div style={{ display: 'inline-block' }}>
            <SubscribeButton
              tipsterId={tipsterId}
              priceCents={priceCents}
              billingInterval={billingInterval}
            />
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p style={{ color: MUTED, marginTop: '1rem' }}>
          {filter === 'open'
            ? 'No open picks right now.'
            : filter === 'settled'
              ? 'No settled picks yet.'
              : 'No picks yet.'}
        </p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}
        >
          <thead>
            <tr style={{ textAlign: 'left', color: MUTED }}>
              <th style={{ padding: '0.5rem 0' }}>Match</th>
              <th>Selection</th>
              <th>Market</th>
              <th>Odds</th>
              <th>CLV</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ padding: '0.5rem 0', color: MUTED }}>
                  {p.event ? `${p.event.home} v ${p.event.away}` : '—'}
                </td>
                <td>
                  {p.selection}
                  {p.pickType === 'live' ? <LiveBadge /> : null}
                  {p.note ? (
                    <div
                      style={{
                        color: MUTED,
                        fontSize: '0.82rem',
                        fontStyle: 'italic',
                        marginTop: '0.2rem',
                      }}
                    >
                      {p.note}
                    </div>
                  ) : null}
                  {p.lockedAt ? (
                    <div
                      title="Time-stamped and locked before kickoff — this record can’t be edited afterwards."
                      style={{
                        color: MUTED,
                        fontSize: '0.75rem',
                        marginTop: '0.25rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <span aria-hidden>🔒</span>
                      Locked{' '}
                      {new Date(p.lockedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {p.pickType === 'live'
                        ? ' · in-play'
                        : p.event && p.lockedAt < p.event.startTime
                          ? ' · before kickoff'
                          : ''}
                    </div>
                  ) : null}
                </td>
                <td>{p.market}</td>
                <td>{p.oddsAtPick.toFixed(2)}</td>
                <td>{p.clv != null ? `${(p.clv * 100).toFixed(1)}%` : '—'}</td>
                <td style={{ color: statusColor(p.status) }}>
                  {statusLabel(p.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
