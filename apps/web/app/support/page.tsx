'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  submitFeedback,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategory,
} from '../../lib/auth';

type FaqItem = { q: string; a: React.ReactNode };

const CATEGORIES = Object.keys(FEEDBACK_CATEGORY_LABELS) as FeedbackCategory[];

export default function SupportPage() {
  const t = useTranslations('support');
  const [category, setCategory] = useState<FeedbackCategory>('question');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const link = (href: string) => (chunks: React.ReactNode) => (
    <Link href={href} style={{ color: 'var(--accent)' }}>
      {chunks}
    </Link>
  );

  const GENERAL_FAQ: FaqItem[] = [
    { q: t('g1q'), a: t.rich('g1a', { about: link('/about') }) },
    { q: t('g2q'), a: t.rich('g2a', { privacy: link('/legal/privacy') }) },
    { q: t('g3q'), a: t('g3a') },
  ];

  const USER_FAQ: FaqItem[] = [
    { q: t('u1q'), a: t('u1a') },
    { q: t('u2q'), a: t.rich('u2a', { mysubs: link('/account/subscriptions') }) },
    {
      q: t('u3q'),
      a: t.rich('u3a', {
        mysubs: link('/account/subscriptions'),
        b: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
      }),
    },
    { q: t('u4q'), a: t('u4a') },
  ];

  const TIPSTER_FAQ: FaqItem[] = [
    { q: t('t1q'), a: t.rich('t1a', { signup: link('/signup') }) },
    { q: t('t2q'), a: t('t2a') },
    { q: t('t3q'), a: t('t3a') },
    { q: t('t4q'), a: t('t4a') },
  ];

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
      setMsg(t('sent'));
      setMessage('');
    } catch (err) {
      setOk(false);
      setMsg(err instanceof Error ? err.message : t('sendError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('subtitle')}
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>{t('sectionGeneral')}</h2>
        <div style={{ marginTop: '0.75rem' }}>
          {GENERAL_FAQ.map((item) => (
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

      <section style={{ marginTop: '2.25rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>{t('sectionUsers')}</h2>
        <div style={{ marginTop: '0.75rem' }}>
          {USER_FAQ.map((item) => (
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

      <section style={{ marginTop: '2.25rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>{t('sectionTipsters')}</h2>
        <div style={{ marginTop: '0.75rem' }}>
          {TIPSTER_FAQ.map((item) => (
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
        <h2 style={{ fontSize: '1.25rem' }}>{t('contactTitle')}</h2>
        <p style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>
          {t('contactIntro')}
        </p>
        <p style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0 1rem' }}>
          <a
            href="https://wa.me/447576532267"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary btn--sm"
            style={{ gap: '0.45rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
              <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.4 9.4 0 01-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.42 9.42 0 01-1.44-5.02c0-5.2 4.24-9.43 9.46-9.43 2.53 0 4.9.99 6.69 2.78a9.36 9.36 0 012.77 6.67c0 5.2-4.24 9.44-9.46 9.44zm8.05-17.5A11.32 11.32 0 0012.04.5C5.77.5.68 5.58.68 11.84c0 2 .52 3.95 1.52 5.67L.6 23.5l6.14-1.61a11.34 11.34 0 005.3 1.35h.01c6.27 0 11.36-5.09 11.36-11.35 0-3.03-1.18-5.88-3.32-8.02z" />
            </svg>
            {t('whatsapp')}
          </a>
          <a
            href="mailto:hello@overlaypicks.com"
            className="btn btn--secondary btn--sm"
            style={{ gap: '0.45rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
            {t('email')}
          </a>
        </p>
        <form
          onSubmit={send}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', maxWidth: 520 }}
        >
          <label style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {t('topic')}
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
            placeholder={t('messagePlaceholder')}
            value={message}
            maxLength={4000}
            required
            onChange={(e) => setMessage(e.target.value)}
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          />
          <input
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? t('sending') : t('sendMessage')}
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
