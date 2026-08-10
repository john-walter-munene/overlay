'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { signIn, getProfile } from '../../lib/auth';
import { formStyles } from '../formStyles';
import GoogleSignInButton, { SocialSignIn } from '../GoogleSignInButton';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      const next =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null;
      if (next) {
        router.push(next);
        return;
      }
      const profile = await getProfile();
      router.push(
        profile?.role === 'admin' || profile?.role === 'staff'
          ? '/admin'
          : profile?.role === 'tipster'
            ? '/dashboard'
            : '/account',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={formStyles.wrap}>
      <h1>{t('signIn')}</h1>
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
          placeholder={t('password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p style={formStyles.error}>{error}</p> : null}
        <button style={formStyles.button} disabled={loading}>
          {loading ? t('signingIn') : t('signIn')}
        </button>
      </form>
      <SocialSignIn label={t('orContinueWith')}>
        <GoogleSignInButton label={t('continueWithGoogle')} />
      </SocialSignIn>
      <p style={{ color: 'var(--muted)' }}>
        {t('noAccount')}{' '}
        <Link href="/signup" style={{ color: 'var(--accent)' }}>
          {t('createOne')}
        </Link>
      </p>
      <p style={{ color: 'var(--muted)' }}>
        <Link href="/forgot-password" style={{ color: 'var(--accent)' }}>
          {t('forgotPassword')}
        </Link>
      </p>
    </main>
  );
}
