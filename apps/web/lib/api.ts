export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Payment methods a subscriber can choose at checkout (mirrors the API). */
export type PaymentMethodId =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'usdc'
  | 'usdt'
  | 'mpesa'
  | 'mtn_momo'
  | 'airtel_money';

/** Human labels for each payment method (with a hint emoji). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  card: '💳 Card',
  apple_pay: ' Apple Pay',
  google_pay: '🅶 Google Pay',
  usdc: '🪙 USDC (stablecoin)',
  usdt: '🪙 USDT (stablecoin)',
  mpesa: '📱 M-Pesa',
  mtn_momo: '📱 MTN MoMo',
  airtel_money: '📱 Airtel Money',
};

/** Fetch the payment methods enabled by the API's wired providers. */
export async function listPaymentMethods(): Promise<PaymentMethodId[]> {
  try {
    const res = await fetch(`${API_URL}/api/subscriptions/methods`);
    if (!res.ok) return [];
    const data = (await res.json()) as { methods: PaymentMethodId[] };
    return data.methods ?? [];
  } catch {
    return [];
  }
}

/** A local-currency price estimate for a tipster subscription. */
export interface SubscriptionQuote {
  usdCents: number;
  currency: string;
  amountMinor: number;
  converted: boolean;
  display: string;
}

/** Best-effort ISO country of the current browser (e.g. "KE"), or null. */
export function detectCountry(): string | null {
  if (typeof navigator === 'undefined') return null;
  const lang = navigator.language || navigator.languages?.[0];
  if (!lang) return null;
  try {
    const region = new Intl.Locale(lang).region;
    if (region) return region.toUpperCase();
  } catch {
    /* fall through */
  }
  const parts = lang.split('-');
  return parts[1] ? parts[1].toUpperCase() : null;
}

/** Local-currency estimate for a tipster's price, by country or currency. */
export async function getSubscriptionQuote(
  tipsterId: string,
  params: { country?: string | null; currency?: string | null } = {},
): Promise<SubscriptionQuote | null> {
  try {
    const qs = new URLSearchParams({ tipsterId });
    if (params.currency) qs.set('currency', params.currency);
    else if (params.country) qs.set('country', params.country);
    const res = await fetch(
      `${API_URL}/api/subscriptions/quote?${qs.toString()}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as SubscriptionQuote;
  } catch {
    return null;
  }
}

export interface ArticleCard {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  category: 'content' | 'news';
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

export async function listArticles(params?: {
  tag?: string;
  category?: 'content' | 'news';
}): Promise<ArticleCard[]> {
  const qs = new URLSearchParams();
  if (params?.tag) qs.set('tag', params.tag);
  if (params?.category) qs.set('category', params.category);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return (await getJson<ArticleCard[]>(`/api/articles${suffix}`, 0)) ?? [];
}

export async function getArticle(slug: string): Promise<Article | null> {
  return getJson<Article>(`/api/articles/${encodeURIComponent(slug)}`, 0);
}

// --- Global search ----------------------------------------------------------

export interface SearchTipster {
  tipsterId: string;
  name: string | null;
  avatarUrl: string | null;
  country: string | null;
  yield: number | null;
  clvAvg: number | null;
  sampleSize: number | null;
  subscriptionPriceCents: number;
}

export interface SearchArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: 'content' | 'news';
  readingMinutes: number;
  publishedAt: string | null;
}

export interface SearchResults {
  query: string;
  tipsters: SearchTipster[];
  articles: SearchArticle[];
}

const EMPTY_SEARCH: SearchResults = { query: '', tipsters: [], articles: [] };

/** Global search across tipsters and articles. */
export async function search(q: string): Promise<SearchResults> {
  const query = q.trim();
  if (query.length < 2) return { ...EMPTY_SEARCH, query };
  try {
    const res = await fetch(
      `${API_URL}/api/search?q=${encodeURIComponent(query)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { ...EMPTY_SEARCH, query };
    return (await res.json()) as SearchResults;
  } catch {
    return { ...EMPTY_SEARCH, query };
  }
}


export async function listArticleSlugs(): Promise<
  { slug: string; updatedAt: string; publishedAt: string | null }[]
> {
  return (await getJson(`/api/articles/sitemap`, 0)) ?? [];
}

/**
 * A free "bet of the day" from the public Daily Tips hub (OB-150). Admin-curated
 * and ungated — not linked to any tipster. `date` is the calendar day
 * (`YYYY-MM-DD`) the tip is listed under.
 */
export interface FreeTip {
  id: string;
  date: string;
  sport: string;
  league: string | null;
  match: string;
  market: string;
  selection: string;
  odds: number | null;
  analysis: string | null;
}

/** The public per-date free-tips payload. */
export interface FreeTipsForDate {
  date: string;
  tips: FreeTip[];
}

/** Free tips for a single calendar day (defaults to today when date omitted). */
export async function listFreeTips(date?: string): Promise<FreeTipsForDate> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const data = await getJson<FreeTipsForDate>(`/api/free-tips${qs}`, 300);
  return data ?? { date: date ?? '', tips: [] };
}

/** Distinct calendar days that currently have at least one free tip (for SEO). */
export async function listFreeTipDates(): Promise<string[]> {
  return (await getJson<string[]>(`/api/free-tips/dates`, 3600)) ?? [];
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
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  country: string | null;
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  billingInterval: 'weekly' | 'monthly';
  verified: boolean;
  socials: {
    x: string | null;
    instagram: string | null;
    telegram: string | null;
  };
  stats: TipsterStats | null;
  subscriberCount: number;
  followerCount: number;
  articlesPublished: number;
  recentPicks: {
    id: string;
    market: string;
    selection: string;
    oddsAtPick: number;
    status: string;
    clv: number | null;
    note: string | null;
    settledAt: string | null;
  }[];
}

export async function getTipster(id: string): Promise<TipsterProfile | null> {
  return getJson<TipsterProfile>(`/api/tipsters/${encodeURIComponent(id)}`, 60);
}

/**
 * A tipster's live pick as returned by GET /api/picks/tipster/:id/live. Includes
 * still-pending (pre-event) picks and is gated behind an active subscription.
 */
export interface LivePick {
  id: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: string;
  hash: string;
  clv: number | null;
  lockedAt: string;
  settledAt: string | null;
}

/** Fields a tipster can edit on their own profile (OB-021). */
export interface UpdateTipsterProfile {
  bio: string;
  sports: string[];
  subscriptionPriceCents: number;
}

/** The caller's own editable tipster profile (GET /api/tipsters/me/profile). */
export interface EditableTipsterProfile {
  displayName: string | null;
  country: string | null;
  contactMethod: 'phone' | 'telegram' | 'whatsapp' | null;
  contactValue: string | null;
  bio: string | null;
  sports: string[];
  subscriptionPriceCents: number;
  billingInterval: 'weekly' | 'monthly';
  socialX: string | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  identityVerified: boolean;
  identityDocName: string | null;
  payoutMethod: 'stripe' | 'crypto' | 'mobile_money' | null;
  payoutWalletAddress: string | null;
  payoutWalletChain: string | null;
  payoutMobileNumber: string | null;
  payoutMobileNetwork: string | null;
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
  country: string | null;
  name: string | null;
  avatarUrl: string | null;
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
  | 'profile'
  | 'sports'
  | 'bio'
  | 'pricing'
  | 'stripe'
  | 'verification';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  complete: boolean;
  optional: boolean;
}

/** Payload of GET /api/tipsters/me/onboarding (OB-020). */
export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedSteps: number;
  totalSteps: number;
  complete: boolean;
  canPublish: boolean;
  verified: boolean;
  nextStep: OnboardingStepKey | null;
}

/** One pick in the subscriber "My feed" (OB-012). */
export interface FeedPick {
  id: string;
  tipsterId: string;
  tipsterName: string | null;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: string;
  clv: number | null;
  result: string | null;
  /** Optional tipster-authored context, or null. */
  note: string | null;
  /** Lock time as epoch milliseconds. */
  lockedAt: number;
  /** Settlement time as epoch milliseconds, or null while pending. */
  settledAt: number | null;
  event: {
    sport: string;
    home: string;
    away: string;
    startTime: number;
  } | null;
}
