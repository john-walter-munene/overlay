'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CONSENT_STORAGE_KEY,
  createConsent,
  needsConsent,
  serializeConsent,
  type ConsentStatus,
} from '@overlay/shared/consent';

/**
 * Cookie-consent banner (OB-140). Shown until the visitor accepts or rejects
 * non-essential cookies; the decision is persisted in localStorage via the pure
 * helpers in @overlay/shared so it survives reloads and can be unit-tested.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(needsConsent(localStorage.getItem(CONSENT_STORAGE_KEY)));
    } catch {
      // localStorage unavailable (e.g. privacy mode) — show the banner but the
      // decision simply won't persist.
      setVisible(true);
    }
  }, []);

  function decide(status: ConsentStatus) {
    try {
      localStorage.setItem(
        CONSENT_STORAGE_KEY,
        serializeConsent(createConsent(status)),
      );
    } catch {
      // Ignore persistence failures; still dismiss the banner for this session.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '1rem 1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ color: 'var(--fg)', margin: 0, flex: '1 1 320px' }}>
          We use strictly necessary cookies to run Overlay Bets and, with your
          consent, optional cookies for analytics. See our{' '}
          <Link href="/legal/privacy" style={{ color: 'var(--accent)' }}>
            Privacy Policy
          </Link>
          .
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => decide('rejected')}
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              cursor: 'pointer',
            }}
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => decide('accepted')}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
