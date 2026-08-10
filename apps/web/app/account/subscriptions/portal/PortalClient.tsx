'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  toSubscriptionView,
  sortSubscriptions,
  type SubscriptionRecord,
} from '@overlay/shared/subscriptions';
import { API_URL } from '../../../../lib/api';
import { authFetch, getProfile } from '../../../../lib/auth';

const MUTED = 'var(--muted)';

/**
 * Local mock billing portal (OB-013). The real Stripe billing portal handles
 * cancel/resume in production; with the mock payment provider there is no
 * hosted portal, so this stand-in cancels/resumes a subscription by firing the
 * same webhook Stripe would send — proving the status change end-to-end.
 */
export default function PortalClient() {
  const t = useTranslations('portal');
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
      <h1>{t('title')}</h1>
      <p style={{ color: MUTED }}>
        {t('intro')}
      </p>

      {subs === null ? (
        <p style={{ color: MUTED }}>{t('loading')}</p>
      ) : views.length === 0 ? (
        <p style={{ color: MUTED }}>{t('empty')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
          {views.map((v) => (
            <li
              key={v.id}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '1rem 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <strong>{v.tipsterName ?? v.tipsterId}</strong>
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
                  color: v.isActive ? 'var(--danger)' : 'var(--success)',
                  border: `1px solid ${v.isActive ? 'var(--danger)' : 'var(--success)'}`,
                  borderRadius: 8,
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  cursor: busy === v.tipsterId ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {busy === v.tipsterId ? t('working') : v.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: '2rem' }}>
        <Link href="/account/subscriptions" style={{ color: 'var(--accent)' }}>
          {t('done')}
        </Link>
      </p>
    </main>
  );
}
