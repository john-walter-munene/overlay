'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, getProfile } from '../../../lib/auth';

/**
 * Auth callback landing (OB-145). Supabase email-confirmation / OAuth links
 * redirect here with the session in the URL hash; `detectSessionInUrl` consumes
 * it, then we resolve the local profile and route by role.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const sb = supabase();
    let done = false;

    const finish = async () => {
      if (done) return;
      done = true;
      const profile = await getProfile();
      router.replace(
        profile
          ? profile.role === 'tipster'
            ? '/dashboard'
            : '/account'
          : '/login',
      );
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
