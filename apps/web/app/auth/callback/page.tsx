'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  supabase,
  getFullProfile,
  takePendingOAuthRole,
  setSelfRole,
} from '../../../lib/auth';

/**
 * Auth callback landing (OB-145). Supabase email-confirmation / OAuth links
 * redirect here with the session in the URL hash; `detectSessionInUrl` consumes
 * it, then we resolve the local profile and route by role.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Capture the link type (signup / recovery / email_change) BEFORE the
    // client consumes the URL hash, so we can route new tipsters to onboarding.
    const hash =
      typeof window !== 'undefined'
        ? window.location.hash.replace(/^#/, '')
        : '';
    const linkType = new URLSearchParams(hash).get('type');
    const sb = supabase();
    let done = false;

    const finish = async () => {
      if (done) return;
      done = true;

      // Social sign-up: apply the role picked before the redirect. Supabase
      // only reads user_metadata.role when the API first provisions the
      // account, so this must happen before getFullProfile() below. It's a
      // no-op for the role of existing users.
      const pendingRole = takePendingOAuthRole();
      if (pendingRole) {
        try {
          await setSelfRole(pendingRole);
        } catch {
          /* non-fatal — new account falls back to bettor */
        }
      }

      const profile = await getFullProfile();
      let dest = '/login';
      if (profile) {
        // Fresh accounts (email signup link or a brand-new social login) have
        // no handle yet and route to onboarding first.
        const isNewSignup = linkType === 'signup' || !profile.username;
        const roleDest =
          profile.role === 'tipster'
            ? isNewSignup
              ? '/onboarding'
              : '/dashboard'
            : profile.role === 'admin' || profile.role === 'staff'
              ? '/admin'
              : '/account';
        // Any account without a username must pick one first (matches the
        // UsernameGate and the email-signup flow).
        dest = profile.username
          ? roleDest
          : `/choose-username?next=${encodeURIComponent(roleDest)}`;
      }
      router.replace(dest);
    };

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) void finish();
    });
    // In case the session is already available synchronously.
    sb.auth.getSession().then(({ data }) => {
      if (data.session) void finish();
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ color: 'var(--muted)' }}>Signing you in…</p>
    </main>
  );
}
