'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch, clearToken, currentSession } from '../../lib/auth';

interface Subscription {
  id: string;
  tipsterId: string;
  status: string;
  currentPeriodEnd: string | null;
}

export default function AccountPage() {
  const router = useRouter();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const session = currentSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setRole(session.role);
    setEmail(session.sub);
    authFetch('/api/subscriptions/me')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSubs(data as Subscription[]))
      .catch(() => setSubs([]));
  }, [router]);

  function logout() {
    clearToken();
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Your account</h1>
      <p style={{ color: '#9aa4b2' }}>
        {role ? `Signed in as ${role}` : 'Loading…'}
      </p>

      {role === 'tipster' ? (
        <p>
          <Link href="/dashboard" style={{ color: '#6ea8fe' }}>
            → Go to tipster dashboard
          </Link>
        </p>
      ) : null}

      <h2 style={{ marginTop: '2rem' }}>Your subscriptions</h2>
      {subs === null ? (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <p style={{ color: '#9aa4b2' }}>
          No active subscriptions.{' '}
          <Link href="/" style={{ color: '#6ea8fe' }}>
            Browse the leaderboard
          </Link>{' '}
          to find a tipster.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {subs.map((s) => (
            <li
              key={s.id}
              style={{
                borderTop: '1px solid #1c2430',
                padding: '0.85rem 0',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Link
                href={`/tipsters/${s.tipsterId}`}
                style={{ color: '#6ea8fe' }}
              >
                {s.tipsterId}
              </Link>
              <span style={{ color: '#9aa4b2' }}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={logout}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          color: '#9aa4b2',
          border: '1px solid #1c2430',
          borderRadius: 8,
          padding: '0.6rem 1.2rem',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </main>
  );
}
