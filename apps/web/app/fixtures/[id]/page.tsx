import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Avatar from '../../Avatar';
import Flag from '../../Flag';
import { getFixturePicks } from '../../../lib/api';

export const revalidate = 60;

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const summary = await getFixturePicks(id);
  const t = await getTranslations('fixtures');
  if (!summary) return { title: t('metaTitle') };
  const title = `${summary.event.home} v ${summary.event.away} — Overlay Picks`;
  return { title, description: t('detailIntro') };
}

export default async function FixtureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = await getFixturePicks(id);
  const t = await getTranslations('fixtures');
  if (!summary) notFound();

  const { event, tipsters } = summary;
  const isLive = event.status !== 'scheduled' && event.status !== 'finished';

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: '0 0 1rem' }}>
        <Link href="/fixtures" style={{ color: 'var(--accent)' }}>
          {t('backToFixtures')}
        </Link>
      </p>

      <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
        {event.home} <span style={{ color: 'var(--muted)' }}>v</span> {event.away}
        {isLive && event.liveHomeScore != null && event.liveAwayScore != null ? (
          <span style={{ color: 'var(--danger)', marginLeft: '0.6rem' }}>
            {event.liveHomeScore}–{event.liveAwayScore}
          </span>
        ) : null}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {event.sport}
        {event.league ? ` · ${event.league}` : ''} ·{' '}
        {isLive ? (
          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
            {t('badgeLive')}
          </span>
        ) : (
          kickoff(event.startTime)
        )}
      </p>

      <p
        style={{
          margin: '1.25rem 0',
          padding: '0.75rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 10,
          background: 'var(--surface)',
          color: 'var(--muted)',
          fontSize: '0.9rem',
        }}
      >
        {t('detailIntro')}
      </p>

      <h2 style={{ fontSize: '1.2rem', margin: '1.5rem 0 0.75rem' }}>
        {t('onThisMatch')} ·{' '}
        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
          {t('tipsters', { count: summary.tipsterCount })}
        </span>
      </h2>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {tipsters.map((tp) => (
          <li
            key={tp.tipsterId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <Avatar src={tp.avatarUrl} seed={tp.name} size={36} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/tipsters/${tp.tipsterId}`}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                {tp.name}
              </Link>
              {tp.country ? (
                <Flag
                  code={tp.country}
                  style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }}
                />
              ) : null}
              {tp.verified ? (
                <span
                  style={{
                    marginLeft: '0.4rem',
                    color: 'var(--success)',
                    fontSize: '0.75rem',
                  }}
                >
                  ✓ {t('verifiedShort')}
                </span>
              ) : null}
              <span
                style={{
                  display: 'block',
                  color: 'var(--muted)',
                  fontSize: '0.8rem',
                }}
              >
                {t('picks', { count: tp.pickCount })}
                {tp.yield != null
                  ? ` · ${tp.yield >= 0 ? '+' : ''}${tp.yield.toFixed(1)}% ${t('yield')}`
                  : ''}
              </span>
            </span>
            <Link
              href={`/tipsters/${tp.tipsterId}`}
              className="btn btn--secondary btn--sm"
            >
              {t('viewProfile')}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
