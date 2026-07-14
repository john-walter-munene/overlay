export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export interface ArticleCard {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  readingMinutes: number;
  publishedAt: string | null;
}

export interface Article extends ArticleCard {
  id: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  updatedAt: string;
}

async function getJson<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function listArticles(tag?: string): Promise<ArticleCard[]> {
  const qs = tag ? `?tag=${encodeURIComponent(tag)}` : '';
  return (await getJson<ArticleCard[]>(`/api/articles${qs}`)) ?? [];
}

export async function getArticle(slug: string): Promise<Article | null> {
  return getJson<Article>(`/api/articles/${encodeURIComponent(slug)}`);
}

export async function listArticleSlugs(): Promise<
  { slug: string; updatedAt: string; publishedAt: string | null }[]
> {
  return (await getJson(`/api/articles/sitemap`)) ?? [];
}

export interface TipsterStats {
  yield: number;
  clvAvg: number;
  winRate: number;
  sampleSize: number;
  roi: number;
  maxDrawdown: number;
  currentStreak: number;
}

export interface TipsterProfile {
  tipsterId: string;
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  stats: TipsterStats | null;
  recentPicks: {
    id: string;
    market: string;
    selection: string;
    oddsAtPick: number;
    status: string;
    clv: number | null;
    settledAt: string | null;
  }[];
}

export async function getTipster(id: string): Promise<TipsterProfile | null> {
  return getJson<TipsterProfile>(`/api/tipsters/${encodeURIComponent(id)}`, 60);
}

export type MarketplaceSort = 'yield' | 'clv' | 'winRate';

export interface MarketplaceTipster {
  tipsterId: string;
  yield: number;
  clvAvg: number;
  winRate: number;
  sampleSize: number;
  sports: string[];
  subscriptionPriceCents: number;
  bio: string | null;
}

export interface MarketplacePage {
  items: MarketplaceTipster[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MarketplaceParams {
  sport?: string;
  maxPrice?: string;
  minSample?: string;
  sort?: string;
  page?: string;
}

const EMPTY_MARKETPLACE: MarketplacePage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

export async function listMarketplace(
  params: MarketplaceParams = {},
): Promise<MarketplacePage> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return (
    (await getJson<MarketplacePage>(`/api/tipsters/marketplace${suffix}`, 60)) ??
    EMPTY_MARKETPLACE
  );
}

/** One step in the tipster performance time-series (mirrors @overlay/shared). */
export interface PerformancePoint {
  index: number;
  settledAt: number | null;
  cumulativeUnits: number;
  roi: number;
  yield: number;
  clvAvg: number;
  winRate: number;
  drawdown: number;
}

/** Counts of a tipster's picks split by status. */
export interface PickBreakdown {
  pending: number;
  won: number;
  lost: number;
  void: number;
  settled: number;
  total: number;
}

/** Payload of GET /api/picks/me/performance (OB-023). */
export interface PerformanceDashboard {
  series: PerformancePoint[];
  breakdown: PickBreakdown;
  stats: TipsterStats;
}

/** One step of the tipster onboarding wizard (OB-020). */
export type OnboardingStepKey =
  | 'bio'
  | 'sports'
  | 'pricing'
  | 'stripe'
  | 'verification';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  complete: boolean;
}

/** Payload of GET /api/tipsters/me/onboarding (OB-020). */
export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedSteps: number;
  totalSteps: number;
  complete: boolean;
  canPublish: boolean;
  nextStep: OnboardingStepKey | null;
}
