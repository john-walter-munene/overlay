'use client';

import { useState } from 'react';
import { API_URL } from '../../lib/api';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/newsletter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStatus('error');
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: '0.4rem', fontWeight: 500 }}>
          Email address
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </label>

        <button
          type="submit"
          className="btn btn--primary btn--lg"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>

      {status === 'success' && (
        <p style={{ marginTop: '1.5rem', color: 'var(--accent)' }}>
          Thanks for subscribing! Check your inbox for a confirmation.
        </p>
      )}

      {status === 'error' && (
        <p style={{ marginTop: '1.5rem', color: 'var(--danger, #d33)' }}>
          {error}
        </p>
      )}

      <section
        style={{
          marginTop: '3rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '2rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>
          What you’ll receive
        </h2>
        <ul
          style={{
            paddingLeft: '1.2rem',
            lineHeight: 1.8,
            color: 'var(--muted)',
            margin: 0,
          }}
        >
          <li>Verified tipster marketplace updates</li>
          <li>Platform feature announcements</li>
          <li>Closing line value (CLV) education</li>
          <li>Sports betting analytics articles</li>
          <li>Responsible gambling resources</li>
        </ul>
      </section>
    </>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: '0.5rem',
  padding: '0.8rem 1rem',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'inherit',
  fontSize: '1rem',
  boxSizing: 'border-box' as const,
};
