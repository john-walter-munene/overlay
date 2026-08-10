import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import OddsCalculator from './OddsCalculator';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('oddsCalculator');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/tools/odds-calculator' },
  };
}

export default async function OddsCalculatorPage() {
  const t = await getTranslations('oddsCalculator');
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          {t('backHome')}
        </Link>
      </p>
      <h1 style={{ fontSize: '2.1rem', marginBottom: '0.25rem' }}>
        {t('title')}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 640 }}>
        {t('intro')}
      </p>

      <Suspense
        fallback={<p style={{ color: 'var(--muted)' }}>{t('loading')}</p>}
      >
        <OddsCalculator />
      </Suspense>
    </main>
  );
}
