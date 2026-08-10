'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getFullProfile, updateUsername, supabase } from '../../lib/auth';
import { formStyles } from '../formStyles';
import AvatarPicker from '../AvatarPicker';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * One-time "choose your username" step. Existing accounts without a username
 * are routed here by the UsernameGate; new signups pass through when their
 * handle didn't persist (e.g. after email confirmation). Prefills from the
 * Supabase metadata captured at signup when available.
 */
export default function ChooseUsernameClient() {
  const t = useTranslations('chooseUsername');
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
      setAvatarUrl(p.avatarUrl);
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
      setError(t('errFormat'));
      return;
    }
    setSaving(true);
    try {
      await updateUsername(handle);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSave'));
      setSaving(false);
    }
  }

  if (!ready) {
    return (
      <main style={formStyles.wrap}>
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      </main>
    );
  }

  return (
    <main style={formStyles.wrap}>
      <h1>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('subtitle')}
      </p>
      <form onSubmit={save} style={formStyles.form}>
        <input
          style={formStyles.input}
          type="text"
          placeholder={t('placeholder')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
        {error ? <p style={formStyles.error}>{error}</p> : null}
        <button className="btn btn--primary" disabled={saving} type="submit">
          {saving ? t('saving') : t('continue')}
        </button>
      </form>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
          {t('profilePicture')}{' '}
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.9rem' }}>
            {t('optional')}
          </span>
        </h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '0.9rem' }}>
          {t('avatarHelp')}
        </p>
        <AvatarPicker
          seed={username || 'you'}
          value={avatarUrl}
          onChange={setAvatarUrl}
        />
      </section>
    </main>
  );
}
