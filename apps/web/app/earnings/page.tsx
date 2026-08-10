'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('earnings');
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
        if (!res.ok) throw new Error(t('loadError'));
        setData((await res.json()) as Earnings);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('loadError'));
      }
    })();
  }, [router, t]);

  const statusLabel = (s: string) =>
    ['paid', 'pending', 'failed'].includes(s) ? t(`status_${s}`) : s;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
          {t('backDashboard')}
        </Link>
      </p>
      <h1>{t('title')}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {t('intro')}
      </p>

      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : data === null ? (
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      ) : (
        <>
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              margin: '1.5rem 0',
            }}
          >
            <Card
              label={t('projectedNet')}
              value={money(data.projected.netCents)}
              hint={t('projectedNetHint', {
                gross: money(data.projected.grossCents),
                fee: money(data.projected.feeCents),
              })}
            />
            <Card
              label={t('platformFee')}
              value={`${(data.feeRate * 100).toFixed(0)}%`}
              hint={t('platformFeeHint', { fee: money(data.projected.feeCents) })}
            />
            <Card
              label={t('activeSubscribers')}
              value={`${data.activeSubscribers}`}
              hint={t('activeSubscribersHint', {
                price: money(data.subscriptionPriceCents),
              })}
            />
            <Card
              label={t('paidToDate')}
              value={money(data.paidCents)}
              hint={t('paidToDateHint', { pending: money(data.pendingCents) })}
            />
          </section>

          <h2 style={{ marginTop: '2rem' }}>{t('payoutHistory')}</h2>
          {data.payouts.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('noPayouts')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.5rem 0' }}>{t('period')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0' }}>{p.period}</td>
                    <td>{money(p.amountCents)}</td>
                    <td style={{ color: STATUS_COLORS[p.status] ?? 'var(--muted)' }}>
                      {statusLabel(p.status)}
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

type PayoutMethod = 'stripe' | 'paystack' | 'crypto' | 'mobile_money';

const CHAINS = ['ethereum', 'polygon', 'tron', 'bsc', 'solana'];
const NETWORKS = ['mpesa', 'mtn_momo', 'airtel_money'];

/** Tipster payout-destination settings (OB-06x): pick the rail + its details. */
function PayoutSettings() {
  const t = useTranslations('earnings');
  const [method, setMethod] = useState<PayoutMethod | ''>('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletChain, setWalletChain] = useState('ethereum');
  const [mobileNumber, setMobileNumber] = useState('');
  const [mobileNetwork, setMobileNetwork] = useState('mpesa');
  const [bankAccount, setBankAccount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
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
        payoutBankAccount: string | null;
        payoutBankCode: string | null;
        payoutAccountName: string | null;
      };
      setMethod(p.payoutMethod ?? '');
      setWalletAddress(p.payoutWalletAddress ?? '');
      if (p.payoutWalletChain) setWalletChain(p.payoutWalletChain);
      setMobileNumber(p.payoutMobileNumber ?? '');
      if (p.payoutMobileNetwork) setMobileNetwork(p.payoutMobileNetwork);
      setBankAccount(p.payoutBankAccount ?? '');
      setBankCode(p.payoutBankCode ?? '');
      setAccountName(p.payoutAccountName ?? '');
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
      if (method === 'paystack') {
        body.payoutBankAccount = bankAccount.trim();
        body.payoutBankCode = bankCode.trim();
        body.payoutAccountName = accountName.trim();
      }
      const res = await authFetch('/api/tipsters/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setMsg(t('settingsSaved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('saveError'));
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
      <h2 style={{ marginTop: 0 }}>{t('settingsTitle')}</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('settingsIntro')}
      </p>
      <form onSubmit={save}>
        <label style={labelStyle}>
          {t('payoutMethod')}
          <select
            style={inputStyle}
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
          >
            <option value="">{t('select')}</option>
            <option value="stripe">{t('methodStripe')}</option>
            <option value="paystack">{t('methodPaystack')}</option>
            <option value="crypto">{t('methodCrypto')}</option>
            <option value="mobile_money">{t('methodMobile')}</option>
          </select>
        </label>

        {method === 'stripe' ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {t('stripeNote')}
          </p>
        ) : null}

        {method === 'paystack' ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {t('paystackNote')}
            </p>
            <label style={labelStyle}>
              {t('accountName')}
              <input
                style={inputStyle}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('bankAccount')}
              <input
                style={inputStyle}
                placeholder={t('bankAccountPlaceholder')}
                inputMode="numeric"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('bankCode')}
              <input
                style={inputStyle}
                placeholder={t('bankCodePlaceholder')}
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
              />
            </label>
          </>
        ) : null}

        {method === 'crypto' ? (
          <>
            <label style={labelStyle}>
              {t('walletAddress')}
              <input
                style={inputStyle}
                placeholder={t('walletPlaceholder')}
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('chain')}
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
              {t('mobileNumber')}
              <input
                style={inputStyle}
                placeholder="+254700000000"
                inputMode="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('network')}
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
          {busy ? t('saving') : t('saveSettings')}
        </button>
        {msg ? (
          <p style={{ color: 'var(--accent)', marginTop: '0.75rem' }}>{msg}</p>
        ) : null}
      </form>
    </section>
  );
}
