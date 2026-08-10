'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { signUp } from '../../lib/auth';
import { formStyles } from '../formStyles';
import GoogleSignInButton, { SocialSignIn } from '../GoogleSignInButton';

export default function SignupPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'tipster'>('user');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email, password, role);
      if (needsConfirmation) {
        setInfo(t('confirmEmail'));
        return;
      }

      // Session is live — send the user to pick their handle, then on to their
      // destination. The UsernameGate also enforces this for any account
      // without a username.
      const next =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;
      const dest = role === 'tipster' ? '/onboarding' : next || '/account';
      router.push(`/choose-username?next=${encodeURIComponent(dest)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('registrationFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={formStyles.wrap}>
      <h1>{t('createAccountTitle')}</h1>
      <form onSubmit={onSubmit} style={formStyles.form}>
        <input
          style={formStyles.input}
          type="email"
          placeholder={t('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={formStyles.input}
          type="password"
          placeholder={t('passwordMin')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {t('accountType')}
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'tipster')}
          >
            <option value="user">{t('roleBettor')}</option>
            <option value="tipster">{t('roleTipster')}</option>
          </select>
        </label>
        {error ? <p style={formStyles.error}>{error}</p> : null}
        {info ? <p style={{ color: 'var(--success)' }}>{info}</p> : null}
        <button style={formStyles.button} disabled={loading}>
          {loading ? t('creating') : t('createAccount')}
        </button>
      </form>
      <SocialSignIn label={t('orContinueWith')}>
        <GoogleSignInButton label={t('signUpWithGoogle')} role={role} />
      </SocialSignIn>
      <p style={{ color: 'var(--muted)' }}>
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" style={{ color: 'var(--accent)' }}>
          {t('signIn')}
        </Link>
      </p>
    </main>
  );
}
