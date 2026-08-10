'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  toSubscriptionView,
  sortSubscriptions,
  isSubscriptionExpiringSoon,
  hoursUntilPeriodEnd,
  type SubscriptionRecord,
} from '@overlay/shared/subscriptions';
import {
  authFetch,
  getProfile,
  submitTipsterFeedback,
  POSITIVE_REASON_LABELS,
  NEGATIVE_REASON_LABELS,
  type FeedbackSentiment,
} from '../../../lib/auth';
import { EmptyState } from '../../EmptyState';
import { getBillingPortalAvailable } from '../../../lib/api';

const MUTED = 'var(--muted)';

/**
 * Subscriptions management UI (OB-013). Lists the subscriber's active/canceled
 * subscriptions with status and next billing (current period end) date, and
 * links out to the Stripe billing portal to cancel/resume.
 */
export default function SubscriptionsClient() {
  const t = useTranslations('subscriptions');
  const router = useRouter();
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalAvailable, setPortalAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Give-feedback flow — bettors only, on tipsters they subscribe to.
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<FeedbackSentiment>('positive');
  const [reason, setReason] = useState<string>('accurate');
  const [details, setDetails] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login?next=/account/subscriptions');
        return;
      }
      setRole(profile.role);
      try {
        const res = await authFetch('/api/subscriptions/me');
        const data = res.ok ? ((await res.json()) as SubscriptionRecord[]) : [];
        setSubs(data);
      } catch {
        setSubs([]);
      }
      // Only Stripe offers a hosted billing portal; pay-per-period providers
      // (Paystack, crypto, mobile money) don't, so the button is hidden.
      setPortalAvailable(await getBillingPortalAvailable());
    })();
  }, [router]);

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const res = await authFetch('/api/subscriptions/portal', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(t('portalError'));
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(t('portalUnavailable'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('genericError'));
      setPortalLoading(false);
    }
  }

  const views = subs
    ? sortSubscriptions(subs).map((s) => toSubscriptionView(s))
    : [];

  function openFeedback(tipsterId: string) {
    setFeedbackFor(tipsterId);
    setSentiment('positive');
    setReason('accurate');
    setDetails('');
    setFeedbackMsg(null);
  }

  function changeSentiment(next: FeedbackSentiment) {
    setSentiment(next);
    // Reset the reason to the first valid one for the chosen sentiment.
    setReason(next === 'positive' ? 'accurate' : 'fake_record');
  }

  async function submitFeedback(tipsterId: string) {
    setFeedbackBusy(true);
    setFeedbackMsg(null);
    try {
      await submitTipsterFeedback(
        tipsterId,
        sentiment,
        reason,
        details.trim() || undefined,
      );
      setFeedbackFor(null);
      setFeedbackMsg(
        sentiment === 'positive'
          ? t('thanksPositive')
          : t('thanksNegative'),
      );
    } catch (e) {
      setFeedbackMsg(
        e instanceof Error ? e.message : t('feedbackError'),
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  // In-app notice (no email): subscriptions still active but ending within 36h.
  const expiring = (subs ?? []).filter((s) =>
    isSubscriptionExpiringSoon(s.status, s.currentPeriodEnd),
  );

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p>
        <Link href="/account" style={{ color: 'var(--accent)' }}>
          {t('back')}
        </Link>
      </p>
      <h1>{t('title')}</h1>
      <p style={{ color: MUTED }}>
        {t('intro')}
      </p>

      {expiring.length > 0 ? (
        <div
          role="status"
          className="panel"
          style={{
            borderColor: 'var(--warning)',
            marginTop: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <strong style={{ color: 'var(--warning)' }}>
            {t('expiringTitle', { count: expiring.length })}
          </strong>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {expiring.map((s) => {
              const hrs = hoursUntilPeriodEnd(s.currentPeriodEnd) ?? 0;
              return (
                <li key={s.id} style={{ color: MUTED, fontSize: '0.9rem' }}>
                  <Link
                    href={`/tipsters/${s.tipsterId}`}
                    style={{ color: 'var(--accent)' }}
                  >
                    {s.tipsterName ?? s.tipsterId}
                  </Link>{' '}
                  {t('expiringLine', {
                    when: hrs <= 0 ? t('endsUnderHour') : t('endsHours', { hrs }),
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {subs === null ? (
        <p style={{ color: MUTED }}>{t('loading')}</p>
      ) : views.length === 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <EmptyState
            icon="🎟️"
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            actions={[{ href: '/tipsters', label: t('browseTipsters') }]}
          />
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
          {views.map((v) => (
            <li
              key={v.id}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '1rem 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                }}
              >
                <div>
                  <Link
                    href={`/tipsters/${v.tipsterId}`}
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                  >
                    {v.tipsterName ?? v.tipsterId}
                  </Link>
                  {v.periodEndLabel ? (
                    <div style={{ color: MUTED, marginTop: '0.25rem' }}>
                      {v.periodEndLabel}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    color: v.isActive ? 'var(--success)' : MUTED,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {v.statusLabel}
                </span>
              </div>

              {role === 'user' ? (
                feedbackFor === v.tipsterId ? (
                  <div
                    className="panel"
                    style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
                  >
                    <strong style={{ fontSize: '0.95rem' }}>
                      {t('feedbackTitle')}
                    </strong>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {(['positive', 'negative'] as FeedbackSentiment[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => changeSentiment(s)}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                            background: sentiment === s ? 'var(--accent)' : 'transparent',
                            color: sentiment === s ? 'var(--on-accent)' : 'var(--muted)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {s === 'positive' ? t('positive') : t('reportIssue')}
                        </button>
                      ))}
                    </div>
                    <label style={{ color: MUTED, fontSize: '0.85rem' }}>
                      {sentiment === 'positive' ? t('whatWentWell') : t('reason')}
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={{
                          display: 'block',
                          marginTop: '0.3rem',
                          padding: '0.5rem 0.6rem',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--fg)',
                          minWidth: 240,
                        }}
                      >
                        {Object.entries(
                          sentiment === 'positive'
                            ? POSITIVE_REASON_LABELS
                            : NEGATIVE_REASON_LABELS,
                        ).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      placeholder={
                        sentiment === 'positive'
                          ? t('positivePlaceholder')
                          : t('negativePlaceholder')
                      }
                      value={details}
                      maxLength={1000}
                      onChange={(e) => setDetails(e.target.value)}
                      style={{
                        minHeight: 80,
                        resize: 'vertical',
                        padding: '0.6rem 0.7rem',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--fg)',
                        fontFamily: 'inherit',
                        fontSize: '0.9rem',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={feedbackBusy}
                        onClick={() => submitFeedback(v.tipsterId)}
                      >
                        {feedbackBusy ? t('submitting') : t('submitFeedback')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setFeedbackFor(null)}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ marginTop: '0.5rem', color: 'var(--muted)' }}
                    onClick={() => openFeedback(v.tipsterId)}
                  >
                    {t('giveFeedback')}
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {feedbackMsg ? (
        <p role="status" style={{ color: 'var(--accent)', marginTop: '1rem' }}>
          {feedbackMsg}
        </p>
      ) : null}

      {subs && views.length > 0 ? (
        portalAvailable ? (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="btn btn--primary"
            style={{ marginTop: '1.5rem' }}
          >
            {portalLoading
              ? t('openingPortal')
              : t('manageBilling')}
          </button>
        ) : (
          <p style={{ color: MUTED, marginTop: '1.5rem', fontSize: '0.9rem' }}>
            {t('payPerPeriodNote')}
          </p>
        )
      ) : null}
      {error ? (
        <p style={{ color: 'var(--danger)', marginTop: '0.75rem' }}>{error}</p>
      ) : null}
    </main>
  );
}
