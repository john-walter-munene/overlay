'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  submitFeedback,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from '../../lib/auth';

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'What fees does Overlay Bets charge?',
    a: 'Overlay Bets takes a platform fee on tipster subscription revenue (currently 25%). Tipsters keep the rest. There’s no fee to browse tipsters or read the free daily tips.',
  },
  {
    q: 'When and how do tipsters get paid?',
    a: 'Payouts are processed weekly, every Tuesday. Tipsters can also request an off-schedule (on-demand) payout of their available balance — those are released once an admin approves them.',
  },
  {
    q: 'How do subscriptions and billing work?',
    a: (
      <>
        You subscribe to a tipster to see their live picks. Manage or cancel any
        subscription from{' '}
        <Link href="/account/subscriptions" style={{ color: 'var(--accent)' }}>
          My subscriptions
        </Link>{' '}
        via the secure billing portal. If a subscription is close to expiring,
        you’ll see a notice there.
      </>
    ),
  },
  {
    q: 'How do I raise a complaint or leave feedback about a tipster?',
    a: (
      <>
        Open{' '}
        <Link href="/account/subscriptions" style={{ color: 'var(--accent)' }}>
          My subscriptions
        </Link>{' '}
        and use <strong>Give feedback</strong> on the tipster in question — you
        can leave praise or report an issue. This is available for tipsters you
        subscribe to, and our team reviews every complaint.
      </>
    ),
  },
  {
    q: 'How are tipster track records verified?',
    a: 'Every pick is hashed and timestamped the moment it’s posted — before kickoff — then settled automatically from the official result. Records can’t be edited, deleted or backdated, so the yield and closing line value you see are real.',
  },
  {
    q: 'How do I become a tipster?',
    a: (
      <>
        <Link href="/signup" style={{ color: 'var(--accent)' }}>
          Create an account
        </Link>{' '}
        as a tipster and complete onboarding (profile, sports, pricing and
        payout details). Once set up you can post picks and get paid by
        subscribers.
      </>
    ),
  },
];

const CATEGORIES = Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[];

export default function SupportPage() {
  const [category, setCategory] = useState<FeedbackCategory>('question');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.7rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--fg)',
    fontFamily: 'inherit',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await submitFeedback(category, message, email.trim() || undefined);
      setOk(true);
      setMsg('Thanks — your message has reached our team.');
      setMessage('');
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : 'Could not send your message.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Support Center</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Answers to common questions — plus a direct line to our team.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Frequently asked questions</h2>
        <div style={{ marginTop: '1rem' }}>
          {FAQ.map((item) => (
            <details
              key={item.q}
              style={{
                borderTop: '1px solid var(--border)',
                padding: '0.9rem 0',
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {item.q}
              </summary>
              <div style={{ color: 'var(--muted)', marginTop: '0.5rem', lineHeight: 1.6 }}>
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Contact us / product feedback</h2>
        <p style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>
          Have a question, a suggestion, or found a bug? Send it straight to the
          team.
        </p>
        <form
          onSubmit={send}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', maxWidth: 520 }}
        >
          <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Topic
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              style={{ ...inputStyle, marginTop: '0.3rem' }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FEEDBACK_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <textarea
            placeholder="How can we help?"
            value={message}
            maxLength={4000}
            required
            onChange={(e) => setMessage(e.target.value)}
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          />
          <input
            type="email"
            placeholder="Your email (optional, so we can reply)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
          </div>
          {msg ? (
            <p style={{ color: ok ? 'var(--success)' : 'var(--danger)', margin: 0 }}>
              {msg}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
