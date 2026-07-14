import type { MetadataRoute } from 'next';
import { listArticleSlugs, SITE_URL } from '../lib/api';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listArticleSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/marketplace`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = slugs.map((s) => ({
    url: `${SITE_URL}/blog/${s.slug}`,
    lastModified: new Date(s.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...articleRoutes];
}
