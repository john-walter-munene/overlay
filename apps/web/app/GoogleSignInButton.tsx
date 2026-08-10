'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signInWithOAuth } from '../lib/auth';
import { formStyles } from './formStyles';

/**
 * A single social sign-in provider button. Uses the same visual format as the
 * primary "Sign in" button so every provider stacks consistently below the
 * email/password form. Kicks off the Supabase OAuth redirect; the browser
 * returns to /auth/callback, which establishes the session and routes by role.
 */
export default function GoogleSignInButton({
  label,
  role,
}: {
  /** Button text, e.g. t('continueWithGoogle') or t('signUpWithGoogle'). */
  label: string;
  /** Role chosen on the signup page, applied to brand-new accounts. */
  role?: 'user' | 'tipster';
}) {
  const t = useTranslations('auth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      // On success the browser is redirected away, so this promise resolves
      // only once the redirect is initiated.
      await signInWithOAuth('google', role);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('googleSignInFailed'));
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        style={{
          ...formStyles.button,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <GoogleGlyph />
        {label}
      </button>
      {error ? <p style={formStyles.error}>{error}</p> : null}
    </>
  );
}

/** Official multi-colour Google "G" mark. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

/** Small "or" divider used between the OAuth button and the email form. */
export function SocialSignIn({
  label,
  children,
}: {
  /** Divider caption, e.g. t('orContinueWith'). */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: 'var(--muted)',
          fontSize: '0.85rem',
          marginBottom: '0.85rem',
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        {label}
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {children}
      </div>
    </div>
  );
}
