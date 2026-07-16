'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp, updateUsername, checkUsername } from '../../lib/auth';
import { formStyles } from '../formStyles';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'user' | 'tipster'>('user');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const handle = username.trim().toLowerCase();
    if (!USERNAME_RE.test(handle)) {
      setError(
        'Username must be 3–20 characters: lowercase letters, numbers or underscores.',
      );
      return;
    }

    setLoading(true);
    try {
      // Best-effort pre-check so a taken handle fails before we create the auth
      // user (the API still enforces uniqueness when the username is saved).
      const { available, valid } = await checkUsername(handle);
      if (!valid || !available) {
        setError('That username is taken or invalid. Try another.');
        return;
      }

      const { needsConfirmation } = await signUp(
        email,
        password,
        role,
        handle,
      );
      if (needsConfirmation) {
        setInfo(
          'Check your email to confirm your account, then sign in to finish setting up.',
        );
        return;
      }

      // Session is live — persist the username to our profile immediately.
      try {
        await updateUsername(handle);
      } catch {
        /* the username gate will prompt again if this didn't stick */
      }

      const next =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;
      router.push(role === 'tipster' ? '/onboarding' : next || '/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={formStyles.wrap}>
      <h1>Create your account</h1>
      <form onSubmit={onSubmit} style={formStyles.form}>
        <input
          style={formStyles.input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={formStyles.input}
          type="text"
          placeholder="Username (3–20: a–z, 0–9, _)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          style={formStyles.input}
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Account type
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'tipster')}
          >
            <option value="user">
              Bettor — follow &amp; subscribe to tipsters
            </option>
            <option value="tipster">Tipster — publish verified picks</option>
          </select>
        </label>
        {error ? <p style={formStyles.error}>{error}</p> : null}
        {info ? <p style={{ color: 'var(--success)' }}>{info}</p> : null}
        <button style={formStyles.button} disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ color: 'var(--muted)' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
