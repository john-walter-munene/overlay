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
  exportMyData,
  deleteMyAccount,
  type FullProfile,
  type NotificationPreferences,
} from '../../lib/auth';
import { formStyles } from '../formStyles';

interface Subscription {
  id: string;
  tipsterId: string;
  status: string;
  currentPeriodEnd: string | null;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1.25rem 1.4rem',
  marginTop: '1.25rem',
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

  const [privacyMsg, setPrivacyMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getFullProfile();
      if (!p) {
        router.replace('/login');
        return;
      }
      setProfile(p);
      setUsername(p.username ?? '');
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

  async function downloadData() {
    setPrivacyMsg(null);
    try {
      await exportMyData();
      setPrivacyMsg('Export downloaded \u2713');
    } catch (err) {
      setPrivacyMsg(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        'Delete your account? This anonymizes your personal data and cannot be undone.',
      )
    ) {
      return;
    }
    setPrivacyMsg(null);
    setDeleting(true);
    try {
      await deleteMyAccount();
      router.push('/');
    } catch (err) {
      setPrivacyMsg(err instanceof Error ? err.message : 'Failed');
      setDeleting(false);
    }
  }

  if (!profile) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Your account</h1>

      <p>
        <Link href="/feed" style={{ color: '#6ea8fe' }}>
          → My feed (live picks)
        </Link>
      </p>

      {/* --- Profile summary --- */}
      <div style={cardStyle}>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <Row label="Username" value={profile.username ?? '— not set —'} />
          <Row label="Email" value={profile.email} />
          <Row label="Account type" value={profile.role} />
          <Row
            label="Member since"
            value={new Date(profile.createdAt).toLocaleDateString()}
          />
          {profile.role === 'tipster' ? (
            <Row label="Role" value="Verified tipster" />
          ) : (
            <Row
              label="Subscriptions"
              value={String(profile.subscriptionCount)}
            />
          )}
        </div>
        {profile.role === 'tipster' ? (
          <p style={{ marginTop: '1rem' }}>
            <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
              → Go to tipster dashboard
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

      {/* --- Username --- */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Username</h2>
        <form onSubmit={saveUsername} style={{ ...formStyles.form, gap: '0.6rem' }}>
          <input
            style={formStyles.input}
            placeholder="your_handle"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={20}
            required
          />
          <span style={labelStyle}>3–20 chars: letters, numbers, underscore.</span>
          {usernameMsg ? <p style={labelStyle}>{usernameMsg}</p> : null}
          <button style={formStyles.button} disabled={savingUsername}>
            {savingUsername ? 'Saving…' : 'Save username'}
          </button>
        </form>
      </section>

      {/* --- Change email --- */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Change email</h2>
        <form onSubmit={saveEmail} style={{ ...formStyles.form, gap: '0.6rem' }}>
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
      </section>

      {/* --- Change password --- */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Change password</h2>
        <form
          onSubmit={savePassword}
          style={{ ...formStyles.form, gap: '0.6rem' }}
        >
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

      {/* --- Privacy & data --- */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Privacy &amp; data</h2>
        <p style={labelStyle}>
          Download everything we hold about you, or permanently delete your
          account.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={downloadData}
            style={{
              ...formStyles.button,
              width: 'auto',
              background: 'transparent',
              color: 'var(--accent)',
              border: '1px solid var(--border)',
            }}
          >
            Download my data
          </button>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting}
            style={{
              ...formStyles.button,
              width: 'auto',
              background: 'transparent',
              color: '#f85149',
              border: '1px solid #f85149',
            }}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
        {privacyMsg ? (
          <p style={{ ...labelStyle, marginTop: '0.75rem' }}>{privacyMsg}</p>
        ) : null}
      </section>

      {/* --- Subscriptions --- */}
      {profile.role === 'admin' ? (
        <p>
          <Link href="/admin/users" style={{ color: 'var(--accent)' }}>
            → Manage users
          </Link>
        </p>
      ) : null}

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
          <Link href="/" style={{ color: 'var(--accent)' }}>
            Browse the leaderboard
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
                {s.tipsterId}
              </Link>
              <span style={{ color: 'var(--muted)' }}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
