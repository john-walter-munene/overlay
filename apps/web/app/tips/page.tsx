import Link from 'next/link';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import {
  addDays,
  buildDateStrip,
  formatLongDate,
  parseIsoDate,
  todayIsoDate,
} from '@overlay/shared/daily-tips';
import { listFreeTips, type FreeTip } from '../../lib/api';
import TipsDatePicker from './TipsDatePicker';
import { SportChipLinks } from '../SportChips';

// SSR/ISR: regenerate each date's listing periodically for SEO freshness.
export const revalidate = 300;

/** Resolve the selected day from the query string, defaulting to today. */
function selectedDate(raw?: string): string {
  return parseIsoDate(raw) ?? todayIsoDate();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<Metadata> {
  const { date: rawDate } = await searchParams;
  const date = selectedDate(rawDate);
  const human = formatLongDate(date);
  const canonical =
    date === todayIsoDate() ? '/tips' : `/tips?date=${date}`;
  const t = await getTranslations('tips');
  return {
    title: t('metaTitle', { date: human }),
    description: t('metaDescription', { date: human }),
    alternates: { canonical },
  };
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '1rem 1.15rem',
  marginBottom: '0.85rem',
  background: 'var(--surface)',
};

function TipCard({ tip }: { tip: FreeTip }) {
  const t = useTranslations('tips');
  return (
    <li style={CARD}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>{tip.match}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {tip.sport}
            {tip.league ? ` · ${tip.league}` : ''}
          </div>
        </div>
        {tip.odds != null ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{t('odds')}</div>
            <div style={{ fontWeight: 700 }}>{tip.odds.toFixed(2)}</div>
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <span style={{ color: 'var(--muted)' }}>{tip.market}: </span>
        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
          {tip.selection}
        </span>
      </div>
      {tip.analysis ? (
        <p style={{ margin: '0.6rem 0 0', color: 'var(--muted)' }}>
          {tip.analysis}
        </p>
      ) : null}
    </li>
  );
}

export default async function FreeTipsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; sport?: string }>;
}) {
  const { date: rawDate, sport: rawSport } = await searchParams;
  const date = selectedDate(rawDate);
  const today = todayIsoDate();
  const strip = buildDateStrip(date, today);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const { tips } = await listFreeTips(date);
  const t = await getTranslations('tips');

  // Sport chips derived from the sports actually present on this day's picks.
  const sportParam = (rawSport ?? '').trim();
  const sportsAvailable = [
    ...new Map(tips.map((t) => [t.sport.toLowerCase(), t.sport])).values(),
  ].sort((a, b) => a.localeCompare(b));
  const visibleTips = sportParam
    ? tips.filter((t) => t.sport.toLowerCase() === sportParam.toLowerCase())
    : tips;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          {t('backHome')}
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        {t('title')}
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('subtitle')}
      </p>

      {/* Date navigation: prev/next controls, a date strip and a calendar picker. */}
      <nav
        aria-label={t('dateNav')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          margin: '1.5rem 0 0.5rem',
        }}
      >
        <Link
          href={`/tips?date=${prev}`}
          rel="prev"
          aria-label={t('prevDay')}
          style={navBtn}
        >
          {t('prev')}
        </Link>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {strip.map((day) => (
            <Link
              key={day.date}
              href={`/tips?date=${day.date}`}
              aria-current={day.isSelected ? 'date' : undefined}
              style={{
                ...navChip,
                borderColor: day.isSelected ? 'var(--accent)' : 'var(--border)',
                color: day.isSelected ? 'var(--accent)' : 'var(--fg)',
                fontWeight: day.isSelected ? 700 : 500,
              }}
            >
              {day.label}
            </Link>
          ))}
        </div>
        <Link
          href={`/tips?date=${next}`}
          rel="next"
          aria-label={t('nextDay')}
          style={navBtn}
        >
          {t('next')}
        </Link>
        <span style={{ marginLeft: 'auto' }}>
          <TipsDatePicker value={date} />
        </span>
      </nav>

      <h2 style={{ fontSize: '1.15rem', margin: '1.25rem 0 0.75rem' }}>
        {formatLongDate(date)}
      </h2>

      {tips.length === 0 ? (
        <p
          style={{
            color: 'var(--muted)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: '2rem 1.25rem',
            textAlign: 'center',
          }}
        >
          {t.rich('noTipsYet', {
            link: (chunks) => (
              <Link href={`/tips?date=${today}`} style={{ color: 'var(--accent)' }}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : (
        <>
          {sportsAvailable.length > 1 ? (
            <SportChipLinks
              items={sportsAvailable.map((s) => ({ key: s, label: s }))}
              activeKey={sportParam || null}
              hrefFor={(s) => `/tips?date=${date}&sport=${encodeURIComponent(s)}`}
              allHref={`/tips?date=${date}`}
              ariaLabel={t('filterBySport')}
            />
          ) : null}
          {visibleTips.length === 0 ? (
            <p style={{ color: 'var(--muted)', padding: '1.5rem 0' }}>
              {t.rich('noSportPicks', {
                sport: sportParam,
                link: (chunks) => (
                  <Link href={`/tips?date=${date}`} style={{ color: 'var(--accent)' }}>
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visibleTips.map((tip) => (
                <TipCard key={tip.id} tip={tip} />
              ))}
            </ul>
          )}
        </>
      )}

      <p
        style={{
          marginTop: '2rem',
          padding: '0.85rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--muted)',
          fontSize: '0.85rem',
          background: 'var(--surface)',
        }}
      >
        <strong>{t('disclaimerLabel')}</strong> {t('disclaimerBody')}
      </p>
    </main>
  );
}

const navBtn: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.4rem 0.75rem',
  color: 'var(--fg)',
  textDecoration: 'none',
  background: 'var(--surface)',
};

const navChip: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '0.4rem 0.85rem',
  textDecoration: 'none',
  background: 'var(--surface)',
};
