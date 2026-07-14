'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { currentSession } from '../lib/auth';

export default function SiteHeader() {
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRole(currentSession()?.role ?? null);
    setReady(true);
  }, []);

  return (
    <header
      style={{
        borderBottom: '1px solid #1c2430',
        padding: '0.9rem 1.5rem',
        display: 'flex',
        gap: '1.25rem',
        alignItems: 'center',
        maxWidth: 980,
        margin: '0 auto',
      }}
    >
      <Link
        href="/"
        style={{ color: '#e6e6e6', fontWeight: 700, textDecoration: 'none' }}
      >
        Overlay Bets
      </Link>
      <nav style={{ display: 'flex', gap: '1rem', flex: 1 }}>
        <Link href="/" style={{ color: '#9aa4b2' }}>
          Leaderboard
        </Link>
        <Link href="/marketplace" style={{ color: '#9aa4b2' }}>
          Marketplace
        </Link>
        <Link href="/blog" style={{ color: '#9aa4b2' }}>
          Blog
        </Link>
        {role === 'tipster' ? (
          <Link href="/dashboard" style={{ color: '#9aa4b2' }}>
            Dashboard
          </Link>
        ) : null}
      </nav>
      {ready ? (
        role ? (
          <Link href="/account" style={{ color: '#6ea8fe' }}>
            Account
          </Link>
        ) : (
          <>
            <Link href="/login" style={{ color: '#9aa4b2' }}>
              Sign in
            </Link>
            <Link href="/signup" style={{ color: '#6ea8fe' }}>
              Get started
            </Link>
          </>
        )
      ) : null}
    </header>
  );
}
