'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

const MUTED = 'var(--muted)';

/**
 * Subscriptions management UI (OB-013). Lists the subscriber's active/canceled
 * subscriptions with status and next billing (current period end) date, and
 * links out to the Stripe billing portal to cancel/resume.
 */
export default function SubscriptionsClient() {
  const router = useRouter();
  const [subs, setSubs] = useState<SubscriptionRecord[] | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
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
        throw new Error(`Could not open billing portal (${res.status})`);
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Billing portal is unavailable right now.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
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
          ? 'Thanks for the kind words — shared with our team.'
          : 'Feedback submitted — our team will review it. Thank you.',
      );
    } catch (e) {
      setFeedbackMsg(
        e instanceof Error ? e.message : 'Could not submit feedback.',
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
          ← Back to account
        </Link>
      </p>
      <h1>Your subscriptions</h1>
      <p style={{ color: MUTED }}>
        Manage your tipster subscriptions. Cancel or resume any subscription
        through the secure billing portal.
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
            {expiring.length === 1
              ? 'A subscription is expiring soon'
              : `${expiring.length} subscriptions are expiring soon`}
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
                  — ends in {hrs <= 0 ? 'under an hour' : `~${hrs}h`}. Renew to
                  keep getting their picks.
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {subs === null ? (
        <p style={{ color: MUTED }}>Loading…</p>
      ) : views.length === 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <EmptyState
            icon="🎟️"
            title="No subscriptions yet"
            description="Subscribe to a verified tipster to unlock their live picks the moment they lock, before kickoff."
            actions={[{ href: '/tipsters', label: 'Browse tipsters' }]}
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
                      Feedback on this tipster
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
                          {s === 'positive' ? '👍 Positive' : '👎 Report an issue'}
                        </button>
                      ))}
                    </div>
                    <label style={{ color: MUTED, fontSize: '0.85rem' }}>
                      {sentiment === 'positive' ? 'What went well' : 'Reason'}
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
                          ? 'Share what you liked (optional)'
                          : 'Add any details that will help us review (optional)'
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
                        {feedbackBusy ? 'Submitting…' : 'Submit feedback'}
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setFeedbackFor(null)}
                      >
                        Cancel
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
                    Give feedback
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
        <button
          onClick={openPortal}
          disabled={portalLoading}
          className="btn btn--primary"
          style={{ marginTop: '1.5rem' }}
        >
          {portalLoading
            ? 'Opening billing portal…'
            : 'Manage billing (cancel / resume)'}
        </button>
      ) : null}
      {error ? (
        <p style={{ color: 'var(--danger)', marginTop: '0.75rem' }}>{error}</p>
      ) : null}
    </main>
  );
}
