import { Suspense } from 'react';
import SubscribeSuccessClient from './SubscribeSuccessClient';

export const metadata = { robots: { index: false } };

export default function SubscribeSuccessPage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading…</p>}>
        <SubscribeSuccessClient />
      </Suspense>
    </main>
  );
}
