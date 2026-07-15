import Link from 'next/link';
import type { Metadata } from 'next';
import {
  addDays,
  buildDateStrip,
  formatLongDate,
  parseIsoDate,
  todayIsoDate,
} from '@overlay/shared/daily-tips';
import { listFreeTips, type FreeTip } from '../../lib/api';
import TipsDatePicker from './TipsDatePicker';

// SSR/ISR: regenerate each date's listing periodically for SEO freshness.
export const revalidate = 300;

/** Resolve the selected day from the query string, defaulting to today. */
function selectedDate(raw?: string): string {
  return parseIsoDate(raw) ?? todayIsoDate();
}

export function generateMetadata({
  searchParams,
}: {
  searchParams: { date?: string };
}): Metadata {
  const date = selectedDate(searchParams?.date);
  const human = formatLongDate(date);
  const canonical =
    date === todayIsoDate() ? '/tips' : `/tips?date=${date}`;
  return {
    title: `Free Daily Betting Tips — ${human} | Overlay Bets`,
    description: `Free curated betting tips (bets of the day) for ${human}. Browse next and previous days. Information only — not betting advice.`,
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
            <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Odds</div>
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
  searchParams: { date?: string };
}) {
  const date = selectedDate(searchParams?.date);
  const today = todayIsoDate();
  const strip = buildDateStrip(date, today);
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const { tips } = await listFreeTips(date);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Overlay Bets
        </Link>
      </p>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>
        Free Daily Tips
      </h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Our curated free “bets of the day”, updated daily. Browse any date to see
        that day’s tips.
      </p>

      {/* Date navigation: prev/next controls, a date strip and a calendar picker. */}
      <nav
        aria-label="Date navigation"
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
          aria-label="Previous day"
          style={navBtn}
        >
          ← Prev
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
          aria-label="Next day"
          style={navBtn}
        >
          Next →
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
          No free tips published for this date yet. Check{' '}
          <Link href={`/tips?date=${today}`} style={{ color: 'var(--accent)' }}>
            today’s tips
          </Link>{' '}
          or browse another day.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} />
          ))}
        </ul>
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
        <strong>Information only.</strong> These free tips are provided for
        informational purposes and are not betting advice or a guarantee of any
        outcome. They are separate from tipsters’ paid live picks. 18+. Please
        gamble responsibly —{' '}
        <Link
          href="/legal/responsible-gambling"
          style={{ color: 'var(--accent)' }}
        >
          responsible gambling resources
        </Link>
        .
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
