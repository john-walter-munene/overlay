import { Suspense } from 'react';
import SubscriptionsClient from './SubscriptionsClient';

export const metadata = {
  title: 'Your subscriptions',
  robots: { index: false },
};

export default function SubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <p style={{ color: '#9aa4b2' }}>Loading…</p>
        </main>
      }
    >
      <SubscriptionsClient />
    </Suspense>
  );
}
