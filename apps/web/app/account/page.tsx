'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch, signOut, getProfile, supabase } from '../../lib/auth';

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
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      setRole(profile.role);
      const { data } = await supabase().auth.getUser();
      setEmail(data.user?.email ?? null);
      authFetch('/api/subscriptions/me')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setSubs(data as Subscription[]))
        .catch(() => setSubs([]));
    })();
  }, [router]);

  async function logout() {
    await signOut();
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Your account</h1>
      <p style={{ color: 'var(--muted)' }}>
        {role ? `Signed in as ${role}` : 'Loading…'}
      </p>

      {role === 'tipster' ? (
        <p>
          <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
            → Go to tipster dashboard
          </Link>
          {' · '}
          <Link href="/onboarding" style={{ color: 'var(--accent)' }}>
            Onboarding
          </Link>
        </p>
      ) : null}

      {role === 'admin' ? (
        <p>
          <Link href="/admin/users" style={{ color: 'var(--accent)' }}>
            → Manage users
          </Link>
        </p>
      ) : null}

      <h2 style={{ marginTop: '2rem' }}>Your subscriptions</h2>
      {subs === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No active subscriptions.{' '}
          <Link href="/" style={{ color: 'var(--accent)' }}>
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
                borderTop: '1px solid var(--border)',
                padding: '0.85rem 0',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Link
                href={`/tipsters/${s.tipsterId}`}
                style={{ color: 'var(--accent)' }}
              >
                {s.tipsterId}
              </Link>
              <span style={{ color: 'var(--muted)' }}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={logout}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          color: 'var(--muted)',
          border: '1px solid var(--border)',
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
