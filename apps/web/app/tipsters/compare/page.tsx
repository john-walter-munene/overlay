import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildClvChart } from '@overlay/shared/tipster-profile';
import Avatar from '../../Avatar';
import Flag from '../../Flag';
import { compareTipsters, type TipsterProfile } from '../../../lib/api';

export const revalidate = 60;

/** Below this settled-pick count a tipster's stats are flagged as low-sample. */
const LOW_SAMPLE = 50;

/** Line colours for the overlaid CLV series (first = brand accent). */
const SERIES_COLORS = ['var(--accent)', '#e0873a', '#38b48b'];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('compare');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

function parseIds(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function displayName(p: TipsterProfile): string {
  return p.displayName ?? p.username ?? p.tipsterId;
}

function formatPrice(p: TipsterProfile, freeLabel: string): string {
  if (p.subscriptionPriceCents <= 0) return freeLabel;
  const amount = (p.subscriptionPriceCents / 100).toFixed(2);
  return `$${amount}/${p.billingInterval === 'weekly' ? 'wk' : 'mo'}`;
}

/** Indices whose value ties for best in a row (higher- or lower-is-better). */
function bestIndices(
  values: (number | null)[],
  higherBetter: boolean,
): Set<number> {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return new Set();
  const best = higherBetter ? Math.max(...present) : Math.min(...present);
  const out = new Set<number>();
  values.forEach((v, i) => {
    if (v !== null && v === best) out.add(i);
  });
  return out;
}

/** One overlaid CLV series per tipster in a single dependency-free SVG. */
function ClvOverlay({
  series,
}: {
  series: { name: string; color: string; points: number[] }[];
}) {
  const withData = series.filter((s) => s.points.length > 0);
  if (withData.length === 0) return null;

  const W = 640;
  const H = 220;
  const padX = 8;
  const padY = 12;
  const all = withData.flatMap((s) => s.points);
  let min = Math.min(0, ...all);
  let max = Math.max(0, ...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const xAt = (i: number, len: number) =>
    padX + (len <= 1 ? 0 : (i / (len - 1)) * (W - 2 * padX));
  const yAt = (v: number) =>
    padY + (1 - (v - min) / (max - min)) * (H - 2 * padY);
  const zeroY = yAt(0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Closing line value over time, one line per tipster"
      style={{ display: 'block' }}
    >
      <line
        x1={padX}
        x2={W - padX}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--border)"
        strokeDasharray="4 4"
      />
      {withData.map((s) => (
        <polyline
          key={s.name}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeLinejoin="round"
          points={s.points
            .map((v, i) => `${xAt(i, s.points.length)},${yAt(v)}`)
            .join(' ')}
        />
      ))}
    </svg>
  );
}

export default async function CompareTipstersPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: rawIds } = await searchParams;
  const ids = parseIds(rawIds);
  const t = await getTranslations('compare');
  const tipsters = ids.length ? await compareTipsters(ids) : [];

  const backLink = (
    <p style={{ margin: '0 0 1rem' }}>
      <Link href="/tipsters" style={{ color: 'var(--accent)' }}>
        {t('back')}
      </Link>
    </p>
  );

  if (tipsters.length < 2) {
    // Distinguish "you haven't picked two yet" from "we couldn't load the ones
    // you picked" (e.g. an unavailable tipster or a transient API error).
    const message = ids.length < 2 ? t('needMore') : t('loadError');
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {backLink}
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('title')}</h1>
        <p
          style={{
            color: 'var(--muted)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            padding: '2rem 1.25rem',
            textAlign: 'center',
          }}
        >
          {message}
        </p>
        <p style={{ marginTop: '1.25rem' }}>
          <Link href="/tipsters" className="btn btn--primary">
            {t('browseCta')}
          </Link>
        </p>
      </main>
    );
  }

  const clvSeries = tipsters.map((p, i) => ({
    name: displayName(p),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    ...buildClvChart(p.recentPicks),
  }));

  // Metric rows: value extractor + direction so we can highlight the best cell.
  const rows: {
    key: string;
    label: string;
    higherBetter: boolean;
    value: (p: TipsterProfile) => number | null;
    render: (p: TipsterProfile) => string;
  }[] = [
    {
      key: 'yield',
      label: t('rowYield'),
      higherBetter: true,
      value: (p) => p.stats?.yield ?? null,
      render: (p) =>
        p.stats ? `${p.stats.yield >= 0 ? '+' : ''}${p.stats.yield.toFixed(1)}%` : '—',
    },
    {
      key: 'clv',
      label: t('rowClv'),
      higherBetter: true,
      value: (p) => p.stats?.clvAvg ?? null,
      render: (p) =>
        p.stats
          ? `${p.stats.clvAvg >= 0 ? '+' : ''}${(p.stats.clvAvg * 100).toFixed(2)}%`
          : '—',
    },
    {
      key: 'winRate',
      label: t('rowWinRate'),
      higherBetter: true,
      value: (p) => p.stats?.winRate ?? null,
      render: (p) => (p.stats ? `${(p.stats.winRate * 100).toFixed(0)}%` : '—'),
    },
    {
      key: 'sample',
      label: t('rowSample'),
      higherBetter: true,
      value: (p) => p.stats?.sampleSize ?? null,
      render: (p) => (p.stats ? String(p.stats.sampleSize) : '—'),
    },
    {
      key: 'drawdown',
      label: t('rowDrawdown'),
      higherBetter: false,
      value: (p) => p.stats?.maxDrawdown ?? null,
      render: (p) =>
        p.stats ? `${p.stats.maxDrawdown.toFixed(1)}u` : '—',
    },
    {
      key: 'streak',
      label: t('rowStreak'),
      higherBetter: true,
      value: (p) => p.stats?.currentStreak ?? null,
      render: (p) =>
        p.stats
          ? `${p.stats.currentStreak > 0 ? '+' : ''}${p.stats.currentStreak}`
          : '—',
    },
    {
      key: 'price',
      label: t('rowPrice'),
      higherBetter: false,
      value: (p) => p.subscriptionPriceCents,
      render: (p) => formatPrice(p, t('free')),
    },
  ];

  const cell: React.CSSProperties = {
    padding: '0.7rem 0.9rem',
    borderTop: '1px solid var(--border)',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  };
  const headCell: React.CSSProperties = {
    padding: '0.9rem',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'bottom',
    textAlign: 'center',
  };
  const rowLabelCell: React.CSSProperties = {
    padding: '0.7rem 0.9rem',
    borderTop: '1px solid var(--border)',
    color: 'var(--muted)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem 5rem' }}>
      {backLink}
      <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, maxWidth: 640 }}>
        {t('subtitle')}
      </p>

      <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, textAlign: 'left' }} />
              {tipsters.map((p, i) => (
                <th key={p.tipsterId} style={headCell}>
                  <span
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: SERIES_COLORS[i % SERIES_COLORS.length],
                      }}
                    />
                    <Avatar src={p.avatarUrl} seed={displayName(p)} size={44} />
                    <Link
                      href={`/tipsters/${p.tipsterId}`}
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {displayName(p)}
                    </Link>
                    {p.country ? <Flag code={p.country} /> : null}
                    <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {p.sports.length ? p.sports.join(', ') : '—'}
                    </span>
                    {p.verified ? (
                      <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>
                        ✓ {t('verified')}
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = tipsters.map(row.value);
              const best = bestIndices(values, row.higherBetter);
              return (
                <tr key={row.key}>
                  <td style={rowLabelCell}>{row.label}</td>
                  {tipsters.map((p, i) => {
                    const isBest = best.has(i);
                    const lowSample =
                      row.key === 'sample' &&
                      p.stats != null &&
                      p.stats.sampleSize < LOW_SAMPLE;
                    return (
                      <td
                        key={p.tipsterId}
                        style={{
                          ...cell,
                          fontWeight: isBest ? 700 : 400,
                          color: isBest ? 'var(--success)' : 'var(--fg)',
                          background: isBest
                            ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                            : 'transparent',
                        }}
                      >
                        {row.render(p)}
                        {lowSample ? (
                          <span
                            style={{
                              display: 'block',
                              color: 'var(--muted)',
                              fontSize: '0.7rem',
                              fontWeight: 400,
                            }}
                          >
                            {t('lowSample')}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
        {t('bestNote')}
      </p>

      <section style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem' }}>
          {t('clvOverlayTitle')}
        </h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: '0.9rem' }}>
          {t('clvOverlayHelp')}
        </p>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '1rem',
            marginTop: '0.75rem',
          }}
        >
          <ClvOverlay series={clvSeries} />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              marginTop: '0.75rem',
            }}
          >
            {clvSeries.map((s) => (
              <span
                key={s.name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: 3,
                    borderRadius: 2,
                    background: s.color,
                  }}
                />
                {s.name}
                <span style={{ color: 'var(--muted)' }}>
                  {s.sampleSize > 0
                    ? `${s.averagePct >= 0 ? '+' : ''}${s.averagePct.toFixed(2)}%`
                    : t('noClv')}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
