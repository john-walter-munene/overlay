'use client';

import type { CSSProperties } from 'react';
import type { PerformanceDashboard, PerformancePoint } from '../lib/api';

const MUTED = '#9aa4b2';
const ACCENT = '#6ea8fe';
const BORDER = '#1c2430';
const PANEL = '#111826';
const WIN = '#3fb950';
const LOSS = '#ff6b8a';
const VOID = '#8b98a8';
const PENDING = '#d29922';

const cardStyle: CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: '1rem 1.1rem',
  background: PANEL,
};

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ color: MUTED, fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{value}</div>
      {hint ? (
        <div style={{ color: MUTED, fontSize: '0.75rem', marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Minimal dependency-free line chart. Maps `values` to an SVG polyline within a
 * 100x40 viewBox (preserveAspectRatio none stretches it to fill). Draws a zero
 * baseline when the series crosses zero so gains/losses read at a glance.
 */
function LineChart({
  values,
  color,
  showZero = false,
}: {
  values: number[];
  color: string;
  showZero?: boolean;
}) {
  const w = 100;
  const h = 40;
  const pad = 2;
  const min = Math.min(...values, showZero ? 0 : Infinity);
  const max = Math.max(...values, showZero ? 0 : -Infinity);
  const span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) =>
    values.length <= 1 ? w / 2 : pad + (i / (values.length - 1)) * (w - pad * 2);

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const zeroY = y(0);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 48, display: 'block' }}
      role="img"
    >
      {showZero && min < 0 && max > 0 ? (
        <line
          x1={0}
          x2={w}
          y1={zeroY}
          y2={zeroY}
          stroke={BORDER}
          strokeWidth={0.5}
        />
      ) : null}
      {values.length === 1 ? (
        <circle cx={x(0)} cy={y(values[0])} r={1.5} fill={color} />
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function ChartPanel({
  title,
  current,
  values,
  color,
  showZero,
}: {
  title: string;
  current: string;
  values: number[];
  color: string;
  showZero?: boolean;
}) {
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.4rem',
        }}
      >
        <span style={{ color: MUTED, fontSize: '0.8rem' }}>{title}</span>
        <span style={{ fontWeight: 600 }}>{current}</span>
      </div>
      <LineChart values={values} color={color} showZero={showZero} />
    </div>
  );
}

function BreakdownBar({
  breakdown,
}: {
  breakdown: PerformanceDashboard['breakdown'];
}) {
  const segments = [
    { label: 'Won', value: breakdown.won, color: WIN },
    { label: 'Lost', value: breakdown.lost, color: LOSS },
    { label: 'Void', value: breakdown.void, color: VOID },
    { label: 'Pending', value: breakdown.pending, color: PENDING },
  ].filter((s) => s.value > 0);

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '0.6rem',
        }}
      >
        <span style={{ color: MUTED, fontSize: '0.8rem' }}>
          Pending vs settled
        </span>
        <span style={{ fontSize: '0.8rem', color: MUTED }}>
          {breakdown.settled} settled · {breakdown.pending} pending
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 14,
          borderRadius: 7,
          overflow: 'hidden',
          background: PANEL,
          border: `1px solid ${BORDER}`,
        }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.value}`}
            style={{
              width: `${(s.value / breakdown.total) * 100}%`,
              background: s.color,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginTop: '0.6rem',
        }}
      >
        {[
          { label: 'Won', value: breakdown.won, color: WIN },
          { label: 'Lost', value: breakdown.lost, color: LOSS },
          { label: 'Void', value: breakdown.void, color: VOID },
          { label: 'Pending', value: breakdown.pending, color: PENDING },
        ].map((s) => (
          <span
            key={s.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: MUTED,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: s.color,
                display: 'inline-block',
              }}
            />
            {s.label} {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function streakLabel(streak: number): string {
  if (streak === 0) return '—';
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}

export default function PerformanceDashboardView({
  data,
}: {
  data: PerformanceDashboard | null;
}) {
  const hasSettled = !!data && data.series.length > 0;
  const stats = data?.stats;

  return (
    <section>
      <h2 style={{ marginTop: '2.5rem' }}>Performance</h2>

      {!data ? (
        <p style={{ color: MUTED }}>Couldn’t load your performance right now.</p>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '0.85rem',
            }}
          >
            <SummaryCard
              label="Yield"
              value={stats ? `${stats.yield.toFixed(1)}%` : '—'}
              hint="Profit / turnover"
            />
            <SummaryCard
              label="ROI"
              value={stats ? `${(stats.roi * 100).toFixed(1)}%` : '—'}
            />
            <SummaryCard
              label="CLV"
              value={stats ? `${(stats.clvAvg * 100).toFixed(2)}%` : '—'}
              hint="Avg closing-line value"
            />
            <SummaryCard
              label="Win rate"
              value={stats ? `${(stats.winRate * 100).toFixed(0)}%` : '—'}
            />
            <SummaryCard
              label="Max drawdown"
              value={stats ? `${stats.maxDrawdown.toFixed(2)}u` : '—'}
            />
            <SummaryCard
              label="Streak"
              value={stats ? streakLabel(stats.currentStreak) : '—'}
              hint={`${stats?.sampleSize ?? 0} settled picks`}
            />
          </div>

          {hasSettled ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.85rem',
                marginTop: '1rem',
              }}
            >
              <ChartPanel
                title="Cumulative units"
                current={`${last(data.series).cumulativeUnits.toFixed(2)}u`}
                values={data.series.map((p) => p.cumulativeUnits)}
                color={ACCENT}
                showZero
              />
              <ChartPanel
                title="Yield over time"
                current={`${last(data.series).yield.toFixed(1)}%`}
                values={data.series.map((p) => p.yield)}
                color={WIN}
                showZero
              />
              <ChartPanel
                title="CLV over time"
                current={`${(last(data.series).clvAvg * 100).toFixed(2)}%`}
                values={data.series.map((p) => p.clvAvg * 100)}
                color="#a371f7"
                showZero
              />
              <ChartPanel
                title="Win rate over time"
                current={`${(last(data.series).winRate * 100).toFixed(0)}%`}
                values={data.series.map((p) => p.winRate * 100)}
                color={ACCENT}
              />
              <ChartPanel
                title="Drawdown"
                current={`${last(data.series).drawdown.toFixed(2)}u`}
                values={data.series.map((p) => p.drawdown)}
                color={LOSS}
              />
            </div>
          ) : (
            <p style={{ color: MUTED, marginTop: '1rem' }}>
              No settled picks yet — your ROI, yield, CLV and win-rate charts
              appear here once picks are graded.
            </p>
          )}

          <div style={{ marginTop: '1rem' }}>
            <BreakdownBar breakdown={data.breakdown} />
          </div>
        </>
      )}
    </section>
  );
}

function last(series: PerformancePoint[]): PerformancePoint {
  return series[series.length - 1];
}
