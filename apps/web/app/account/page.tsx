'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  authFetch,
  signOut,
  getFullProfile,
  updateUsername,
  changePassword,
  changeEmail,
  exportMyData,
  getNotificationPreferences,
  updateNotificationPreferences,
  type FullProfile,
  type NotificationPreferences,
} from '../../lib/auth';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../../lib/push';
import { roleHasPermission } from '@overlay/shared/rbac';
import { validateNewPassword } from '../../lib/account';
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
  const t = useTranslations('account');
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
  const [pushBusy, setPushBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
  }, []);
  useEffect(() => {
    (async () => {
      const p = await getFullProfile();
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
      setUsernameMsg(t('usernameSaved'));
    } catch (err) {
      setUsernameMsg(err instanceof Error ? err.message : t('failed'));
    } finally {
      setSavingUsername(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    try {
      await changeEmail(newEmail);
      setEmailMsg(t('emailSent'));
      setNewEmail('');
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : t('failed'));
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    const invalid = validateNewPassword(newPassword);
    if (invalid) {
      setPasswordMsg(invalid);
      return;
    }
    try {
      await changePassword(newPassword);
      setPasswordMsg(t('passwordUpdated'));
      setNewPassword('');
    } catch (err) {
      setPasswordMsg(err instanceof Error ? err.message : t('failed'));
    }
  }

  async function logout() {
    await signOut();
    router.push('/');
  }

  async function downloadData() {
    setExportMsg(null);
    setExportBusy(true);
    try {
      await exportMyData();
      setExportMsg(t('downloadStarted'));
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : t('exportFailed'));
    } finally {
      setExportBusy(false);
    }
  }

  async function savePrefs(patch: Partial<NotificationPreferences>) {
    setPrefsMsg(null);
    const previous = prefs;
    setPrefs((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      const updated = await updateNotificationPreferences(patch);
      setPrefs(updated);
      setPrefsMsg(t('saved'));
    } catch (err) {
      setPrefs(previous);
      setPrefsMsg(err instanceof Error ? err.message : t('failed'));
    }
  }

  /**
   * Toggling push both saves the preference and (de)registers this browser with
   * the Push API so alerts actually reach the device. If the browser opt-in
   * fails (unsupported / permission denied) we surface the reason and leave the
   * preference off.
   */
  async function togglePush(enabled: boolean) {
    setPrefsMsg(null);
    setPushBusy(true);
    try {
      if (enabled) {
        await subscribeToPush();
        await savePrefs({ pushEnabled: true });
      } else {
        await unsubscribeFromPush();
        await savePrefs({ pushEnabled: false });
      }
    } catch (err) {
      setPrefsMsg(err instanceof Error ? err.message : t('pushFailed'));
    } finally {
      setPushBusy(false);
    }
  }

  if (!profile) {
    return (
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>
        {t('welcome', { name: profile.username ?? t('there') })}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('subtitle')}
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
              {t('myFeed')}
            </Link>
            <Link
              href="/account/subscriptions"
              className="btn btn--secondary btn--sm"
            >
              {t('mySubscriptions')}
            </Link>
          </>
        ) : null}
        {profile.role === 'tipster' ? (
          <>
            <Link href="/dashboard" className="btn btn--primary btn--sm">
              {t('tipsterDashboard')}
            </Link>
            <Link
              href="/account/subscriptions"
              className="btn btn--secondary btn--sm"
            >
              {t('mySubscriptions')}
            </Link>
          </>
        ) : null}
        {roleHasPermission(profile.role, 'audit:read') ? (
          <Link href="/admin" className="btn btn--primary btn--sm">
            {t('adminDashboard')}
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
          <Fact label={t('factUsername')} value={profile.username ?? t('notSet')} />
          <Fact label={t('factEmail')} value={profile.email} />
          <Fact label={t('factAccountType')} value={profile.role} />
          <Fact
            label={t('factMemberSince')}
            value={new Date(profile.createdAt).toLocaleDateString()}
          />
          {profile.role === 'tipster' ? (
            <Fact label={t('factRole')} value={t('verifiedTipster')} />
          ) : (
            <Fact
              label={t('factSubscriptions')}
              value={String(profile.subscriptionCount)}
            />
          )}
        </div>
        {profile.role === 'tipster' ? (
          <p style={{ margin: '1rem 0 0' }}>
            <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
              {t('linkTipsterDashboard')}
            </Link>
            {' · '}
            <Link href="/onboarding" style={{ color: 'var(--accent)' }}>
              {t('linkOnboarding')}
            </Link>
            {' · '}
            <Link href="/earnings" style={{ color: 'var(--accent)' }}>
              {t('linkEarnings')}
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
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('loginSecurity')}</h2>

          <form onSubmit={saveUsername} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>{t('username')}</span>
            <input
              style={formStyles.input}
              placeholder={t('usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              required
            />
            {usernameMsg ? <p style={labelStyle}>{usernameMsg}</p> : null}
            <button style={formStyles.button} disabled={savingUsername}>
              {savingUsername ? t('saving') : t('saveUsername')}
            </button>
          </form>

          <div style={dividerStyle} />

          <form onSubmit={saveEmail} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>{t('changeEmail')}</span>
            <input
              style={formStyles.input}
              type="email"
              placeholder={t('emailPlaceholder')}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            {emailMsg ? <p style={labelStyle}>{emailMsg}</p> : null}
            <button style={formStyles.button}>{t('sendConfirmation')}</button>
          </form>

          <div style={dividerStyle} />

          <form onSubmit={savePassword} style={{ ...formStyles.form, gap: '0.5rem' }}>
            <span style={labelStyle}>{t('changePassword')}</span>
            <input
              style={formStyles.input}
              type="password"
              placeholder={t('newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            {passwordMsg ? <p style={labelStyle}>{passwordMsg}</p> : null}
            <button style={formStyles.button}>{t('updatePassword')}</button>
          </form>
        </section>

        {/* --- Notification preferences --- */}
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('notifications')}</h2>
          {prefs === null ? (
            <p style={labelStyle}>{t('loading')}</p>
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
                {t('emailNotifications')}
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <input
                  type="checkbox"
                  checked={prefs.pushEnabled}
                  disabled={pushBusy}
                  onChange={(e) => togglePush(e.target.checked)}
                />
                {t('pushNotifications')}
              </label>
              {!pushSupported ? (
                <p style={labelStyle}>
                  {t('pushUnsupported')}
                </p>
              ) : null}
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span style={labelStyle}>{t('newPickDelivery')}</span>
                <select
                  style={formStyles.input}
                  value={prefs.frequency}
                  onChange={(e) =>
                    savePrefs({
                      frequency: e.target.value as 'instant' | 'daily',
                    })
                  }
                >
                  <option value="instant">{t('instant')}</option>
                  <option value="daily">{t('dailyDigest')}</option>
                </select>
              </label>
              {prefsMsg ? <p style={labelStyle}>{prefsMsg}</p> : null}
            </div>
          )}
        </section>
      </div>

      {/* --- Subscriptions --- */}
      {roleHasPermission(profile.role, 'user:manage') ? (
        <p>
          <Link href="/admin/users" style={{ color: 'var(--accent)' }}>
            {t('manageUsers')}
          </Link>
        </p>
      ) : null}

      {profile.role !== 'tipster' ? (
        <>
          <h2 style={{ marginTop: '2rem' }}>{t('yourSubscriptions')}</h2>
      <p>
        <Link href="/account/subscriptions" style={{ color: 'var(--accent)' }}>
          {t('manageSubscriptions')}
        </Link>
      </p>
      {subs === null ? (
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      ) : subs.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {t.rich('noActiveSubs', {
            link: (chunks) => (
              <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
          })}
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

      {/* --- Data & privacy (GDPR self-service) --- */}
      <section style={{ ...cardStyle, marginTop: '2rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{t('dataPrivacy')}</h2>
        <p style={labelStyle}>
          {t('dataPrivacyBody')}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            alignItems: 'center',
            marginTop: '0.75rem',
          }}
        >
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={downloadData}
            disabled={exportBusy}
          >
            {exportBusy ? t('preparing') : t('exportMyData')}
          </button>
          {exportMsg ? <span style={labelStyle}>{exportMsg}</span> : null}
        </div>
      </section>

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
        {t('signOut')}
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
