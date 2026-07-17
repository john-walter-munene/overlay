import type { MetadataRoute } from 'next';
import { listArticleSlugs, listFreeTipDates, SITE_URL } from '../lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listArticleSlugs();
  const tipDates = await listFreeTipDates();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/tipsters`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/tips`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/support`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
    {
      url: `${SITE_URL}/tools/odds-calculator`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
    {
      url: `${SITE_URL}/legal/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/legal/responsible-gambling`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const tipDateRoutes: MetadataRoute.Sitemap = tipDates.map((date) => ({
    url: `${SITE_URL}/tips?date=${date}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const articleRoutes: MetadataRoute.Sitemap = slugs.map((s) => ({
    url: `${SITE_URL}/blog/${s.slug}`,
    lastModified: new Date(s.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...tipDateRoutes, ...articleRoutes];
}
