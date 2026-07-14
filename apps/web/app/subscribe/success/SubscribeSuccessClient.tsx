'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_URL } from '../../../lib/api';

/**
 * Post-checkout return logic. With a real payment provider the subscription is
 * activated asynchronously via webhook. For dev providers (mock / crypto /
 * mobile money without keys) we trigger that same webhook here so the flow
 * completes end-to-end without a real processor.
 *
 * Preferred params: provider=<name>&u=<userId>&t=<tipsterId>.
 * Legacy fallback: ref=mock_sub_<userId>_<tipsterId>.
 */
export default function SubscribeSuccessClient() {
  const params = useSearchParams();
  const [state, setState] = useState<'working' | 'done' | 'pending'>('working');

  useEffect(() => {
    // Preferred explicit params.
    let provider = params.get('provider');
    let userId = params.get('u');
    let tipsterId = params.get('t');

    // Legacy ref fallback: mock_sub_<userId>_<tipsterId>.
    if (!userId || !tipsterId) {
      const ref = params.get('ref');
      const parts = ref?.split('_') ?? [];
      if (parts[0] === 'mock' && parts[1] === 'sub') {
        provider = provider ?? 'mock';
        userId = parts[2];
        tipsterId = parts[3];
      }
    }

    if (!userId || !tipsterId) {
      setState('pending');
      return;
    }

    // Route to the specific provider's webhook when known, else the default.
    const path = provider
      ? `/api/subscriptions/webhook/${encodeURIComponent(provider)}`
      : '/api/subscriptions/webhook';

    fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'activated', userId, tipsterId }),
    })
      .then((r) => setState(r.ok ? 'done' : 'pending'))
      .catch(() => setState('pending'));
  }, [params]);

  return (
    <>
      <h1>{state === 'done' ? 'You’re subscribed 🎉' : 'Finishing up…'}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {state === 'done'
          ? 'Your subscription is active. You now get this tipster’s live picks the moment they’re locked.'
          : state === 'pending'
            ? 'Your subscription is being activated. It will appear on your account shortly.'
            : 'Confirming your subscription…'}
      </p>
      <p>
        <Link href="/account" style={{ color: 'var(--accent)' }}>
          → Go to your account
        </Link>
      </p>
    </>
  );
}
