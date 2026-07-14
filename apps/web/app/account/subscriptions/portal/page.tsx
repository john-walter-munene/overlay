import { Suspense } from 'react';
import PortalClient from './PortalClient';

export const metadata = {
  title: 'Billing portal',
  robots: { index: false },
};

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <p style={{ color: '#9aa4b2' }}>Loading…</p>
        </main>
      }
    >
      <PortalClient />
    </Suspense>
  );
}
