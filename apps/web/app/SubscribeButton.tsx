'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getAccessToken } from '../lib/auth';

/**
 * Subscribe CTA. Uses the Supabase session; unauthenticated users are sent to
 * sign in with a return path back to this tipster, then the checkout runs.
 */
export default function SubscribeButton({
  tipsterId,
  priceCents,
}: {
  tipsterId: string;
  priceCents: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await authFetch('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ tipsterId }),
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

  return (
    <div>
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
        {loading
          ? 'Redirecting…'
          : `Subscribe · $${(priceCents / 100).toFixed(2)}/mo`}
      </button>
      {error ? (
        <p style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{error}</p>
      ) : null}
    </div>
  );
}
