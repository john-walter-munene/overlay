import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Flag from '../Flag';
import Avatar from '../Avatar';
import FollowButton from '../FollowButton';
import CompareToggle from './CompareToggle';
import CompareTray from './CompareTray';
import { SportChipLinks } from '../SportChips';
import {
  listMarketplace,
  SITE_URL,
  API_URL,
  type MarketplaceParams,
  type MarketplaceSort,
} from '../../lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tipsters');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: `${SITE_URL}/tipsters` },
  };
}

export const revalidate = 60;

const SPORTS = ['soccer', 'basketball', 'tennis', 'baseball', 'hockey'];

interface LeaderboardRow {
  tipsterId: string;
  yield: number;
  clvAvg: number;
  winRate: number;
  sampleSize: number;
  country: string | null;
  name: string | null;
  avatarUrl: string | null;
}

async function getLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return (await res.json()) as LeaderboardRow[];
  } catch {
    return [];
  }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--fg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.45rem 0.6rem',
  fontSize: '0.9rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  color: 'var(--muted)',
  fontSize: '0.8rem',
};

function pageHref(base: MarketplaceParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  qs.set('page', String(page));
  return `/tipsters?${qs.toString()}`;
}

export default async function TipstersPage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceParams>;
}) {
  const resolvedParams = await searchParams;
  const params: MarketplaceParams = {
    sport: resolvedParams.sport,
    maxPrice: resolvedParams.maxPrice,
    minSample: resolvedParams.minSample,
    sort: resolvedParams.sort,
    page: resolvedParams.page,
  };
  const [data, leaderboard] = await Promise.all([
    listMarketplace(params),
    getLeaderboard(),
  ]);
  const activeSort = (resolvedParams.sort as MarketplaceSort) ?? 'yield';
  const topTipsters = leaderboard.slice(0, 8);
  const t = await getTranslations('tipsters');
  const sorts: { value: MarketplaceSort; label: string }[] = [
    { value: 'yield', label: t('sortYield') },
    { value: 'clv', label: t('sortClv') },
    { value: 'winRate', label: t('sortWinRate') },
  ];

  const chipHref = (sport?: string) => {
    const qs = new URLSearchParams();
    if (sport) qs.set('sport', sport);
    if (params.maxPrice) qs.set('maxPrice', params.maxPrice);
    if (params.minSample) qs.set('minSample', params.minSample);
    if (params.sort) qs.set('sort', params.sort);
    const s = qs.toString();
    return s ? `/tipsters?${s}` : '/tipsters';
  };

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 640 }}>
        {t('subtitle')}
      </p>

      <div className="tipsters-layout">
        <div>
          <SportChipLinks
            items={SPORTS.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1) }))}
            activeKey={resolvedParams.sport ?? null}
            hrefFor={(s) => chipHref(s)}
            allHref={chipHref()}
            ariaLabel={t('filterBySport')}
          />
          <form
            method="get"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'flex-end',
              margin: '1.75rem 0',
              padding: '1.25rem',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <input type="hidden" name="sport" value={resolvedParams.sport ?? ''} />

            <label style={labelStyle}>
              {t('maxPrice')}
              <input
                type="number"
                name="maxPrice"
                min={0}
                placeholder={t('priceAny')}
                defaultValue={resolvedParams.maxPrice ?? ''}
                style={{ ...inputStyle, width: 120 }}
              />
            </label>

            <label style={labelStyle}>
              {t('minSample')}
              <input
                type="number"
                name="minSample"
                min={0}
                placeholder="10"
                defaultValue={resolvedParams.minSample ?? ''}
                style={{ ...inputStyle, width: 110 }}
              />
            </label>

            <label style={labelStyle}>
              {t('sortBy')}
              <select name="sort" defaultValue={activeSort} style={inputStyle}>
                {sorts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="btn btn--primary">
              {t('apply')}
            </button>
          </form>

          {data.items.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>{t('noMatch')}</p>
          ) : (
            <>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                {t('countLine', {
                  total: data.total,
                  page: data.page,
                  totalPages: data.totalPages,
                })}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '0.5rem 0' }}>{t('thTipster')}</th>
                    <th>{t('thSports')}</th>
                    <th>{t('thYield')}</th>
                    <th>{t('thClv')}</th>
                    <th>{t('thWin')}</th>
                    <th>{t('thPicks')}</th>
                    <th>{t('thPrice')}</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.tipsterId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.6rem 0' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Avatar src={r.avatarUrl} seed={r.name ?? r.tipsterId} size={28} />
                          <Link
                            href={`/tipsters/${r.tipsterId}`}
                            style={{ color: 'var(--accent)' }}
                          >
                            {r.name ?? r.tipsterId}
                          </Link>
                          {r.country ? (
                            <Flag code={r.country} style={{ verticalAlign: 'middle' }} />
                          ) : null}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {r.sports.length ? r.sports.join(', ') : '—'}
                      </td>
                      <td>{r.yield.toFixed(1)}%</td>
                      <td>{(r.clvAvg * 100).toFixed(2)}%</td>
                      <td>{(r.winRate * 100).toFixed(0)}%</td>
                      <td>{r.sampleSize}</td>
                      <td>
                        {r.subscriptionPriceCents > 0
                          ? `$${(r.subscriptionPriceCents / 100).toFixed(2)}`
                          : t('free')}
                      </td>
                      <td>
                        <CompareToggle
                          id={r.tipsterId}
                          name={r.name ?? r.tipsterId}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            gap: '0.4rem',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                        >
                          {r.subscriptionPriceCents > 0 ? (
                            <Link
                              href={`/tipsters/${r.tipsterId}#subscribe`}
                              className="btn btn--primary btn--sm"
                              title={t('subscribeTitle')}
                            >
                              {t('subscribe')}
                            </Link>
                          ) : null}
                          <FollowButton tipsterId={r.tipsterId} iconOnly />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {data.totalPages > 1 ? (
                <nav
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '1.5rem',
                  }}
                >
                  {data.page > 1 ? (
                    <Link href={pageHref(params, data.page - 1)} className="btn btn--secondary btn--sm">
                      {t('prevPage')}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {data.page < data.totalPages ? (
                    <Link href={pageHref(params, data.page + 1)} className="btn btn--secondary btn--sm">
                      {t('nextPage')}
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </div>

        <aside className="tipsters-aside">
          <div className="panel">
            <h2>{t('leaderboard')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0 0 0.9rem' }}>
              {t('leaderboardSub')}
            </p>
            {topTipsters.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                {t('noRanked')}
              </p>
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {topTipsters.map((r, i) => (
                  <li
                    key={r.tipsterId}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flex: '0 0 auto',
                        width: 22,
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 999,
                        background: i < 3 ? 'var(--accent)' : 'var(--surface-2)',
                        color: i < 3 ? 'var(--on-accent)' : 'var(--muted)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {i + 1}
                    </span>
                    <Avatar src={r.avatarUrl} seed={r.name ?? r.tipsterId} size={26} />
                    <Link
                      href={`/tipsters/${r.tipsterId}`}
                      style={{ color: 'var(--fg)', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.name ?? r.tipsterId}
                    </Link>
                    {r.country ? (
                      <Flag code={r.country} style={{ verticalAlign: 'middle' }} />
                    ) : null}
                    <span style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
                      {r.yield.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
      <CompareTray />
    </main>
  );
}
