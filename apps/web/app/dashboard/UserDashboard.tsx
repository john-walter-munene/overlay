'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  authFetch,
  getFullProfile,
  listFollowing,
  type FollowedTipster,
} from '../../lib/auth';
import type { FeedPick } from '../../lib/api';
import { downloadExport } from '../../lib/export';
import Flag from '../Flag';
import Avatar from '../Avatar';
import FollowButton from '../FollowButton';
import { useFollow } from '../FollowProvider';

interface Sub {
  id: string;
  tipsterId: string;
  tipsterName: string | null;
  avatarUrl: string | null;
  country: string | null;
  subscriptionPriceCents: number;
  billingInterval: 'weekly' | 'monthly';
  status: string;
  currentPeriodEnd: string | null;
  isFollowing: boolean;
  stats: {
    yield: number;
    clvAvg: number;
    winRate: number;
    sampleSize: number;
  } | null;
}

function statusLabel(status: string): string {
  if (status === 'pending') return 'Live';
  if (status === 'half_won') return '½ won';
  if (status === 'half_lost') return '½ lost';
  return status;
}

/** Human label + colour for a subscription's billing status. */
function subStatus(status: string): { label: string; color: string } {
  if (status === 'active') return { label: 'Active', color: 'var(--success)' };
  if (status === 'past_due')
    return { label: 'Past due', color: 'var(--danger)' };
  if (status === 'canceled')
    return { label: 'Canceled', color: 'var(--muted)' };
  return { label: status, color: 'var(--muted)' };
}

/** "Renews 12 Aug" / "Ends 12 Aug" line for a subscription row. */
function renewalLine(status: string, iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const when = d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return status === 'canceled' ? `Access until ${when}` : `Renews ${when}`;
}

/**
 * The bettor's home. Everything centered on the user: their subscriptions, a
 * peek at their live feed, and the actions they actually use. Shown at
 * /dashboard for `user` accounts (tipsters get the tipster dashboard there).
 */
export default function UserDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [picks, setPicks] = useState<FeedPick[] | null>(null);
  const [following, setFollowing] = useState<FollowedTipster[] | null>(null);
  const { ready: followReady, isFollowing } = useFollow();

  useEffect(() => {
    getFullProfile().then((p) => {
      setUsername(p?.username ?? null);
      setAvatarUrl(p?.avatarUrl ?? null);
    });
    authFetch('/api/subscriptions/me')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSubs(d as Sub[]))
      .catch(() => setSubs([]));
    authFetch('/api/picks/me/feed')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPicks(d as FeedPick[]))
      .catch(() => setPicks([]));
    listFollowing()
      .then(setFollowing)
      .catch(() => setFollowing([]));
  }, []);

  const activeCount = (subs ?? []).filter((s) => s.status === 'active').length;
  const recent = (picks ?? []).slice(0, 3);
  // Reflect live unfollows: once the provider has loaded, only show tipsters
  // still followed, so unfollowing here removes the row immediately.
  const shownFollowing =
    following === null
      ? null
      : followReady
        ? following.filter((f) => isFollowing(f.tipsterId))
        : following;

  // Clean separation of the two relationships: a tipster you actively pay for
  // lives in "Subscribed"; "Following" then only shows tipsters you track for
  // free, so nobody appears in both lists at once.
  const activeSubIds = new Set(
    (subs ?? []).filter((s) => s.status === 'active').map((s) => s.tipsterId),
  );
  const followingOnly =
    shownFollowing === null
      ? null
      : shownFollowing.filter((f) => !activeSubIds.has(f.tipsterId));

  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '1.1rem 1.2rem',
    background: 'var(--surface)',
  };

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
        <Avatar src={avatarUrl} seed={username ?? 'me'} size={56} />
        <div>
          <h1 style={{ margin: '0 0 0.15rem' }}>
            Welcome{username ? `, ${username}` : ''}
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Your subscriptions and live picks, all in one place.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', margin: '1.25rem 0' }}>
        <Link href="/feed" className="btn btn--primary btn--sm">
          My feed
        </Link>
        <Link href="/account/subscriptions" className="btn btn--secondary btn--sm">
          My subscriptions
        </Link>
        <Link href="/tipsters" className="btn btn--secondary btn--sm">
          Browse tipsters
        </Link>
        <Link href="/account" className="btn btn--secondary btn--sm">
          My account
        </Link>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            downloadExport(
              '/api/exports/users/subscriptions',
              'xlsx',
              'my-subscriptions.xlsx',
            ).catch((e) =>
              alert(e instanceof Error ? e.message : 'Export failed'),
            )
          }
        >
          Export subscriptions
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            downloadExport('/api/exports/users/feed', 'xlsx', 'my-feed.xlsx').catch(
              (e) => alert(e instanceof Error ? e.message : 'Export failed'),
            )
          }
        >
          Export feed
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div style={cardStyle}>
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            Active subscriptions
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>
            {subs === null ? '—' : activeCount}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            Live picks right now
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>
            {picks === null
              ? '—'
              : picks.filter((p) => p.status === 'pending').length}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
            Following
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.2rem' }}>
            {shownFollowing === null ? '—' : shownFollowing.length}
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: '2.5rem', fontSize: '1.2rem' }}>Latest from your feed</h2>
      {picks === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : recent.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No picks yet.{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            Find a tipster to subscribe to
          </Link>
          .
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          {recent.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                marginBottom: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <Link href={`/tipsters/${p.tipsterId}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {p.tipsterName ?? p.tipsterId}
                </Link>
                <span style={{ color: 'var(--muted)' }}>{statusLabel(p.status)}</span>
              </div>
              <div style={{ marginTop: '0.3rem' }}>
                <strong>{p.selection}</strong>{' '}
                <span style={{ color: 'var(--muted)' }}>
                  ({p.market} @ {p.oddsAtPick.toFixed(2)})
                </span>
              </div>
            </li>
          ))}
          <li style={{ marginTop: '0.25rem' }}>
            <Link href="/feed" style={{ color: 'var(--accent)' }}>
              View all in My feed →
            </Link>
          </li>
        </ul>
      )}

      <h2 style={{ marginTop: '2.5rem', fontSize: '1.2rem' }}>Subscribed</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '0.9rem' }}>
        Tipsters you pay for — their live picks unlock the moment they’re locked,
        before kickoff.
      </p>
      {subs === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          You’re not subscribed to anyone yet.{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            Browse tipsters
          </Link>{' '}
          and subscribe to unlock their live picks.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          {subs.map((s) => {
            const st = subStatus(s.status);
            const renews = renewalLine(s.status, s.currentPeriodEnd);
            return (
              <li
                key={s.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '0.85rem 1rem',
                  marginBottom: '0.6rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <Avatar src={s.avatarUrl} seed={s.tipsterName ?? s.tipsterId} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/tipsters/${s.tipsterId}`}
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {s.tipsterName ?? s.tipsterId}
                    </Link>
                    {s.country ? (
                      <Flag code={s.country} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
                    ) : null}
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                      {renews ? ` · ${renews}` : ''}
                      {s.stats
                        ? ` · ${s.stats.yield.toFixed(1)}% yield · ${s.stats.sampleSize} picks`
                        : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link
                    href="/account/subscriptions"
                    className="btn btn--secondary btn--sm"
                  >
                    Manage
                  </Link>
                  <FollowButton tipsterId={s.tipsterId} size="sm" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 style={{ marginTop: '2.5rem', fontSize: '1.2rem' }}>Following</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '0.9rem' }}>
        Tipsters you track for free. Following surfaces their public record only —
        subscribe to unlock their live picks.
      </p>
      {following === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : followingOnly && followingOnly.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {shownFollowing && shownFollowing.length > 0
            ? 'Everyone you follow is also subscribed — see them above.'
            : "You're not following anyone yet."}{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            Browse tipsters
          </Link>{' '}
          and follow a few to track their record for free.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          {(followingOnly ?? []).map((f) => (
            <li
              key={f.tipsterId}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.85rem 1rem',
                marginBottom: '0.6rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <Avatar src={f.avatarUrl} seed={f.name ?? f.tipsterId} size={40} />
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/tipsters/${f.tipsterId}`}
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                  >
                    {f.name ?? f.tipsterId}
                  </Link>
                  {f.country ? (
                    <Flag code={f.country} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
                  ) : null}
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    {f.stats
                      ? `${f.stats.yield.toFixed(1)}% yield · ${(f.stats.clvAvg * 100).toFixed(1)}% CLV · ${f.stats.sampleSize} picks`
                      : 'No settled picks yet'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Link
                  href={`/tipsters/${f.tipsterId}`}
                  className="btn btn--primary btn--sm"
                >
                  Subscribe
                </Link>
                <FollowButton tipsterId={f.tipsterId} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
