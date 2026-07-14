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
  paid: 'var(--success)',
  pending: 'var(--warning)',
  failed: 'var(--danger)',
};

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.1rem',
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '0.3rem' }}>
        {value}
      </div>
      {hint ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
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
        <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
          ← Dashboard
        </Link>
      </p>
      <h1>Earnings &amp; payouts</h1>
      <p style={{ color: 'var(--muted)' }}>
        Projected earnings update with your active subscribers and the platform
        fee. Payouts are transferred monthly.
      </p>

      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : data === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
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
            <p style={{ color: 'var(--muted)' }}>No payouts yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.5rem 0' }}>Period</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0' }}>{p.period}</td>
                    <td>{money(p.amountCents)}</td>
                    <td style={{ color: STATUS_COLORS[p.status] ?? 'var(--muted)' }}>
                      {p.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <PayoutSettings />
    </main>
  );
}

type PayoutMethod = 'stripe' | 'crypto' | 'mobile_money';

const CHAINS = ['ethereum', 'polygon', 'tron', 'bsc', 'solana'];
const NETWORKS = ['mpesa', 'mtn_momo', 'airtel_money'];

/** Tipster payout-destination settings (OB-06x): pick the rail + its details. */
function PayoutSettings() {
  const [method, setMethod] = useState<PayoutMethod | ''>('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletChain, setWalletChain] = useState('ethereum');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileNetwork, setMobileNetwork] = useState('mpesa');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await authFetch('/api/tipsters/me/profile');
      if (!res.ok) return;
      const p = (await res.json()) as {
        payoutMethod: PayoutMethod | null;
        payoutWalletAddress: string | null;
        payoutWalletChain: string | null;
        payoutMobileNumber: string | null;
        payoutMobileNetwork: string | null;
      };
      setMethod(p.payoutMethod ?? '');
      setWalletAddress(p.payoutWalletAddress ?? '');
      if (p.payoutWalletChain) setWalletChain(p.payoutWalletChain);
      setMobileNumber(p.payoutMobileNumber ?? '');
      if (p.payoutMobileNetwork) setMobileNetwork(p.payoutMobileNetwork);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { payoutMethod: method };
      if (method === 'crypto') {
        body.payoutWalletAddress = walletAddress.trim();
        body.payoutWalletChain = walletChain;
      }
      if (method === 'mobile_money') {
        body.payoutMobileNumber = mobileNumber.trim();
        body.payoutMobileNetwork = mobileNetwork;
      }
      const res = await authFetch('/api/tipsters/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setMsg('Payout settings saved ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    display: 'block',
    marginTop: '0.3rem',
    padding: '0.5rem 0.6rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--fg)',
    minWidth: 260,
  } as const;
  const labelStyle = {
    display: 'block',
    color: 'var(--muted)',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
  } as const;

  return (
    <section
      style={{
        marginTop: '2.5rem',
        padding: '1.25rem',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Payout settings</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Choose how you’d like to be paid. We route your monthly payout to this
        destination.
      </p>
      <form onSubmit={save}>
        <label style={labelStyle}>
          Payout method
          <select
            style={inputStyle}
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          >
            <option value="">Select…</option>
            <option value="stripe">Bank / card (Stripe)</option>
            <option value="crypto">Crypto (stablecoin)</option>
            <option value="mobile_money">Mobile money</option>
          </select>
        </label>

        {method === 'stripe' ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Connect your Stripe payout account from the onboarding wizard.
          </p>
        ) : null}

        {method === 'crypto' ? (
          <>
            <label style={labelStyle}>
              Wallet address
              <input
                style={inputStyle}
                placeholder="0x… / T… / wallet address"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              Chain
              <select
                style={inputStyle}
                value={walletChain}
                onChange={(e) => setWalletChain(e.target.value)}
              >
                {CHAINS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        {method === 'mobile_money' ? (
          <>
            <label style={labelStyle}>
              Mobile number
              <input
                style={inputStyle}
                placeholder="+254700000000"
                inputMode="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              Network
              <select
                style={inputStyle}
                value={mobileNetwork}
                onChange={(e) => setMobileNetwork(e.target.value)}
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <button
          type="submit"
          disabled={busy || !method}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 8,
            padding: '0.6rem 1.2rem',
            fontWeight: 600,
            cursor: busy || !method ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save payout settings'}
        </button>
        {msg ? (
          <p style={{ color: 'var(--accent)', marginTop: '0.75rem' }}>{msg}</p>
        ) : null}
      </form>
    </section>
  );
}
