'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  toSubscriptionView,
  sortSubscriptions,
  type SubscriptionRecord,
} from '@overlay/shared/subscriptions';
import { API_URL } from '../../../../lib/api';
import { authFetch, getProfile } from '../../../../lib/auth';

const MUTED = '#9aa4b2';

/**
 * Local mock billing portal (OB-013). The real Stripe billing portal handles
 * cancel/resume in production; with the mock payment provider there is no
 * hosted portal, so this stand-in cancels/resumes a subscription by firing the
 * same webhook Stripe would send — proving the status change end-to-end.
 */
export default function PortalClient() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const res = await authFetch('/api/subscriptions/me');
      const data = res.ok ? ((await res.json()) as SubscriptionRecord[]) : [];
      setSubs(data);
    } catch {
      setSubs([]);
    }
  }

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login?next=/account/subscriptions');
        return;
      }
      setUserId(profile.userId);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function change(tipsterId: string, type: 'canceled' | 'activated') {
    if (!userId) return;
    setBusy(tipsterId);
    try {
      await fetch(`${API_URL}/api/subscriptions/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, userId, tipsterId }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const views = subs
    ? sortSubscriptions(subs).map((s) => toSubscriptionView(s))
    : [];

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Billing portal</h1>
      <p style={{ color: MUTED }}>
        Cancel or resume your subscriptions. Changes take effect immediately.
      </p>

      {subs === null ? (
        <p style={{ color: MUTED }}>Loading…</p>
      ) : views.length === 0 ? (
        <p style={{ color: MUTED }}>You have no subscriptions to manage.</p>
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
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <strong>{v.tipsterId}</strong>
                <div style={{ color: MUTED, marginTop: '0.25rem' }}>
                  {v.statusLabel}
                  {v.periodEndLabel ? ` · ${v.periodEndLabel}` : ''}
                </div>
              </div>
              <button
                onClick={() =>
                  change(v.tipsterId, v.isActive ? 'canceled' : 'activated')
                }
                disabled={busy === v.tipsterId}
                style={{
                  background: 'transparent',
                  color: v.isActive ? '#f0a' : '#4ade80',
                  border: `1px solid ${v.isActive ? '#f0a' : '#4ade80'}`,
                  borderRadius: 8,
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  cursor: busy === v.tipsterId ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {busy === v.tipsterId ? 'Working…' : v.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: '2rem' }}>
        <Link href="/account/subscriptions" style={{ color: '#6ea8fe' }}>
          ← Done
        </Link>
      </p>
    </main>
  );
}
