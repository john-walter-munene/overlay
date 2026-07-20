'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  authFetch,
  signOut,
  getFullProfile,
  updateUsername,
  changePassword,
  changeEmail,
  getNotificationPreferences,
  updateNotificationPreferences,
  type FullProfile,
  type NotificationPreferences,
} from '../../lib/auth';
import { formStyles } from '../formStyles';
import AvatarPicker from '../AvatarPicker';

interface Subscription {
  id: string;
  tipsterId: string;
  tipsterName: string | null;
  status: string;
  currentPeriodEnd: string | null;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1.25rem 1.4rem',
};
const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '1.1rem 0',
};
const labelStyle: React.CSSProperties = { color: 'var(--muted)', fontSize: '0.9rem' };

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [subs, setSubs] = useState<Subscription[] | null>(null);

  const [username, setUsername] = useState('');
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getFullProfile();
      console.log("API profile", p);
      if (!p) {
        router.replace('/login');
        return;
      }
      setProfile(p);
      setUsername(p.username ?? '');
      setAvatarUrl(p.avatarUrl);
      authFetch('/api/subscriptions/me')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setSubs(data as Subscription[]))
        .catch(() => setSubs([]));
      getNotificationPreferences().then(setPrefs);
    })();
  }, [router]);

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    setUsernameMsg(null);
    setSavingUsername(true);
    try {
      const updated = await updateUsername(username);
      setProfile(updated);
      setUsernameMsg('Username saved ✓');
    } catch (err) {
      setUsernameMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSavingUsername(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    try {
      await changeEmail(newEmail);
      setEmailMsg('Confirmation sent — check your new inbox to finish.');
      setNewEmail('');
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    try {
      await changePassword(newPassword);
      setPasswordMsg('Password updated ✓');
      setNewPassword('');
    } catch (err) {
      setPasswordMsg(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function logout() {
    await signOut();
    router.push('/');
  }

  async function savePrefs(patch: Partial<NotificationPreferences>) {
    setPrefsMsg(null);
    const previous = prefs;
    setPrefs((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      const updated = await updateNotificationPreferences(patch);
      setPrefs(updated);
      setPrefsMsg('Saved \u2713');
    } catch (err) {
      setPrefs(previous);
      setPrefsMsg(err instanceof Error ? err.message : 'Failed');
    }
  }

  if (!profile) {
    return (
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>
        Welcome, {profile.username ?? 'there'}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Manage your account and activity.
      </p>

      {/* Key actions up top so they're reachable without scrolling. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.6rem',
          margin: '1.25rem 0 0.5rem',
        }}
      >
        {profile.role === 'user' ? (
          <>
            <Link href="/feed" className="btn btn--primary btn--sm">
              My feed
            </Link>
            <Link
              href="/account/subscriptions"
              className="btn btn--secondary btn--sm"
            >
              My subscriptions
            </Link>
          </>
        ) : null}
        {profile.role === 'tipster' ? (
          <>
            <Link href="/dashboard" className="btn btn--primary btn--sm">
              Tipster dashboard
            </Link>
            <Link
              href="/account/subscriptions"
              className="btn btn--secondary btn--sm"
            >
              My subscriptions
            </Link>

            <Link
              href="/account/blog"
              className="btn btn--secondary btn--sm"
            >
              My blog
            </Link>
          </>
        ) : null}
        {profile.role === 'admin' ? (
          <Link href="/admin" className="btn btn--primary btn--sm">
            Admin dashboard
          </Link>
        ) : null}
      </div>

      {/* --- Profile summary --- */}
      <div style={{ ...cardStyle, marginTop: '1.25rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <AvatarPicker
            seed={profile.username ?? profile.userId}
            value={avatarUrl}
            onChange={setAvatarUrl}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.85rem 1.5rem',
          }}
        >
          <Fact label="Username" value={profile.username ?? '— not set —'} />
          <Fact label="Email" value={profile.email} />
          <Fact label="Account type" value={profile.role} />
          <Fact
            label="Member since"
            value={new Date(profile.createdAt).toLocaleDateString()}
          />
          {profile.role === 'tipster' ? (
            <Fact label="Role" value="Verified tipster" />
          ) : (
            <Fact
              label="Subscriptions"
              value={String(profile.subscriptionCount)}
            />
          )}
        </div>
        {profile.role === 'tipster' ? (
          <p style={{ margin: '1rem 0 0' }}>
            <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
              → Tipster dashboard
            </Link>
            {' · '}
            <Link href="/onboarding" style={{ color: 'var(--accent)' }}>
              Onboarding
            </Link>
            {' · '}
            <Link href="/earnings" style={{ color: 'var(--accent)' }}>
              Earnings
            </Link>
          </p>
        ) : null}
      </div>

      {/* --- Settings: a horizontal grid instead of a tall stack of cards --- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.25rem',
          marginTop: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* Login & security — username, email and password in one card */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Login &amp; security</h2>

          <form onSubmit={saveUsername} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>Username</span>
            <input
              style={formStyles.input}
              placeholder="your_handle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              required
            />
            {usernameMsg ? <p style={labelStyle}>{usernameMsg}</p> : null}
            <button style={formStyles.button} disabled={savingUsername}>
              {savingUsername ? 'Saving…' : 'Save username'}
            </button>
          </form>

          <div style={dividerStyle} />

          <form onSubmit={saveEmail} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>Change email</span>
            <input
              style={formStyles.input}
              type="email"
              placeholder="new@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            {emailMsg ? <p style={labelStyle}>{emailMsg}</p> : null}
            <button style={formStyles.button}>Send confirmation</button>
          </form>

          <div style={dividerStyle} />

          <form onSubmit={savePassword} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>Change password</span>
            <input
              style={formStyles.input}
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            {passwordMsg ? <p style={labelStyle}>{passwordMsg}</p> : null}
            <button style={formStyles.button}>Update password</button>
          </form>
        </section>

        {/* --- Notification preferences --- */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Notifications</h2>
          {prefs === null ? (
            <p style={labelStyle}>Loading…</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <input
                  type="checkbox"
                  checked={prefs.emailEnabled}
                  onChange={(e) => savePrefs({ emailEnabled: e.target.checked })}
                />
                Email notifications
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <input
                  type="checkbox"
                  checked={prefs.pushEnabled}
                  onChange={(e) => savePrefs({ pushEnabled: e.target.checked })}
                />
                Push notifications
              </label>
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span style={labelStyle}>New-pick delivery</span>
                <select
                  style={formStyles.input}
                  value={prefs.frequency}
                  onChange={(e) =>
                    savePrefs({
                      frequency: e.target.value as 'instant' | 'daily',
                    })
                  }
                >
                  <option value="instant">Instant — every pick</option>
                  <option value="daily">Daily digest</option>
                </select>
              </label>
              {prefsMsg ? <p style={labelStyle}>{prefsMsg}</p> : null}
            </div>
          )}
        </section>
      </div>

      {/* --- Subscriptions --- */}
      {profile.role === 'admin' ? (
        <p>
          <Link href="/admin/users" style={{ color: 'var(--accent)' }}>
            → Manage users
          </Link>
        </p>
      ) : null}

      {profile.role !== 'tipster' ? (
        <>
          <h2 style={{ marginTop: '2rem' }}>Your subscriptions</h2>
      <p>
        <Link href="/account/subscriptions" style={{ color: 'var(--accent)' }}>
          → Manage subscriptions
        </Link>
      </p>
      {subs === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          No active subscriptions.{' '}
          <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
            Browse tipsters
          </Link>{' '}
          to find a tipster.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {subs.map((s) => (
            <li
              key={s.id}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '0.85rem 0',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Link
                href={`/tipsters/${s.tipsterId}`}
                style={{ color: 'var(--accent)' }}
              >
                {s.tipsterName ?? s.tipsterId}
              </Link>
              <span style={{ color: 'var(--muted)' }}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}
        </>
      ) : null}

      <button
        onClick={logout}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          color: 'var(--muted)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.6rem 1.2rem',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ marginTop: '0.15rem', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
