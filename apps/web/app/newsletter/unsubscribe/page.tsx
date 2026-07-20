import { Suspense } from 'react';
import type { Metadata } from 'next';
import NewsletterActionClient from '../NewsletterActionClient';

export const metadata: Metadata = {
  title: 'Unsubscribe · Overlay Bets',
  robots: { index: false },
};

export default function NewsletterUnsubscribePage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <NewsletterActionClient
          action="unsubscribe"
          workingText="Unsubscribing you…"
          successTitle="You’ve been unsubscribed"
          successText="You will no longer receive the Overlay Bets newsletter. Changed your mind? You can re-subscribe anytime from the newsletter page."
          errorText="This unsubscribe link is invalid. You may already be unsubscribed."
        />
      </Suspense>
    </main>
  );
}
