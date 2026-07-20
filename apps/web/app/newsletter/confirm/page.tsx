import { Suspense } from 'react';
import type { Metadata } from 'next';
import NewsletterActionClient from '../NewsletterActionClient';

export const metadata: Metadata = {
  title: 'Confirm subscription · Overlay Bets',
  robots: { index: false },
};

export default function NewsletterConfirmPage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <NewsletterActionClient
          action="confirm"
          workingText="Confirming your subscription…"
          successTitle="You’re subscribed 🎉"
          successText="Thanks for confirming. You’ll get our weekly “Picks of the Week” digest and no spam. You can unsubscribe in one click from any email."
          errorText="This confirmation link is invalid or has already been used."
        />
      </Suspense>
    </main>
  );
}
