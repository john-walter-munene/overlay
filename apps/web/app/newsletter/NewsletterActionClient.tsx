'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { API_URL } from '../../lib/api';

type State = 'working' | 'done' | 'error';

/**
 * Shared client screen for the token-authenticated newsletter double opt-in
 * confirmation and one-click unsubscribe links. Calls the public API endpoint
 * with the token from the URL and reports the outcome.
 */
export default function NewsletterActionClient({
  action,
  workingText,
  successTitle,
  successText,
  errorText,
}: {
  action: 'confirm' | 'unsubscribe';
  workingText: string;
  successTitle: string;
  successText: string;
  errorText: string;
}) {
  const params = useSearchParams();
  const [state, setState] = useState<State>('working');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      return;
    }
    fetch(`${API_URL}/api/newsletter/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => setState(r.ok ? 'done' : 'error'))
      .catch(() => setState('error'));
  }, [params, action]);

  return (
    <>
      <h1>{state === 'done' ? successTitle : state === 'error' ? 'Something went wrong' : 'Please wait…'}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {state === 'done'
          ? successText
          : state === 'error'
            ? errorText
            : workingText}
      </p>
      <p>
        <Link href="/newsletter" style={{ color: 'var(--accent)' }}>
          → Back to the newsletter
        </Link>
      </p>
    </>
  );
}
