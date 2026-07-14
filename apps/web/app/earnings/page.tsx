'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch, getProfile } from '../../lib/auth';

interface PayoutBreakdown {
  grossCents: number;
  feeCents: number;
  netCents: number;
}

interface PayoutRow {
  id: string;
  period: string;
  amountCents: number;
  status: string;
}

interface Earnings {
  activeSubscribers: number;
  subscriptionPriceCents: number;
  feeRate: number;
  projected: PayoutBreakdown;
  paidCents: number;
  pendingCents: number;
  payouts: PayoutRow[];
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#3fb950',
  pending: '#d29922',
  failed: '#f85149',
};

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        border: '1px solid #1c2430',
        borderRadius: 12,
        padding: '1.1rem',
      }}
    >
      <div style={{ color: '#9aa4b2', fontSize: '0.85rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.3rem' }}>
        {value}
      </div>
      {hint ? (
        <div style={{ color: '#6b7484', fontSize: '0.8rem', marginTop: '0.2rem' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function EarningsPage() {
  const router = useRouter();
  const [data, setData] = useState<Earnings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (profile.role !== 'tipster' || !profile.tipsterId) {
        router.replace('/account');
        return;
      }
      try {
        const res = await authFetch('/api/payouts/me');
        if (!res.ok) throw new Error(`Failed to load earnings (${res.status})`);
        setData((await res.json()) as Earnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load earnings');
      }
    })();
  }, [router]);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/dashboard" style={{ color: '#6ea8fe' }}>
          ← Dashboard
        </Link>
      </p>
      <h1>Earnings &amp; payouts</h1>
      <p style={{ color: '#9aa4b2' }}>
        Projected earnings update with your active subscribers and the platform
        fee. Payouts are transferred monthly.
      </p>

      {error ? (
        <p style={{ color: '#f85149' }}>{error}</p>
      ) : data === null ? (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      ) : (
        <>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
              margin: '1.5rem 0',
            }}
          >
            <Card
              label="Projected net (this month)"
              value={money(data.projected.netCents)}
              hint={`Gross ${money(data.projected.grossCents)} − fee ${money(
                data.projected.feeCents,
              )}`}
            />
            <Card
              label="Platform fee"
              value={`${(data.feeRate * 100).toFixed(0)}%`}
              hint={`${money(data.projected.feeCents)} this month`}
            />
            <Card
              label="Active subscribers"
              value={`${data.activeSubscribers}`}
              hint={`@ ${money(data.subscriptionPriceCents)} / mo`}
            />
            <Card
              label="Paid to date"
              value={money(data.paidCents)}
              hint={`${money(data.pendingCents)} pending`}
            />
          </section>

          <h2 style={{ marginTop: '2rem' }}>Payout history</h2>
          {data.payouts.length === 0 ? (
            <p style={{ color: '#9aa4b2' }}>No payouts yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#9aa4b2' }}>
                  <th style={{ padding: '0.5rem 0' }}>Period</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid #1c2430' }}>
                    <td style={{ padding: '0.5rem 0' }}>{p.period}</td>
                    <td>{money(p.amountCents)}</td>
                    <td style={{ color: STATUS_COLORS[p.status] ?? '#9aa4b2' }}>
                      {p.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
