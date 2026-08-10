import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Flag from './Flag';
import Avatar from './Avatar';
import SportsDiscovery from './sports/SportsDiscovery';
import { API_URL, listFreeTips } from '../lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export const revalidate = 60;

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

export default async function Home() {
  const t = await getTranslations('home');
  const tFixtures = await getTranslations('fixtures');
  const [leaderboard, freeTips] = await Promise.all([
    getLeaderboard(),
    listFreeTips(),
  ]);
  const top = leaderboard.slice(0, 5);
  const topPick = freeTips.tips[0] ?? null;
  const steps = [
    { n: '01', title: t('stepPostTitle'), body: t('stepPostBody') },
    { n: '02', title: t('stepLockedTitle'), body: t('stepLockedBody') },
    { n: '03', title: t('stepSettledTitle'), body: t('stepSettledBody') },
    { n: '04', title: t('stepRankedTitle'), body: t('stepRankedBody') },
  ];

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '3.5rem 1.5rem' }}>
      {/* Hero + clickable leaderboard preview */}
      <section
        style={{
          display: 'flex',
          gap: '2.5rem',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <h1 style={{ fontSize: '2.3rem', lineHeight: 1.15, margin: '0 0 1.1rem', fontWeight: 600 }}>
            {t('heroTitle')}
          </h1>
          <p style={{ fontSize: '1.1rem', lineHeight: 1.65, margin: '0 0 1.5rem' }}>
            {t.rich('heroBody', {
              b: (chunks) => (
                <strong style={{ color: 'var(--fg)' }}>{chunks}</strong>
              ),
            })}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link href="/tipsters" className="btn btn--primary btn--lg">
              {t('browseTipsters')}
            </Link>
            <Link href="/tips" className="btn btn--secondary btn--lg">
              {t('todaysFreePicks')}
            </Link>
          </div>
        </div>

        {top.length > 0 ? (
          <Link
            href="/tipsters"
            aria-label="View the full leaderboard of verified tipsters"
            style={{
              flex: '1 1 300px',
              minWidth: 0,
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '1.1rem 1.2rem',
              background: 'var(--surface)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>{t('topTipsters')}</h2>
              <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>{t('viewAll')}</span>
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {top.map((r, i) => (
                <li
                  key={r.tipsterId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.7rem',
                    padding: '0.55rem 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      textAlign: 'right',
                      color: 'var(--muted)',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                    }}
                  >
                    {i + 1}
                  </span>
                  <Avatar src={r.avatarUrl} seed={r.name ?? r.tipsterId} size={30} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name ?? r.tipsterId}
                      {r.country ? (
                        <Flag code={r.country} style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }} />
                      ) : null}
                    </span>
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {t('clvPicks', {
                        clv: (r.clvAvg * 100).toFixed(1),
                        count: r.sampleSize,
                      })}
                    </span>
                  </span>
                  <span
                    style={{
                      color: r.yield >= 0 ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 700,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.yield >= 0 ? '+' : ''}
                    {r.yield.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ol>
          </Link>
        ) : null}
      </section>

      {/* Free pick of the day — a public taster that funnels to the newsletter */}
      {topPick ? (
        <section
          style={{
            marginTop: '3.5rem',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '1.4rem 1.5rem',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '0.35rem',
            }}
          >
            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{t('freePickTitle')}</h2>
            <Link href="/tips" style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
              {t('freePickSeeAll')}
            </Link>
          </div>
          <p style={{ color: 'var(--muted)', margin: '0 0 1rem', fontSize: '0.9rem' }}>
            {t('freePickTagline')}
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{topPick.match}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                {topPick.sport}
                {topPick.league ? ` · ${topPick.league}` : ''}
              </div>
              <div style={{ marginTop: '0.6rem' }}>
                <span style={{ color: 'var(--muted)' }}>{topPick.market}: </span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {topPick.selection}
                </span>
              </div>
            </div>
            {topPick.odds != null ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                  {t('freePickOddsLabel')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
                  {topPick.odds.toFixed(2)}
                </div>
              </div>
            ) : null}
          </div>

          {topPick.analysis ? (
            <p style={{ margin: '0.9rem 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
              {topPick.analysis}
            </p>
          ) : null}

          <div style={{ marginTop: '1.1rem' }}>
            <Link href="/newsletter" className="btn btn--secondary">
              {t('freePickEmailCta')}
            </Link>
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section style={{ marginTop: '3.5rem' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.25rem' }}>{t('howItWorks')}</h2>
        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {steps.map((s) => (
            <li key={s.n}>
              <div style={{ color: 'var(--accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {s.n}
              </div>
              <div style={{ fontWeight: 600, margin: '0.2rem 0 0.3rem' }}>{s.title}</div>
              <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ marginTop: '3.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{t('browseEvents')}</h2>
            <p style={{ color: 'var(--muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
              {t('browseEventsBody')}
            </p>
          </div>
          <Link href="/fixtures" style={{ color: 'var(--accent)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
            {tFixtures('title')} →
          </Link>
        </div>
        <SportsDiscovery showTitle={false} />
      </section>

      <section style={{ marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          {t('ctaQuestion')}{' '}
          <Link href="/signup" style={{ color: 'var(--accent)' }}>
            {t('ctaLink')}
          </Link>
        </p>
      </section>
    </main>
  );
}
