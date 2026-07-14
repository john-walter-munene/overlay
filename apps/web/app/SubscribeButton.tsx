'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CURRENCY_CODES } from '@overlay/shared/currencies';
import { authFetch, getAccessToken } from '../lib/auth';
import {
  PAYMENT_METHOD_LABELS,
  detectCountry,
  getSubscriptionQuote,
  listPaymentMethods,
  type PaymentMethodId,
  type SubscriptionQuote,
} from '../lib/api';

/**
 * Subscribe CTA. Uses the Supabase session; unauthenticated users are sent to
 * sign in with a return path back to this tipster, then the checkout runs. When
 * more than one payment method is enabled the subscriber picks one first; the
 * price is auto-quoted in their local currency (from their browser region),
 * which they can override. The original USD price is always shown.
 */
export default function SubscribeButton({
  tipsterId,
  priceCents,
  billingInterval = 'monthly',
}: {
  tipsterId: string;
  priceCents: number;
  billingInterval?: 'weekly' | 'monthly';
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethodId[]>([]);
  const [method, setMethod] = useState<PaymentMethodId | ''>('');
  const [currency, setCurrency] = useState('USD');
  const [quote, setQuote] = useState<SubscriptionQuote | null>(null);

  const period = billingInterval === 'weekly' ? 'wk' : 'mo';
  const baseDisplay = `$${(priceCents / 100).toFixed(2)}`;

  useEffect(() => {
    listPaymentMethods().then((m) => {
      setMethods(m);
      if (m.length > 0) setMethod(m[0]);
    });
    // Auto-detect the local currency from the browser region.
    const detected = detectCountry();
    getSubscriptionQuote(tipsterId, { country: detected }).then((q) => {
      if (q) {
        setQuote(q);
        setCurrency(q.currency);
      }
    });
  }, [tipsterId]);

  function changeCurrency(next: string) {
    setCurrency(next);
    getSubscriptionQuote(tipsterId, { currency: next }).then(setQuote);
  }

  if (priceCents <= 0) {
    return (
      <p style={{ color: 'var(--muted)' }}>
        This tipster isn’t accepting subscriptions yet.
      </p>
    );
  }

  async function subscribe() {
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      // Not signed in — send to login, then return here to subscribe.
      const next =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : `/tipsters/${tipsterId}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { tipsterId };
      if (method) payload.method = method;
      if (currency) payload.currency = currency;
      const res = await authFetch('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Subscription started.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const selectStyle = {
    display: 'block',
    marginTop: '0.3rem',
    padding: '0.5rem 0.6rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--fg)',
    minWidth: 160,
  } as const;
  const labelStyle = {
    display: 'block',
    color: 'var(--muted)',
    fontSize: '0.85rem',
    marginBottom: '0.5rem',
  } as const;

  return (
    <div>
      {methods.length > 1 ? (
        <label style={labelStyle}>
          Pay with
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethodId)}
            style={{ ...selectStyle, minWidth: 220 }}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label style={labelStyle}>
        Currency
        <select
          value={currency}
          onChange={(e) => changeCurrency(e.target.value)}
          style={selectStyle}
        >
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={subscribe}
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          border: 'none',
          borderRadius: 8,
          padding: '0.7rem 1.4rem',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Redirecting…' : `Subscribe · ${baseDisplay}/${period}`}
      </button>

      {/* Always show the original (USD) price; add the local estimate when it
          differs from the base currency. */}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
        Billed at {baseDisplay} USD/{period}
        {quote && quote.converted
          ? ` · ≈ ${quote.display}/${period}`
          : ''}
      </p>

      {error ? (
        <p style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{error}</p>
      ) : null}
    </div>
  );
}
