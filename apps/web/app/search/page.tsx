import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SearchClient from './SearchClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

// useSearchParams (in SearchClient) needs a Suspense boundary for prerender.
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchClient />
    </Suspense>
  );
}
