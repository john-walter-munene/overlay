'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  toSubscriptionView,
  sortSubscriptions,
  type SubscriptionRecord,
} from '@overlay/shared/subscriptions';
import { authFetch, getProfile } from '../../../lib/auth';

const MUTED = '#9aa4b2';

/**
 * Subscriptions management UI (OB-013). Lists the subscriber's active/canceled
 * subscriptions with status and next billing (current period end) date, and
 * links out to the Stripe billing portal to cancel/resume.
 */
export default function SubscriptionsClient() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login?next=/account/subscriptions');
        return;
      }
      try {
        const res = await authFetch('/api/subscriptions/me');
        const data = res.ok ? ((await res.json()) as SubscriptionRecord[]) : [];
        setSubs(data);
      } catch {
        setSubs([]);
      }
    })();
  }, [router]);

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const res = await authFetch('/api/subscriptions/portal', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Could not open billing portal (${res.status})`);
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Billing portal is unavailable right now.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPortalLoading(false);
    }
  }

  const views = subs
    ? sortSubscriptions(subs).map((s) => toSubscriptionView(s))
    : [];

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p>
        <Link href="/account" style={{ color: '#6ea8fe' }}>
          ← Back to account
        </Link>
      </p>
      <h1>Your subscriptions</h1>
      <p style={{ color: MUTED }}>
        Manage your tipster subscriptions. Cancel or resume any subscription
        through the secure billing portal.
      </p>

      {subs === null ? (
        <p style={{ color: MUTED }}>Loading…</p>
      ) : views.length === 0 ? (
        <p style={{ color: MUTED }}>
          No subscriptions yet.{' '}
          <Link href="/marketplace" style={{ color: '#6ea8fe' }}>
            Browse tipsters
          </Link>{' '}
          to get started.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
          {views.map((v) => (
            <li
              key={v.id}
              style={{
                borderTop: '1px solid #1c2430',
                padding: '1rem 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '1rem',
              }}
            >
              <div>
                <Link
                  href={`/tipsters/${v.tipsterId}`}
                  style={{ color: '#6ea8fe', fontWeight: 600 }}
                >
                  {v.tipsterId}
                </Link>
                {v.periodEndLabel ? (
                  <div style={{ color: MUTED, marginTop: '0.25rem' }}>
                    {v.periodEndLabel}
                  </div>
                ) : null}
              </div>
              <span
                style={{
                  color: v.isActive ? '#4ade80' : MUTED,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {v.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      )}

      {subs && views.length > 0 ? (
        <button
          onClick={openPortal}
          disabled={portalLoading}
          style={{
            marginTop: '1.5rem',
            background: '#6ea8fe',
            color: '#0b0e14',
            border: 'none',
            borderRadius: 8,
            padding: '0.7rem 1.4rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: portalLoading ? 'default' : 'pointer',
          }}
        >
          {portalLoading
            ? 'Opening billing portal…'
            : 'Manage billing (cancel / resume)'}
        </button>
      ) : null}
      {error ? (
        <p style={{ color: '#f0a', marginTop: '0.75rem' }}>{error}</p>
      ) : null}
    </main>
  );
}
