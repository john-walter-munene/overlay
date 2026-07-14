'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import type { OnboardingStatus, OnboardingStepKey } from '../../lib/api';
import { formStyles } from '../formStyles';

interface ProfileFields {
  bio: string;
  sports: string;
  price: string;
}

const STEP_HELP: Record<OnboardingStepKey, string> = {
  bio: 'Tell subscribers who you are and what edge you bring.',
  sports: 'Comma-separate the sports you post picks for (e.g. soccer, basketball).',
  pricing: 'Set your monthly subscription price in your local currency units.',
  stripe: 'Connect Stripe so we can pay out your earnings.',
  verification: 'Verify your identity to keep the marketplace trustworthy.',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [fields, setFields] = useState<ProfileFields>({
    bio: '',
    sports: '',
    price: '',
  });
  const [msg, setMsg] = useState<string | null>(null);
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
      // Prefill the editable steps from the public profile.
      try {
        const res = await fetch(`${API_URL}/api/tipsters/${profile.tipsterId}`);
        if (res.ok) {
          const t = (await res.json()) as {
            bio: string | null;
            sports: string[];
            subscriptionPriceCents: number;
          };
          setFields({
            bio: t.bio ?? '',
            sports: t.sports.join(', '),
            price: t.subscriptionPriceCents
              ? (t.subscriptionPriceCents / 100).toFixed(2)
              : '',
          });
        }
      } catch {
        /* keep empty defaults */
      }
      await loadStatus();
    })();
  }, [router, loadStatus]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        bio: fields.bio.trim(),
        sports: fields.sports
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const price = Number(fields.price);
      if (Number.isFinite(price) && price > 0) {
        body.subscriptionPriceCents = Math.round(price * 100);
      }
      const res = await authFetch('/api/tipsters/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setMsg('Saved ✓');
      await loadStatus();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  async function completeStep(step: 'stripe' | 'verification') {
    setMsg(null);
    setBusy(true);
    try {
      const res = await authFetch(`/api/tipsters/me/onboarding/${step}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setStatus((await res.json()) as OnboardingStatus);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to complete step');
    } finally {
      setBusy(false);
    }
  }

  const done = (key: OnboardingStepKey) =>
    status?.steps.find((s) => s.key === key)?.complete ?? false;

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Tipster onboarding</h1>
      <p style={{ color: '#9aa4b2' }}>
        Complete every step to unlock pick publishing. Your progress is saved as
        you go.
      </p>

      {status ? (
        <p style={{ color: '#9aa4b2', margin: '0 0 1.5rem' }}>
          {status.completedSteps}/{status.totalSteps} steps complete
          {status.canPublish ? ' — you’re ready to publish! ' : ''}
          {status.canPublish ? (
            <Link href="/dashboard" style={{ color: '#6ea8fe' }}>
              Go to dashboard →
            </Link>
          ) : null}
        </p>
      ) : (
        <p style={{ color: '#9aa4b2' }}>Loading…</p>
      )}

      <section aria-label="Profile steps" style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem' }}>
          {stepMark(done('bio') && done('sports') && done('pricing'))} Profile,
          sports &amp; pricing
        </h2>
        <p style={{ color: '#9aa4b2', margin: '0 0 0.75rem' }}>
          {STEP_HELP.bio} {STEP_HELP.sports} {STEP_HELP.pricing}
        </p>
        <form onSubmit={saveProfile} style={formStyles.form}>
          <textarea
            style={{ ...formStyles.input, minHeight: 80, resize: 'vertical' }}
            placeholder="Your bio"
            value={fields.bio}
            onChange={(e) => setFields({ ...fields, bio: e.target.value })}
          />
          <input
            style={formStyles.input}
            placeholder="Sports (comma separated)"
            value={fields.sports}
            onChange={(e) => setFields({ ...fields, sports: e.target.value })}
          />
          <input
            style={formStyles.input}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Monthly price (e.g. 19.99)"
            value={fields.price}
            onChange={(e) => setFields({ ...fields, price: e.target.value })}
          />
          <button style={formStyles.button} disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section aria-label="Stripe step" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem' }}>
          {stepMark(done('stripe'))} Connect Stripe payouts
        </h2>
        <p style={{ color: '#9aa4b2', margin: '0 0 0.75rem' }}>
          {STEP_HELP.stripe}
        </p>
        <button
          style={formStyles.button}
          disabled={busy || done('stripe')}
          onClick={() => completeStep('stripe')}
        >
          {done('stripe') ? 'Stripe connected ✓' : 'Connect Stripe'}
        </button>
      </section>

      <section aria-label="Verification step" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.15rem' }}>
          {stepMark(done('verification'))} Verify your identity
        </h2>
        <p style={{ color: '#9aa4b2', margin: '0 0 0.75rem' }}>
          {STEP_HELP.verification}
        </p>
        <button
          style={formStyles.button}
          disabled={busy || done('verification')}
          onClick={() => completeStep('verification')}
        >
          {done('verification') ? 'Verified ✓' : 'Verify identity'}
        </button>
      </section>

      {msg ? (
        <p style={{ color: '#6ea8fe', marginTop: '1.5rem' }}>{msg}</p>
      ) : null}
    </main>
  );
}

function stepMark(complete: boolean): string {
  return complete ? '✓' : '○';
}
