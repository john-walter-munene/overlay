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
  type FullProfile,
} from '../../lib/auth';
import { formStyles } from '../formStyles';

interface Subscription {
  id: string;
  tipsterId: string;
  status: string;
  currentPeriodEnd: string | null;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #1c2430',
  borderRadius: 10,
  padding: '1.25rem 1.4rem',
  marginTop: '1.25rem',
};
const labelStyle: React.CSSProperties = { color: '#9aa4b2', fontSize: '0.9rem' };

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

  if (!profile) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Your account</h1>

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
            <Link href="/dashboard" style={{ color: '#6ea8fe' }}>
              → Go to tipster dashboard
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

      {/* --- Subscriptions --- */}
      {role === 'admin' ? (
        <p>
          <Link href="/admin/users" style={{ color: '#6ea8fe' }}>
            → Manage users
          </Link>
        </p>
      ) : null}

      <h2 style={{ marginTop: '2rem' }}>Your subscriptions</h2>
      {subs === null ? (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      ) : subs.length === 0 ? (
        <p style={{ color: '#9aa4b2' }}>
          No active subscriptions.{' '}
          <Link href="/" style={{ color: '#6ea8fe' }}>
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
                borderTop: '1px solid #1c2430',
                padding: '0.85rem 0',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Link href={`/tipsters/${s.tipsterId}`} style={{ color: '#6ea8fe' }}>
                {s.tipsterId}
              </Link>
              <span style={{ color: '#9aa4b2' }}>{s.status}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={logout}
        style={{
          marginTop: '2rem',
          background: 'transparent',
          color: '#9aa4b2',
          border: '1px solid #1c2430',
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
      <span style={{ color: '#9aa4b2' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
