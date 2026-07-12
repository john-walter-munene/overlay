'use client';

import { useState } from 'react';
import { API_URL } from '../lib/api';

/**
 * Minimal subscribe CTA. Reads a bearer token from localStorage ('ob_token')
 * set by the (future) auth flow, calls the checkout endpoint, and redirects to
 * the returned checkout URL. Falls back to a sign-in prompt when unauthenticated.
 */
export default function SubscribeButton({
  tipsterId,
  priceCents,
}: {
  tipsterId: string;
  priceCents: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (priceCents <= 0) {
    return (
      <p style={{ color: '#9aa4b2' }}>
        This tipster isn’t accepting subscriptions yet.
      </p>
    );
  }

  async function subscribe() {
    setError(null);
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('ob_token') : null;
    if (!token) {
      setError('Please sign in to subscribe.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
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
          background: '#6ea8fe',
          color: '#0b0e14',
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
        <p style={{ color: '#f0a', marginTop: '0.5rem' }}>{error}</p>
      ) : null}
    </div>
  );
}
