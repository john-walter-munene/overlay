'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordReset } from '../../lib/auth';
import { formStyles } from '../formStyles';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setMsg('If an account exists for that email, a reset link is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={formStyles.wrap}>
      <h1>Reset your password</h1>
      <p style={{ color: '#9aa4b2' }}>
        Enter your email and we&apos;ll send a link to set a new password.
      </p>
      <form onSubmit={onSubmit} style={formStyles.form}>
        <input
          style={formStyles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error ? <p style={formStyles.error}>{error}</p> : null}
        {msg ? <p style={{ color: '#6ee7b7' }}>{msg}</p> : null}
        <button style={formStyles.button} disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p style={{ color: '#9aa4b2' }}>
        <Link href="/login" style={{ color: '#6ea8fe' }}>
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
