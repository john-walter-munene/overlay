'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../lib/auth';

interface DashboardMetrics {
  users: number;
  tipsters: number;
  activeSubscriptions: number;
  picks: number;
  settledPicks: number;
  pendingPayouts: number;
  grossPendingPayoutCents: number;
  publishedArticles: number;
  draftArticles: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#111826',
        border: '1px solid #1c2430',
        borderRadius: 12,
        padding: '1.25rem 1.4rem',
      }}
    >
      <div
        style={{
          color: '#9aa4b2',
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.9rem', fontWeight: 700, marginTop: '0.35rem' }}>
        {value}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await authFetch('/api/admin/dashboard');
      if (!res.ok) {
        setError('Failed to load metrics.');
        return;
      }
      setMetrics((await res.json()) as DashboardMetrics);
    })();
  }, [router]);

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Admin dashboard</h1>
      <p style={{ color: '#9aa4b2' }}>
        Live platform metrics across users, tipsters, subscriptions, picks and
        payouts.
      </p>
      <p style={{ margin: '0 0 1rem' }}>
        <Link href="/admin/blog" style={{ color: '#6ea8fe' }}>
          Blog authoring →
        </Link>
      </p>

      <nav style={{ display: 'flex', gap: '1rem', margin: '1rem 0 0' }}>
        <a href="/admin/users" style={{ color: '#6ea8fe' }}>
          Manage users →
        </a>
        <a href="/admin/settlements" style={{ color: '#6ea8fe' }}>
          Settlement oversight →
        </a>
      </nav>

      {error ? (
        <p style={{ color: '#ff6b8a' }}>{error}</p>
      ) : metrics === null ? (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem',
            marginTop: '2rem',
          }}
        >
          <MetricCard label="Users" value={metrics.users.toLocaleString()} />
          <MetricCard
            label="Tipsters"
            value={metrics.tipsters.toLocaleString()}
          />
          <MetricCard
            label="Active subs"
            value={metrics.activeSubscriptions.toLocaleString()}
          />
          <MetricCard label="Picks" value={metrics.picks.toLocaleString()} />
          <MetricCard
            label="Settled"
            value={metrics.settledPicks.toLocaleString()}
          />
          <MetricCard
            label="Pending payouts"
            value={metrics.pendingPayouts.toLocaleString()}
          />
          <MetricCard
            label="Pending payout total"
            value={formatCents(metrics.grossPendingPayoutCents)}
          />
          <MetricCard
            label="Articles"
            value={(
              metrics.publishedArticles + metrics.draftArticles
            ).toLocaleString()}
          />
        </div>
      )}
    </main>
  );
}
