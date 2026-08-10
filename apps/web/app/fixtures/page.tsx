import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listFixturesWithPicks } from '../../lib/api';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('fixtures');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

function kickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const chip: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '0.4rem 0.9rem',
  textDecoration: 'none',
  background: 'var(--surface)',
};

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sport?: string }>;
}) {
  const { status, sport } = await searchParams;
  const active = status === 'live' ? 'live' : 'upcoming';
  const t = await getTranslations('fixtures');
  const fixtures = await listFixturesWithPicks({
    status: active,
    sport,
    limit: 50,
  });

  const tabHref = (s: 'upcoming' | 'live') =>
    `/fixtures?status=${s}${sport ? `&sport=${encodeURIComponent(sport)}` : ''}`;

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          {t('back')}
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t('subtitle')}</p>

      <nav
        aria-label={t('title')}
        style={{ display: 'flex', gap: '0.5rem', margin: '1.5rem 0' }}
      >
        {(['upcoming', 'live'] as const).map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            aria-current={active === s ? 'page' : undefined}
            style={{
              ...chip,
              borderColor: active === s ? 'var(--accent)' : 'var(--border)',
              color: active === s ? 'var(--accent)' : 'var(--fg)',
              fontWeight: active === s ? 700 : 500,
            }}
          >
            {s === 'live' ? t('statusLive') : t('statusUpcoming')}
          </Link>
        ))}
      </nav>

      {fixtures.length === 0 ? (
        <p
          style={{
            color: 'var(--muted)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: '2rem 1.25rem',
            textAlign: 'center',
          }}
        >
          {t('none')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {fixtures.map((f) => {
            const isLive = f.status !== 'scheduled' && f.status !== 'finished';
            return (
              <li key={f.id} style={{ marginBottom: '0.75rem' }}>
                <Link
                  href={`/fixtures/${f.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '1rem 1.15rem',
                    background: 'var(--surface)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {f.home} <span style={{ color: 'var(--muted)' }}>v</span>{' '}
                      {f.away}
                      {isLive &&
                      f.liveHomeScore != null &&
                      f.liveAwayScore != null ? (
                        <span style={{ color: 'var(--danger)', marginLeft: '0.5rem' }}>
                          {f.liveHomeScore}–{f.liveAwayScore}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {f.sport}
                      {f.league ? ` · ${f.league}` : ''} ·{' '}
                      {isLive ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          {t('badgeLive')}
                        </span>
                      ) : (
                        kickoff(f.startTime)
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                      {t('picks', { count: f.pickCount })}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      {t('tipsters', { count: f.tipsterCount })}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
