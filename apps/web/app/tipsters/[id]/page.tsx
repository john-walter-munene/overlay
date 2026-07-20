import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildClvChart } from '@overlay/shared/tipster-profile';
import { countryLabel } from '@overlay/shared/countries';
import Flag from '../../Flag';
import FollowButton from '../../FollowButton';
import SubscribeButton from '../../SubscribeButton';
import Avatar from '../../Avatar';
import { getTipster, listTipsterIds, tipsterStaticParams, SITE_URL } from '../../../lib/api';
import type { VerifiedMetrics as VerifiedMetricsData } from '../../../lib/api';
import TipsterTips from './TipsterTips';

export const revalidate = 60;

/** Pre-render active tipster profiles at build time for SEO/perf (OB-131). */
export async function generateStaticParams() {
  return tipsterStaticParams(await listTipsterIds());
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const t = await getTipster(params.id);
  if (!t) return { title: 'Tipster not found — Overlay Bets' };
  const name = t.displayName ?? t.username ?? t.tipsterId;
  const y = t.stats ? `${t.stats.yield.toFixed(1)}% yield` : 'verified picks';
  return {
    title: `${name} — ${y} · Overlay Bets`,
    description:
      t.bio ??
      `Verified betting record for ${name}: ROI, closing line value and settled picks — all cryptographically locked before kickoff.`,
    alternates: { canonical: `${SITE_URL}/tipsters/${t.tipsterId}` },
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/**
 * Public "CLV over time" chart (OB-011): a dependency-free SVG line of the
 * tipster's cumulative-average closing-line value across their settled picks.
 * `points` are percentages produced by the shared, unit-tested buildClvChart.
 */
function ClvChart({ points }: { points: number[] }) {
  const w = 100;
  const h = 40;
  const pad = 2;
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x = (i: number) =>
    points.length <= 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2);
  const zeroY = y(0);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 64, display: 'block' }}
      role="img"
      aria-label="Cumulative average closing-line value over time"
    >
      {min < 0 && max > 0 ? (
        <line
          x1={0}
          x2={w}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={0.5}
        />
      ) : null}
      {points.length === 1 ? (
        <circle cx={x(0)} cy={y(points[0])} r={1.5} fill="#a371f7" />
      ) : (
        <polyline
          points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke="#a371f7"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/**
 * Additional verified metrics (OB-057): a CLV distribution histogram, ROI by
 * sport and by market, and 30/90/all-time performance windows. All figures come
 * from the shared, unit-tested stats engine — deterministic and computed over
 * the tipster's pre-match (CLV-bearing) book only.
 */
function pctText(v: number, digits = 1): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function WindowCard({
  label,
  stats,
}: {
  label: string;
  stats: VerifiedMetricsData['windows']['last30'];
}) {
  return (
    <div
      style={{
        padding: '0.9rem 1rem',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{label}</div>
      {stats.sampleSize > 0 ? (
        <>
          <div style={{ fontSize: '1.3rem', fontWeight: 600 }}>
            {pctText(stats.yield)}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
            {stats.sampleSize} pick{stats.sampleSize === 1 ? '' : 's'} ·{' '}
            {(stats.winRate * 100).toFixed(0)}% win
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No picks</div>
      )}
    </div>
  );
}

function DimensionTable({
  heading,
  rows,
}: {
  heading: string;
  rows: VerifiedMetricsData['bySport'];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>{heading}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
            <th style={{ padding: '0.25rem 0', fontWeight: 500 }}>Name</th>
            <th style={{ padding: '0.25rem 0', fontWeight: 500, textAlign: 'right' }}>
              Yield
            </th>
            <th style={{ padding: '0.25rem 0', fontWeight: 500, textAlign: 'right' }}>
              Win
            </th>
            <th style={{ padding: '0.25rem 0', fontWeight: 500, textAlign: 'right' }}>
              Picks
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '0.35rem 0' }}>{r.key}</td>
              <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>
                {pctText(r.stats.yield)}
              </td>
              <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>
                {(r.stats.winRate * 100).toFixed(0)}%
              </td>
              <td style={{ padding: '0.35rem 0', textAlign: 'right' }}>
                {r.stats.sampleSize}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClvHistogram({
  distribution,
}: {
  distribution: VerifiedMetricsData['clvDistribution'];
}) {
  const max = Math.max(1, ...distribution.buckets.map((b) => b.count));
  return (
    <div>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>CLV distribution</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        {(distribution.positiveRate * 100).toFixed(0)}% of{' '}
        {distribution.sampleSize} graded pick
        {distribution.sampleSize === 1 ? '' : 's'} beat the closing line.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {distribution.buckets.map((b) => (
          <div
            key={b.label}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span
              style={{
                width: 96,
                flexShrink: 0,
                color: 'var(--muted)',
                fontSize: '0.78rem',
                textAlign: 'right',
              }}
            >
              {b.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 14,
                background: 'var(--border)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(b.count / max) * 100}%`,
                  height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
            <span style={{ width: 24, textAlign: 'right', fontSize: '0.8rem' }}>
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifiedMetrics({ metrics }: { metrics: VerifiedMetricsData }) {
  const { windows, clvDistribution, bySport, byMarket } = metrics;
  const hasBreakdown = bySport.length > 0 || byMarket.length > 0;
  return (
    <section aria-labelledby="metrics-heading" style={{ marginTop: '2rem' }}>
      <h2 id="metrics-heading" style={{ margin: '0 0 0.75rem' }}>
        Verified performance
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <WindowCard label="Last 30 days" stats={windows.last30} />
        <WindowCard label="Last 90 days" stats={windows.last90} />
        <WindowCard label="All time" stats={windows.allTime} />
      </div>

      {clvDistribution.sampleSize > 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <ClvHistogram distribution={clvDistribution} />
        </div>
      ) : null}

      {hasBreakdown ? (
        <div
          style={{
            marginTop: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <DimensionTable heading="ROI by sport" rows={bySport} />
          <DimensionTable heading="ROI by market" rows={byMarket} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * "How verification works" explainer (OB-011): plain-language walk-through of
 * the hash + server-timestamp integrity guarantee that backs every pick.
 */
function VerificationExplainer() {
  return (
    <section
      aria-labelledby="verify-heading"
      style={{
        marginTop: '2.5rem',
        padding: '1.25rem',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <h2 id="verify-heading" style={{ marginTop: 0 }}>
        How verification works
      </h2>
      <p style={{ color: 'var(--fg)' }}>
        Every pick is locked before the event starts, so a tipster can never
        edit a selection, odds or stake after the fact.
      </p>
      <ol style={{ color: 'var(--fg)', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
        <li>
          <strong>Hashed at lock time.</strong> When a pick is submitted we
          compute a SHA-256 hash over its canonical fields (selection, market,
          odds and stake) plus a secret server pepper. That hash is stored and
          never changed.
        </li>
        <li>
          <strong>Server timestamp.</strong> The lock time is stamped by our
          server, not the tipster’s device, and picks on events that have
          already started are rejected — proving the call came in pre-kickoff.
        </li>
        <li>
          <strong>Tamper-evident.</strong> Because the hash depends on the exact
          pick, any later change would produce a different hash and fail
          verification. The original hash and timestamp are written to an
          append-only audit log.
        </li>
        <li>
          <strong>Graded transparently.</strong> After the event we record the
          closing odds and settle the pick, so the closing-line value (CLV) and
          results you see above are computed from locked, verifiable data.
        </li>
      </ol>
    </section>
  );
}

export default async function TipsterPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTipster(params.id);
  if (!t) notFound();
  const s = t.stats;
  const clv = buildClvChart(t.recentPicks);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>
          ← Leaderboard
        </Link>
      </p>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <Avatar src={t.avatarUrl} seed={t.username ?? t.tipsterId} size={80} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '2.1rem', margin: '0 0 0.25rem' }}>
            {t.displayName ?? t.username ?? t.tipsterId}
            {t.country ? (
              <Flag code={t.country} style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }} />
            ) : null}
            {t.verified ? (
              <span
                title="Verified identity"
                style={{
                  marginLeft: '0.6rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  verticalAlign: 'middle',
                }}
              >
                ✓ Verified
              </span>
            ) : null}
            {t.graduation?.provisional ? (
              <span
                title="Rising tipster — tips are free while this tipster builds a verified track record"
                style={{
                  marginLeft: '0.6rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '0.1rem 0.5rem',
                  verticalAlign: 'middle',
                }}
              >
                🌱 Rising tipster
              </span>
            ) : null}
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {t.country ? `${countryLabel(t.country)} · ` : ''}
            {t.subscriberCount} subscriber{t.subscriberCount === 1 ? '' : 's'}
            {' · '}
            {t.followerCount} following
          </p>
        </div>
      </div>
      <div
        style={{
          margin: '0.75rem 0 0.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.6rem',
          alignItems: 'center',
        }}
      >
        <FollowButton tipsterId={t.tipsterId} />
        {t.subscriptionPriceCents > 0 ? (
          <a
            href="#subscribe"
            className="btn btn--primary"
            title="Paid — unlock this tipster’s premium picks the moment they’re locked, before kickoff. Cancel anytime."
          >
            ★ Subscribe · ${(t.subscriptionPriceCents / 100).toFixed(2)}/
            {t.billingInterval === 'weekly' ? 'wk' : 'mo'}
          </a>
        ) : null}
      </div>
      <p
        style={{
          color: 'var(--muted)',
          fontSize: '0.85rem',
          margin: '0 0 0.75rem',
          maxWidth: 560,
        }}
      >
        <strong style={{ color: 'var(--fg)' }}>Follow</strong> to track this
        tipster’s verified record for free — no picks unlocked.{' '}
        <strong style={{ color: 'var(--fg)' }}>Subscribe</strong> to unlock their
        premium picks the moment they’re locked, before kickoff.
      </p>
      {t.bio ? <p style={{ color: 'var(--fg)' }}>{t.bio}</p> : null}
      {t.sports.length ? (
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t.sports.join(' · ')}</p>
      ) : null}
      {t.articlesPublished > 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          ✍️ {t.articlesPublished} published article
          {t.articlesPublished === 1 ? '' : 's'}
        </p>
      ) : null}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '1rem',
          margin: '1.5rem 0',
          padding: '1.25rem',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        {s ? (
          <>
            <Stat label="Yield" value={`${s.yield.toFixed(1)}%`} />
            <Stat label="CLV" value={`${(s.clvAvg * 100).toFixed(2)}%`} />
            <Stat label="Win rate" value={`${(s.winRate * 100).toFixed(0)}%`} />
            <Stat label="Picks" value={`${s.sampleSize}`} />
          </>
        ) : (
          <p style={{ gridColumn: '1 / -1', color: 'var(--muted)', margin: 0 }}>
            Not enough settled picks yet to publish verified stats.
          </p>
        )}
      </section>

      {s && s.liveSampleSize > 0 ? (
        <section
          aria-label="Live / in-play record"
          style={{
            margin: '1.5rem 0',
            padding: '1.25rem',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <span
              title="In-play (after kickoff) picks. Excluded from CLV and scored separately from the pre-match record above — never blended."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.05rem 0.4rem',
                borderRadius: 999,
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
              }}
            >
              <span aria-hidden>●</span> Live
            </span>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>In-play record</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '1rem',
            }}
          >
            <Stat label="Live yield" value={`${s.liveYield.toFixed(1)}%`} />
            <Stat
              label="Live win rate"
              value={`${(s.liveWinRate * 100).toFixed(0)}%`}
            />
            <Stat label="Live picks" value={`${s.liveSampleSize}`} />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '1rem 0 0' }}>
            Placed after kickoff, so they carry no closing-line value and are kept
            separate from the pre-match record above.
          </p>
        </section>
      ) : null}

      {clv.sampleSize > 0 ? (
        <section style={{ marginTop: '2rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <h2 style={{ margin: 0 }}>Closing line value</h2>
            <span style={{ fontWeight: 600 }}>
              {clv.averagePct >= 0 ? '+' : ''}
              {clv.averagePct.toFixed(2)}% avg
            </span>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>
            Cumulative average CLV across {clv.sampleSize} settled pick
            {clv.sampleSize === 1 ? '' : 's'}. Positive CLV means beating the
            closing line — the strongest long-run signal of skill.
          </p>
          <div
            style={{
              padding: '1rem',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <ClvChart points={clv.points} />
          </div>
        </section>
      ) : null}

      {t.verifiedMetrics ? (
        <VerifiedMetrics metrics={t.verifiedMetrics} />
      ) : null}

      {t.subscriptionPriceCents > 0 ? (
        <section
          id="subscribe"
          aria-labelledby="subscribe-heading"
          style={{
            margin: '2rem 0',
            padding: '1.25rem',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <h2 id="subscribe-heading" style={{ marginTop: 0 }}>
            Subscribe
          </h2>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Unlock {t.displayName ?? t.username ?? 'this tipster'}’s premium
            picks the moment they’re locked — before kickoff. Cancel anytime.
            Following stays free and only tracks their public record.
          </p>
          <SubscribeButton
            tipsterId={t.tipsterId}
            priceCents={t.subscriptionPriceCents}
            billingInterval={t.billingInterval}
          />
        </section>
      ) : null}

      <div style={{ margin: '1.5rem 0' }}>
        <TipsterTips
          tipsterId={t.tipsterId}
          liveGated={t.liveGated}
          freeOpenPicks={(t.openPicks ?? []).map((p) => ({
            id: p.id,
            tipsterId: t.tipsterId,
            tipsterName: t.displayName ?? t.username,
            market: p.market,
            selection: p.selection,
            oddsAtPick: p.oddsAtPick,
            pickType: 'pre_match',
            stakeUnits: 0,
            status: p.status,
            clv: null,
            result: null,
            note: p.note,
            lockedAt: Date.parse(p.lockedAt),
            settledAt: null,
            event: null,
          }))}
        />
      </div>

      <VerificationExplainer />
    </main>
  );
}
