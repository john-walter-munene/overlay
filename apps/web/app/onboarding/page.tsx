'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authFetch, getAccessToken, getProfile } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import type {
  EditableTipsterProfile,
  OnboardingStatus,
  OnboardingStepKey,
} from '../../lib/api';
import { COUNTRIES, countryByCode, flagEmoji } from '@overlay/shared/countries';
import { formStyles } from '../formStyles';

type ContactMethod = 'phone' | 'telegram' | 'whatsapp';

interface WizardFields {
  displayName: string;
  country: string;
  contactMethod: ContactMethod;
  contactValue: string;
  /** Dialling code (e.g. "+44") used only when contactMethod is 'phone'. */
  phoneDial: string;
  sports: string;
  bio: string;
  billingInterval: 'weekly' | 'monthly';
  price: string;
  socialX: string;
  socialInstagram: string;
  socialTelegram: string;
}

const EMPTY_FIELDS: WizardFields = {
  displayName: '',
  country: '',
  contactMethod: 'phone',
  contactValue: '',
  phoneDial: '',
  sports: '',
  bio: '',
  billingInterval: 'monthly',
  price: '',
  socialX: '',
  socialInstagram: '',
  socialTelegram: '',
};

/** Split a stored phone contact ("+44 7700 900000") into dial code + number. */
function splitPhone(value: string): { dial: string; number: string } {
  const dials = [...new Set(COUNTRIES.map((c) => c.dial))].sort(
    (a, b) => b.length - a.length,
  );
  const match = dials.find((d) => value.startsWith(d));
  if (match) return { dial: match, number: value.slice(match.length).trim() };
  return { dial: '', number: value };
}

const STEP_ORDER: OnboardingStepKey[] = [
  'profile',
  'sports',
  'bio',
  'pricing',
  'stripe',
  'verification',
];

const CONTACT_METHODS: ContactMethod[] = ['phone', 'telegram', 'whatsapp'];

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const stepTitle = (key: OnboardingStepKey) => t(`step_${key}`);
  const contactLabel = (m: ContactMethod) => t(`contact_${m}`);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [fields, setFields] = useState<WizardFields>(EMPTY_FIELDS);
  const [docName, setDocName] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [current, setCurrent] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await authFetch('/api/tipsters/me/onboarding');
    if (res.ok) setStatus((await res.json()) as OnboardingStatus);
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (profile.role !== 'tipster' || !profile.tipsterId) {
        router.replace('/account');
        return;
      }
      try {
        const res = await authFetch('/api/tipsters/me/profile');
        if (res.ok) {
          const p = (await res.json()) as EditableTipsterProfile;
          const method = p.contactMethod ?? 'phone';
          const phone =
            method === 'phone' ? splitPhone(p.contactValue ?? '') : null;
          setFields({
            displayName: p.displayName ?? '',
            country: p.country ?? '',
            contactMethod: method,
            contactValue: phone ? phone.number : p.contactValue ?? '',
            phoneDial:
              phone?.dial || countryByCode(p.country)?.dial || '',
            sports: p.sports.join(', '),
            bio: p.bio ?? '',
            billingInterval: p.billingInterval ?? 'monthly',
            price: p.subscriptionPriceCents
              ? (p.subscriptionPriceCents / 100).toFixed(2)
              : '',
            socialX: p.socialX ?? '',
            socialInstagram: p.socialInstagram ?? '',
            socialTelegram: p.socialTelegram ?? '',
          });
          setDocName(p.identityDocName ?? null);
        }
      } catch {
        /* keep empty defaults */
      }
      await loadStatus();
    })();
  }, [router, loadStatus]);

  const done = useCallback(
    (key: OnboardingStepKey) =>
      status?.steps.find((s) => s.key === key)?.complete ?? false,
    [status],
  );

  // Land the tipster on their first incomplete step, once, when the wizard
  // first loads. Afterwards navigation is driven by the Back/Continue buttons
  // and step chips so it never yanks focus away mid-edit.
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    if (!status || placed) return;
    const idx = STEP_ORDER.findIndex((k) => !done(k));
    setCurrent(idx === -1 ? STEP_ORDER.length - 1 : idx);
    setPlaced(true);
  }, [status, placed, done]);

  function set<K extends keyof WizardFields>(key: K, value: WizardFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function patchProfile(body: Record<string, unknown>) {
    const res = await authFetch('/api/tipsters/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(b.message ?? `Failed (${res.status})`);
    }
    await loadStatus();
  }

  const stepKey = STEP_ORDER[current];

  async function saveCurrentStep(): Promise<boolean> {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      switch (stepKey) {
        case 'profile': {
          if (!fields.displayName.trim() || !fields.country.trim()) {
            throw new Error(t('errNameCountry'));
          }
          if (!fields.contactValue.trim()) {
            throw new Error(t('errContact'));
          }
          // For phone contacts, prefix the chosen dialling code.
          const contactValue =
            fields.contactMethod === 'phone'
              ? `${fields.phoneDial} ${fields.contactValue.trim()}`.trim()
              : fields.contactValue.trim();
          await patchProfile({
            displayName: fields.displayName.trim(),
            country: fields.country.trim(),
            contactMethod: fields.contactMethod,
            contactValue,
          });
          break;
        }
        case 'sports': {
          const sports = fields.sports
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (sports.length === 0) throw new Error(t('errSport'));
          await patchProfile({ sports });
          break;
        }
        case 'bio':
          if (!fields.bio.trim()) throw new Error(t('errBio'));
          await patchProfile({ bio: fields.bio.trim() });
          break;
        case 'pricing': {
          const price = Number(fields.price);
          if (!Number.isFinite(price) || price <= 0) {
            throw new Error(t('errPrice'));
          }
          await patchProfile({
            billingInterval: fields.billingInterval,
            subscriptionPriceCents: Math.round(price * 100),
          });
          break;
        }
        case 'stripe':
          if (!done('stripe')) {
            const res = await authFetch('/api/tipsters/me/onboarding/stripe', {
              method: 'POST',
            });
            if (!res.ok) throw new Error(`Failed (${res.status})`);
            setStatus((await res.json()) as OnboardingStatus);
          }
          break;
        case 'verification':
          await submitVerification();
          break;
      }
      setMsg(t('saved'));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errGeneric'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification() {
    if (!docFile) {
      throw new Error(t('errDocument'));
    }
    const form = new FormData();
    form.append('document', docFile);
    if (fields.socialX.trim()) form.append('socialX', fields.socialX.trim());
    if (fields.socialInstagram.trim())
      form.append('socialInstagram', fields.socialInstagram.trim());
    if (fields.socialTelegram.trim())
      form.append('socialTelegram', fields.socialTelegram.trim());

    const token = await getAccessToken();
    const res = await fetch(`${API_URL}/api/tipsters/me/onboarding/verification`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(b.message ?? `Upload failed (${res.status})`);
    }
    setStatus((await res.json()) as OnboardingStatus);
    setDocName(docFile.name);
    setDocFile(null);
  }

  async function onContinue() {
    const ok = await saveCurrentStep();
    if (ok && current < STEP_ORDER.length - 1) setCurrent((c) => c + 1);
  }

  function onBack() {
    setError(null);
    setMsg(null);
    if (current > 0) setCurrent((c) => c - 1);
  }

  function onSkip() {
    setError(null);
    setMsg(null);
    if (current < STEP_ORDER.length - 1) setCurrent((c) => c + 1);
  }

  const progress = useMemo(() => {
    if (!status) return 0;
    return Math.round((status.completedSteps / status.totalSteps) * 100);
  }, [status]);

  if (!status) {
    return (
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1>{t('title')}</h1>
        <p style={{ color: 'var(--muted)' }}>{t('loading')}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('intro')}
      </p>

      {/* Progress bar + step chips */}
      <div style={{ margin: '1.5rem 0 0.75rem' }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 200ms ease',
            }}
          />
        </div>
        <p style={{ color: 'var(--muted)', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
          {t('stepsComplete', {
            completed: status.completedSteps,
            total: status.totalSteps,
          })}
          {status.canPublish ? (
            <>
              {t('ready')}
              <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
                {t('goToDashboard')}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          listStyle: 'none',
          padding: 0,
          margin: '0 0 1.5rem',
        }}
      >
        {STEP_ORDER.map((key, i) => {
          const isDone = done(key);
          const isCurrent = i === current;
          const optional = key === 'verification';
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMsg(null);
                  setCurrent(i);
                }}
                style={{
                  border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                  background: isCurrent ? 'var(--surface)' : 'transparent',
                  color: isDone ? 'var(--accent)' : 'var(--muted)',
                  borderRadius: 999,
                  padding: '0.35rem 0.8rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {isDone ? '✓ ' : `${i + 1}. `}
                {stepTitle(key)}
                {optional ? t('optional') : ''}
              </button>
            </li>
          );
        })}
      </ol>

      <section
        aria-label={stepTitle(stepKey)}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.5rem',
          background: 'var(--surface)',
        }}
      >
        {stepKey === 'profile' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('profileHeading')}</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('profileHelp')}
            </p>
            <label style={labelStyle}>
              {t('name')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                placeholder={t('namePlaceholder')}
                value={fields.displayName}
                onChange={(e) => set('displayName', e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('country')}
              <select
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                value={fields.country}
                onChange={(e) => {
                  const code = e.target.value;
                  // Default the phone dial code to the chosen country's when
                  // it hasn't been set yet.
                  const dial = countryByCode(code)?.dial;
                  setFields((f) => ({
                    ...f,
                    country: code,
                    phoneDial: f.phoneDial || dial || '',
                  }));
                }}
              >
                <option value="">{t('countryPlaceholder')}</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {flagEmoji(c.code)} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              {t('preferredContact')}
              <select
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                value={fields.contactMethod}
                onChange={(e) =>
                  set('contactMethod', e.target.value as ContactMethod)
                }
              >
                {CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {contactLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            {fields.contactMethod === 'phone' ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  aria-label={t('diallingCode')}
                  style={{ ...formStyles.input, width: 'auto', flex: '0 0 auto' }}
                  value={fields.phoneDial}
                  onChange={(e) => set('phoneDial', e.target.value)}
                >
                  <option value="">{t('code')}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.dial}>
                      {flagEmoji(c.code)} {c.dial}
                    </option>
                  ))}
                </select>
                <input
                  style={{ ...formStyles.input, flex: 1 }}
                  placeholder="7700 900000"
                  inputMode="tel"
                  value={fields.contactValue}
                  onChange={(e) => set('contactValue', e.target.value)}
                />
              </div>
            ) : (
              <input
                style={formStyles.input}
                placeholder={`@your-${fields.contactMethod}`}
                value={fields.contactValue}
                onChange={(e) => set('contactValue', e.target.value)}
              />
            )}
          </div>
        ) : null}

        {stepKey === 'sports' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('sportsHeading')}</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('sportsHelp')}
            </p>
            <input
              style={formStyles.input}
              placeholder="soccer, basketball, tennis"
              value={fields.sports}
              onChange={(e) => set('sports', e.target.value)}
            />
          </div>
        ) : null}

        {stepKey === 'bio' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('bioHeading')}</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('bioHelp')}
            </p>
            <textarea
              style={{ ...formStyles.input, minHeight: 120, resize: 'vertical' }}
              placeholder={t('bioPlaceholder')}
              value={fields.bio}
              onChange={(e) => set('bio', e.target.value)}
            />
          </div>
        ) : null}

        {stepKey === 'pricing' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('pricingHeading')}</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('pricingHelp')}
            </p>
            <label style={labelStyle}>
              {t('billingCadence')}
              <select
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                value={fields.billingInterval}
                onChange={(e) =>
                  set(
                    'billingInterval',
                    e.target.value as 'weekly' | 'monthly',
                  )
                }
              >
                <option value="weekly">{t('weekly')}</option>
                <option value="monthly">{t('monthly')}</option>
              </select>
            </label>
            <label style={labelStyle}>
              {fields.billingInterval === 'weekly'
                ? t('pricePerWeek')
                : t('pricePerMonth')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="19.99"
                value={fields.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {stepKey === 'stripe' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
              {t('stripeHeading')}
            </h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('stripeHelp')}
            </p>
            {done('stripe') ? (
              <p style={{ color: 'var(--accent)', margin: 0 }}>
                {t('stripeConnected')}
              </p>
            ) : (
              <button
                type="button"
                style={formStyles.button}
                disabled={busy}
                onClick={() => saveCurrentStep()}
              >
                {busy ? t('connecting') : t('connectStripe')}
              </button>
            )}
          </div>
        ) : null}

        {stepKey === 'verification' ? (
          <div style={formStyles.form}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
              {t('verifyHeading')}{' '}
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                {t('verifyOptional')}
              </span>
            </h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 0.5rem' }}>
              {t('verifyHelp')}
            </p>
            {done('verification') ? (
              <p style={{ color: 'var(--accent)', margin: '0 0 0.5rem' }}>
                {docName ? t('verifiedWithDoc', { doc: docName }) : t('verified')}
              </p>
            ) : null}

            <label style={labelStyle}>
              {t('xTwitter')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                placeholder={t('handlePlaceholder')}
                value={fields.socialX}
                onChange={(e) => set('socialX', e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('instagram')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                placeholder={t('handlePlaceholder')}
                value={fields.socialInstagram}
                onChange={(e) => set('socialInstagram', e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('telegram')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                placeholder={t('handlePlaceholder')}
                value={fields.socialTelegram}
                onChange={(e) => set('socialTelegram', e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              {t('officialDocument')}
              <input
                style={{ ...formStyles.input, marginTop: '0.35rem' }}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        ) : null}

        {error ? <p style={{ ...formStyles.error, marginTop: '1rem' }}>{error}</p> : null}
        {msg && !error ? (
          <p style={{ color: 'var(--accent)', marginTop: '1rem' }}>{msg}</p>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '1.25rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            disabled={current === 0 || busy}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.6rem 1.2rem',
              cursor: current === 0 ? 'default' : 'pointer',
            }}
          >
            {t('back')}
          </button>

          {stepKey === 'verification' && !done('verification') ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              style={{
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
              }}
            >
              {t('skipForNow')}
            </button>
          ) : null}

          {current < STEP_ORDER.length - 1 ? (
            <button
              type="button"
              onClick={onContinue}
              disabled={busy}
              style={formStyles.button}
            >
              {busy ? t('saving') : t('saveContinue')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => saveCurrentStep()}
              disabled={busy}
              style={formStyles.button}
            >
              {busy ? t('saving') : done('verification') ? t('update') : t('verifyIdentity')}
            </button>
          )}

          {status.canPublish ? (
            <Link
              href="/dashboard"
              style={{
                marginLeft: 'auto',
                alignSelf: 'center',
                color: 'var(--accent)',
              }}
            >
              {t('finish')}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const labelStyle = {
  color: 'var(--muted)',
  fontSize: '0.9rem',
  display: 'block',
} as const;
