'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_URL } from '../../../lib/api';

/**
 * Post-checkout return logic. With a real payment provider the subscription is
 * activated asynchronously via webhook. For the local mock provider we trigger
 * that same webhook here so the flow completes end-to-end without Stripe.
 *
 * ref format: mock_sub_<userId>_<tipsterId>
 */
export default function SubscribeSuccessClient() {
  const params = useSearchParams();
  const ref = params.get('ref');
  const [state, setState] = useState<'working' | 'done' | 'pending'>('working');

  useEffect(() => {
    if (!ref) {
      setState('pending');
      return;
    }
    const parts = ref.split('_'); // ['mock','sub',userId,tipsterId]
    const userId = parts[2];
    const tipsterId = parts[3];
    if (!userId || !tipsterId) {
      setState('pending');
      return;
    }
    fetch(`${API_URL}/api/subscriptions/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'activated', userId, tipsterId }),
    })
      .then((r) => setState(r.ok ? 'done' : 'pending'))
      .catch(() => setState('pending'));
  }, [ref]);

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
