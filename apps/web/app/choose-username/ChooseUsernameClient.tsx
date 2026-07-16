'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getFullProfile, updateUsername, supabase } from '../../lib/auth';
import { formStyles } from '../formStyles';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * One-time "choose your username" step. Existing accounts without a username
 * are routed here by the UsernameGate; new signups pass through when their
 * handle didn't persist (e.g. after email confirmation). Prefills from the
 * Supabase metadata captured at signup when available.
 */
export default function ChooseUsernameClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const next = params.get('next') || '/account';

  useEffect(() => {
    (async () => {
      const p = await getFullProfile();
      if (!p) {
        router.replace('/login?next=/choose-username');
        return;
      }
      if (p.username) {
        router.replace(next);
        return;
      }
      // Prefill the handle the user chose at signup, if it made it to metadata.
      try {
        const { data } = await supabase().auth.getUser();
        const meta = data.user?.user_metadata as
          | { username?: string }
          | undefined;
        if (meta?.username) setUsername(meta.username);
      } catch {
        /* no metadata — fine */
      }
      setReady(true);
    })();
  }, [router, next]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const handle = username.trim().toLowerCase();
    if (!USERNAME_RE.test(handle)) {
      setError(
        'Username must be 3–20 characters: lowercase letters, numbers or underscores.',
      );
      return;
    }
    setSaving(true);
    try {
      await updateUsername(handle);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save username.');
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <main style={formStyles.wrap}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={formStyles.wrap}>
      <h1>Choose your username</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Pick a public handle to finish setting up your account. You’ll appear as
        this across Overlay Bets.
      </p>
      <form onSubmit={save} style={formStyles.form}>
        <input
          style={formStyles.input}
          type="text"
          placeholder="Username (3–20: a–z, 0–9, _)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
        {error ? <p style={formStyles.error}>{error}</p> : null}
        <button className="btn btn--primary" disabled={saving} type="submit">
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
