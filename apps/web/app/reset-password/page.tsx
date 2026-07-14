'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, changePassword } from '../../lib/auth';
import { formStyles } from '../formStyles';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The recovery link from the email establishes a session in the URL hash;
    // detectSessionInUrl consumes it. Wait for the session before allowing a
    // password change.
    const sb = supabase();
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session) setReady(true);
    });
    sb.auth.getSession().then(({ data }) => {
      setReady((prev) => prev ?? !!data.session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await changePassword(password);
      setMsg('Password updated ✓ Redirecting…');
      setTimeout(() => router.push('/account'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <main style={formStyles.wrap}>
      <h1>Set a new password</h1>
      {ready === false ? (
        <p style={{ color: '#9aa4b2' }}>
          Open the reset link from your email to continue.{' '}
          <Link href="/forgot-password" style={{ color: '#6ea8fe' }}>
            Request a new link
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={onSubmit} style={formStyles.form}>
          <input
            style={formStyles.input}
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          {error ? <p style={formStyles.error}>{error}</p> : null}
          {msg ? <p style={{ color: '#6ee7b7' }}>{msg}</p> : null}
          <button style={formStyles.button}>Update password</button>
        </form>
      )}
    </main>
  );
}
