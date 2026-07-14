'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AGE_GATE_STORAGE_KEY,
  MINIMUM_AGE,
  createAgeConfirmation,
  needsAgeConfirmation,
  serializeAgeConfirmation,
} from '@overlay/shared/age-gate';

/**
 * Age-confirmation gate (OB-142). Blocks entry to the site with a full-screen
 * modal until the visitor confirms they meet the minimum age; the decision is
 * persisted in localStorage via the pure helpers in @overlay/shared so it
 * survives reloads and can be unit-tested. Responsible-gambling resources are
 * linked from the gate itself.
 */
export default function AgeGate() {
  // Default to blocked so the gate is never bypassed before hydration decides.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    try {
      setBlocked(needsAgeConfirmation(localStorage.getItem(AGE_GATE_STORAGE_KEY)));
    } catch {
      // localStorage unavailable (e.g. privacy mode) — show the gate but the
      // confirmation simply won't persist.
      setBlocked(true);
    }
  }, []);

  function confirm() {
    try {
      localStorage.setItem(
        AGE_GATE_STORAGE_KEY,
        serializeAgeConfirmation(createAgeConfirmation()),
      );
    } catch {
      // Ignore persistence failures; still dismiss the gate for this session.
    }
    setBlocked(false);
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Prevent the page behind the gate from scrolling while it is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = blocked ? 'hidden' : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-heading"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '2rem 1.75rem',
          textAlign: 'center',
        }}
      >
        <h1
          id="age-gate-heading"
          style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.5rem' }}
        >
          Are you {MINIMUM_AGE} or older?
        </h1>
        <p style={{ color: 'var(--fg)', marginTop: 0 }}>
          Overlay Bets is a sports-information and analytics service intended for
          adults only. You must be at least {MINIMUM_AGE} years old to continue.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Gambling can be addictive. Please play responsibly. For support and
          resources, see our{' '}
          <Link
            href="/legal/responsible-gambling"
            style={{ color: 'var(--accent)' }}
          >
            Responsible Gambling
          </Link>{' '}
          page.
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            marginTop: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
          <a
            href="https://www.gamblingtherapy.org/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0.6rem 1.25rem',
              textDecoration: 'none',
            }}
          >
            I&apos;m under {MINIMUM_AGE}
          </a>
          <button
            type="button"
            onClick={confirm}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.5rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            I&apos;m {MINIMUM_AGE} or older
          </button>
        </div>
      </div>
    </div>
  );
}
