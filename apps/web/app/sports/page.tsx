import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SportsDiscovery from './SportsDiscovery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sports');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/sports' },
  };
}

export default function SportsPage() {
  return (
    <main style={{ padding: '3rem 1.5rem 4rem' }}>
      <SportsDiscovery />
    </main>
  );
}
