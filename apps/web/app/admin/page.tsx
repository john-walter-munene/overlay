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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem 1.4rem',
      }}
    >
      <div
        style={{
          color: 'var(--muted)',
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

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(currentMonth);
  const [sport, setSport] = useState('');
  const [opMsg, setOpMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

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

  async function runPayouts(e: React.FormEvent) {
    e.preventDefault();
    setOpMsg(null);
    setRunning(true);
    try {
      const res = await authFetch('/api/payouts/run', {
        method: 'POST',
        body: JSON.stringify({ period }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        throw new Error(
          (Array.isArray(body.message) ? body.message[0] : body.message) ??
            `Failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { processed?: number };
      setOpMsg(
        `Payouts run for ${period}${
          data.processed != null ? ` — ${data.processed} processed` : ''
        } ✓`,
      );
    } catch (err) {
      setOpMsg(err instanceof Error ? err.message : 'Failed to run payouts');
    } finally {
      setRunning(false);
    }
  }

  async function ingestEvents(e: React.FormEvent) {
    e.preventDefault();
    setOpMsg(null);
    if (!sport.trim()) {
      setOpMsg('Enter a sport to ingest.');
      return;
    }
    setRunning(true);
    try {
      const res = await authFetch('/api/events/ingest', {
        method: 'POST',
        body: JSON.stringify({ sport: sport.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        throw new Error(
          (Array.isArray(body.message) ? body.message[0] : body.message) ??
            `Failed (${res.status})`,
        );
      }
      const data = (await res.json()) as { ingested?: number };
      setOpMsg(`Ingested ${data.ingested ?? 0} ${sport.trim()} events ✓`);
    } catch (err) {
      setOpMsg(err instanceof Error ? err.message : 'Failed to ingest events');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Admin dashboard</h1>
      <p style={{ color: 'var(--muted)' }}>
        Live platform metrics across users, tipsters, subscriptions, picks and
        payouts.
      </p>
      <nav
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          margin: '0 0 1rem',
        }}
      >
        {[
          { href: '/admin/users', label: 'Users & roles' },
          { href: '/admin/settlements', label: 'Settlements' },
          { href: '/admin/reports', label: 'Tipster feedback' },
          { href: '/admin/payouts', label: 'Payout approvals' },
          { href: '/admin/audit-log', label: 'Audit log' },
          { href: '/admin/blog', label: 'Blog authoring' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0.55rem 0.95rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontSize: '0.95rem',
            }}
          >
            {item.label} →
          </Link>
        ))}
      </nav>

      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : metrics === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
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

      <section
        style={{
          marginTop: '2.5rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.5rem',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Operations</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Run monthly tipster payouts and ingest fixtures from the sports
          provider.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <form onSubmit={runPayouts} style={{ display: 'grid', gap: '0.5rem' }}>
            <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Payout period (YYYY-MM)
            </label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-07"
              pattern="\d{4}-\d{2}"
              style={{
                background: '#0d1117',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.5rem 0.7rem',
                color: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={running}
              style={{
                background: '#238636',
                border: 'none',
                borderRadius: 8,
                padding: '0.55rem 0.95rem',
                color: '#fff',
                cursor: running ? 'default' : 'pointer',
              }}
            >
              {running ? 'Working…' : 'Run payouts'}
            </button>
          </form>

          <form
            onSubmit={ingestEvents}
            style={{ display: 'grid', gap: '0.5rem' }}
          >
            <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Ingest events (sport)
            </label>
            <input
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              placeholder="soccer_epl"
              style={{
                background: '#0d1117',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.5rem 0.7rem',
                color: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={running}
              style={{
                background: '#1f6feb',
                border: 'none',
                borderRadius: 8,
                padding: '0.55rem 0.95rem',
                color: '#fff',
                cursor: running ? 'default' : 'pointer',
              }}
            >
              {running ? 'Working…' : 'Ingest events'}
            </button>
          </form>
        </div>
        {opMsg ? (
          <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>{opMsg}</p>
        ) : null}
      </section>
    </main>
  );
}
