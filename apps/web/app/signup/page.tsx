'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register, setToken } from '../../lib/auth';
import { formStyles } from '../formStyles';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'tipster'>('user');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const { token } = await register(email, password, role);
      setToken(token);
      router.push(role === 'tipster' ? '/dashboard' : '/account');
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
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label style={{ color: '#9aa4b2', fontSize: '0.9rem' }}>
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
        <button style={formStyles.button} disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ color: '#9aa4b2' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: '#6ea8fe' }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
