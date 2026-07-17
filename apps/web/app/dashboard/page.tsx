'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile, requestPayout } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import { SUPPORTED_MARKETS } from '@overlay/shared/grading';
import type {
  FeedPick,
  OnboardingStatus,
  PerformanceDashboard,
} from '../../lib/api';
import { formStyles } from '../formStyles';
import PerformanceDashboardView from '../PerformanceDashboard';
import UserDashboard from './UserDashboard';

interface EventRow {
  id: string;
  sport: string;
  league: string | null;
  home: string;
  away: string;
  startTime: string;
}

type TipsFilter = 'open' | 'settled' | 'all';
type SettledOutcome = 'all' | 'won' | 'lost' | 'void';

/** Market + best prices per selection, for the odds-driven pick form. */
interface MarketOdds {
  market: string;
  prices: Record<string, number>;
}

/** Compact earnings summary shown inline on the dashboard. */
interface Earnings {
  activeSubscribers: number;
  feeRate: number;
  projected: { grossCents: number; feeCents: number; netCents: number };
  paidCents: number;
  pendingCents: number;
  availableCents: number;
  awaitingApproval: boolean;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Single source of truth (shared with the server DTO + grader).
const MARKETS = SUPPORTED_MARKETS;

// Per-market guidance for the selection field so picks match the grader's
// expected format (see packages/shared/src/grading.ts).
const SELECTION_HINTS: Record<string, string> = {
  '1X2': 'home, draw or away',
  moneyline: 'home or away',
  dnb: 'home or away (draw no bet)',
  double_chance: '1X, 12 or X2',
  btts: 'yes or no (both teams to score)',
  spreads: 'e.g. home -1.5, away +0.25 (Asian OK)',
  totals: 'e.g. over 2.5 or under 3',
  team_totals: 'e.g. home over 1.5',
  odd_even: 'odd or even',
  correct_score: 'e.g. 2-1',
};

export default function DashboardPage() {
  const router = useRouter();
  const [viewRole, setViewRole] = useState<'user' | 'tipster' | null>(null);
  const [tipsterId, setTipsterId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [myTips, setMyTips] = useState<FeedPick[]>([]);
  const [detailPick, setDetailPick] = useState<FeedPick | null>(null);
  const [tipsFilter, setTipsFilter] = useState<TipsFilter>('all');
  const [settledOutcome, setSettledOutcome] = useState<SettledOutcome>('all');
  const [performance, setPerformance] = useState<PerformanceDashboard | null>(
    null,
  );
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [form, setForm] = useState({
    eventId: '',
    market: '1X2',
    selection: '',
    oddsAtPick: '2.00',
    stakeUnits: '1',
    note: '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pick-form discovery: filters + odds-driven selection.
  const [filters, setFilters] = useState<{
    sports: string[];
    leagues: Record<string, string[]>;
  }>({ sports: [], leagues: {} });
  const [fSport, setFSport] = useState('');
  const [fLeague, setFLeague] = useState('');
  const [fQuery, setFQuery] = useState('');
  const [eventOdds, setEventOdds] = useState<MarketOdds[] | null>(null);
  const [oddsLoading, setOddsLoading] = useState(false);

  const loadMyTips = useCallback(async () => {
    try {
      const res = await authFetch('/api/picks/me?status=all');
      setMyTips(res.ok ? ((await res.json()) as FeedPick[]) : []);
    } catch {
      setMyTips([]);
    }
  }, []);

  const loadPerformance = useCallback(async () => {
    try {
      const res = await authFetch('/api/picks/me/performance');
      if (res.ok) setPerformance((await res.json()) as PerformanceDashboard);
    } catch {
      setPerformance(null);
    }
  }, []);

  const loadOnboarding = useCallback(async () => {
    try {
      const res = await authFetch('/api/tipsters/me/onboarding');
      if (res.ok) setOnboarding((await res.json()) as OnboardingStatus);
    } catch {
      setOnboarding(null);
    }
  }, []);

  const loadSubscribers = useCallback(async () => {
    try {
      const res = await authFetch('/api/tipsters/me/subscribers');
      if (res.ok) {
        const { count } = (await res.json()) as { count: number };
        setSubscriberCount(count);
      }
    } catch {
      setSubscriberCount(null);
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      const res = await authFetch('/api/payouts/me');
      if (res.ok) setEarnings((await res.json()) as Earnings);
    } catch {
      setEarnings(null);
    }
  }, []);

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/events/filters`);
      if (res.ok) {
        setFilters(
          (await res.json()) as {
            sports: string[];
            leagues: Record<string, string[]>;
          },
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadEvents = useCallback(
    async (sport: string, league: string, q: string) => {
      const qs = new URLSearchParams();
      if (sport) qs.set('sport', sport);
      if (league) qs.set('league', league);
      if (q.trim()) qs.set('q', q.trim());
      try {
        const res = await fetch(`${API_URL}/api/events/upcoming?${qs.toString()}`);
        setEvents(res.ok ? ((await res.json()) as EventRow[]) : []);
      } catch {
        setEvents([]);
      }
    },
    [],
  );

  /** Load an event's live markets/odds and default the form to the first line. */
  const loadEventOdds = useCallback(async (eventId: string) => {
    if (!eventId) {
      setEventOdds(null);
      return;
    }
    setOddsLoading(true);
    try {
      const res = await authFetch(`/api/events/${eventId}/odds`);
      const odds = res.ok ? ((await res.json()) as MarketOdds[]) : [];
      setEventOdds(odds);
      if (odds.length > 0) {
        const first = odds[0];
        const [sel, price] = Object.entries(first.prices)[0] ?? ['', 0];
        setForm((f) => ({
          ...f,
          market: first.market,
          selection: sel,
          oddsAtPick: price ? String(price) : f.oddsAtPick,
        }));
      }
    } catch {
      setEventOdds([]);
    } finally {
      setOddsLoading(false);
    }
  }, []);

  function selectEvent(eventId: string) {
    setForm((f) => ({ ...f, eventId, selection: '' }));
    loadEventOdds(eventId);
  }

  function selectMarket(market: string) {
    const prices = eventOdds?.find((m) => m.market === market)?.prices;
    if (prices) {
      const [sel, price] = Object.entries(prices)[0] ?? ['', 0];
      setForm((f) => ({
        ...f,
        market,
        selection: sel,
        oddsAtPick: price ? String(price) : f.oddsAtPick,
      }));
    } else {
      setForm((f) => ({ ...f, market, selection: '' }));
    }
  }

  function selectSelection(sel: string) {
    const price = eventOdds?.find((m) => m.market === form.market)?.prices[sel];
    setForm((f) => ({
      ...f,
      selection: sel,
      oddsAtPick: price ? String(price) : f.oddsAtPick,
    }));
  }

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (profile.role === 'admin') {
        router.replace('/admin');
        return;
      }
      if (profile.role === 'user' || !profile.tipsterId) {
        // Bettors get their own user dashboard (rendered below).
        setViewRole('user');
        return;
      }
      setViewRole('tipster');
      setTipsterId(profile.tipsterId);
      loadFilters();
      loadEvents('', '', '');
      loadPerformance();
      loadOnboarding();
      loadSubscribers();
      loadEarnings();
    })();
  }, [
    router,
    loadPerformance,
    loadOnboarding,
    loadSubscribers,
    loadEarnings,
    loadFilters,
    loadEvents,
  ]);

  // Load My Tips once the tipster is known (all statuses; filtered client-side).
  useEffect(() => {
    if (tipsterId) loadMyTips();
  }, [tipsterId, loadMyTips]);

  // Refetch the event list whenever the sport/league/search filter changes.
  useEffect(() => {
    if (tipsterId) loadEvents(fSport, fLeague, fQuery);
  }, [tipsterId, fSport, fLeague, fQuery, loadEvents]);

  async function submitPick(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.eventId) {
      setMsg('Pick an event first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/picks', {
        method: 'POST',
        body: JSON.stringify({
          eventId: form.eventId,
          market: form.market,
          selection: form.selection,
          oddsAtPick: Number(form.oddsAtPick),
          stakeUnits: Number(form.stakeUnits),
          note: form.note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setMsg('Pick locked ✓');
      setForm((f) => ({ ...f, selection: '', note: '' }));
      await loadMyTips();
      await loadPerformance();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function requestOnDemandPayout() {
    setPayoutBusy(true);
    setPayoutMsg(null);
    try {
      const { amountCents } = await requestPayout();
      setPayoutMsg(
        `Requested $${(amountCents / 100).toFixed(2)} — awaiting admin approval.`,
      );
      await loadEarnings();
    } catch (e) {
      setPayoutMsg(e instanceof Error ? e.message : 'Could not request payout.');
    } finally {
      setPayoutBusy(false);
    }
  }

  if (viewRole === 'user') return <UserDashboard />;
  if (viewRole !== 'tipster') return null;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Tipster dashboard</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Picks are hash-locked and timestamped the moment you submit — before
        kickoff. That’s what makes your record verifiable.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '1rem 0 1.75rem',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: '0.15rem',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '0.9rem 1.4rem',
            background: 'var(--surface)',
          }}
        >
          <span style={{ fontSize: '1.9rem', fontWeight: 700, lineHeight: 1 }}>
            {subscriberCount ?? '—'}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Active subscriber{subscriberCount === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          <a href="#my-tips" className="btn btn--primary btn--sm">
            My tips
          </a>
          <a href="#earnings" className="btn btn--secondary btn--sm">
            Earnings &amp; payouts
          </a>
          <Link href="/dashboard/profile" className="btn btn--secondary btn--sm">
            Edit public profile
          </Link>
          <Link href="/admin/blog" className="btn btn--secondary btn--sm">
            Write an article
          </Link>
        </div>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Submit a pick</h2>
      {onboarding && !onboarding.canPublish ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '1rem 1.2rem',
            background: 'var(--surface)',
          }}
        >
          <p style={{ margin: '0 0 0.5rem' }}>
            Finish onboarding ({onboarding.completedSteps}/
            {onboarding.totalSteps} steps) to unlock pick publishing.
          </p>
          <Link href="/onboarding" style={{ color: 'var(--accent)' }}>
            → Complete onboarding
          </Link>
        </div>
      ) : (
        <form
          onSubmit={submitPick}
          style={{ ...formStyles.form, maxWidth: 520 }}
        >
        {/* Narrow down: sport → league → search by team. */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter by sport"
            style={{ ...formStyles.input, flex: '1 1 140px' }}
            value={fSport}
            onChange={(e) => {
              setFSport(e.target.value);
              setFLeague('');
            }}
          >
            <option value="">All sports</option>
            {filters.sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by league"
            style={{ ...formStyles.input, flex: '1 1 140px' }}
            value={fLeague}
            onChange={(e) => setFLeague(e.target.value)}
            disabled={!fSport || !(filters.leagues[fSport]?.length)}
          >
            <option value="">All leagues</option>
            {(filters.leagues[fSport] ?? []).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input
          style={formStyles.input}
          placeholder="Search teams…"
          value={fQuery}
          onChange={(e) => setFQuery(e.target.value)}
        />

        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Event
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.eventId}
            onChange={(e) => selectEvent(e.target.value)}
          >
            <option value="">
              {events.length
                ? 'Select an event…'
                : 'No matching events'}
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.home} vs {ev.away} — {new Date(ev.startTime).toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Market
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.market}
            onChange={(e) => selectMarket(e.target.value)}
          >
            {(eventOdds && eventOdds.length > 0
              ? eventOdds.map((m) => m.market)
              : MARKETS
            ).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        {(() => {
          const prices = eventOdds?.find((m) => m.market === form.market)?.prices;
          const hasLiveOdds = !!prices && Object.keys(prices).length > 0;
          return (
            <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
              Selection
              {oddsLoading ? (
                <span style={{ marginLeft: '0.5rem' }}>· loading odds…</span>
              ) : null}
              {hasLiveOdds ? (
                <select
                  style={{ ...formStyles.input, marginTop: '0.35rem' }}
                  value={form.selection}
                  onChange={(e) => selectSelection(e.target.value)}
                  required
                >
                  <option value="">Choose a line…</option>
                  {Object.entries(prices!).map(([sel, price]) => (
                    <option key={sel} value={sel}>
                      {sel} @ {price.toFixed(2)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={{ ...formStyles.input, marginTop: '0.35rem' }}
                  placeholder={SELECTION_HINTS[form.market] ?? 'Selection'}
                  value={form.selection}
                  onChange={(e) =>
                    setForm({ ...form, selection: e.target.value })
                  }
                  required
                />
              )}
            </label>
          );
        })()}

        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Odds{' '}
          {eventOdds && eventOdds.length > 0 ? (
            <span style={{ fontSize: '0.8rem' }}>
              (auto-filled from the live line — editable)
            </span>
          ) : null}
          <input
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            type="number"
            step="0.01"
            min="1.01"
            placeholder="Odds"
            value={form.oddsAtPick}
            onChange={(e) => setForm({ ...form, oddsAtPick: e.target.value })}
            required
          />
        </label>
        <input
          style={formStyles.input}
          type="number"
          step="0.1"
          min="0.1"
          placeholder="Stake (units)"
          value={form.stakeUnits}
          onChange={(e) => setForm({ ...form, stakeUnits: e.target.value })}
          required
        />
        <textarea
          style={{ ...formStyles.input, minHeight: 72, resize: 'vertical' }}
          placeholder="Optional context / reasoning (shown to subscribers)"
          value={form.note}
          maxLength={280}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        {msg ? <p style={{ color: 'var(--accent)', margin: 0 }}>{msg}</p> : null}
        <button className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Locking…' : 'Lock pick'}
        </button>
      </form>
      )}

      <PerformanceDashboardView data={performance} />

      <section id="earnings" style={{ marginTop: '2.5rem', scrollMarginTop: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem' }}>Earnings &amp; payouts</h2>
        {earnings ? (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {[
                {
                  label: 'Available now',
                  value: money(earnings.availableCents),
                  hint: 'ready to withdraw',
                },
                {
                  label: 'Projected this cycle',
                  value: money(earnings.projected.netCents),
                  hint: `after ${Math.round(earnings.feeRate * 100)}% platform fee`,
                },
                { label: 'Paid out', value: money(earnings.paidCents) },
                { label: 'Pending', value: money(earnings.pendingCents) },
              ].map((c) => (
                <div
                  key={c.label}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '0.9rem 1rem',
                    background: 'var(--surface)',
                  }}
                >
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {c.value}
                  </div>
                  {c.hint ? (
                    <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                      {c.hint}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.9rem' }}>
              Payouts are processed <strong>every Tuesday</strong>. Need funds
              sooner? Request an off-schedule payout below — it’s released once an
              admin approves it.{' '}
              <Link href="/earnings" style={{ color: 'var(--accent)' }}>
                Full payout history →
              </Link>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={
                  payoutBusy ||
                  earnings.awaitingApproval ||
                  earnings.availableCents <= 0
                }
                onClick={requestOnDemandPayout}
              >
                {payoutBusy ? 'Requesting…' : 'Request payout now'}
              </button>
              {earnings.awaitingApproval ? (
                <span style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                  A payout request is awaiting admin approval.
                </span>
              ) : null}
              {payoutMsg ? (
                <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>
                  {payoutMsg}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Loading earnings…</p>
        )}
      </section>

      {(() => {
        const openCount = myTips.filter((p) => p.status === 'pending').length;
        const settledList = myTips.filter((p) => p.status !== 'pending');
        const wonCount = settledList.filter(
          (p) => outcomeBucket(p.status) === 'won',
        ).length;
        const lostCount = settledList.filter(
          (p) => outcomeBucket(p.status) === 'lost',
        ).length;
        const voidCount = settledList.filter(
          (p) => outcomeBucket(p.status) === 'void',
        ).length;

        const mainTabs: { key: TipsFilter; label: string; count: number }[] = [
          { key: 'open', label: 'Open', count: openCount },
          { key: 'settled', label: 'Settled', count: settledList.length },
          { key: 'all', label: 'All', count: myTips.length },
        ];
        const subTabs: { key: SettledOutcome; label: string; count: number }[] =
          [
            { key: 'all', label: 'All', count: settledList.length },
            { key: 'won', label: 'Won', count: wonCount },
            { key: 'lost', label: 'Lost', count: lostCount },
            { key: 'void', label: 'Void', count: voidCount },
          ];

        const rows =
          tipsFilter === 'open'
            ? myTips.filter((p) => p.status === 'pending')
            : tipsFilter === 'all'
              ? myTips
              : settledList.filter(
                  (p) =>
                    settledOutcome === 'all' ||
                    outcomeBucket(p.status) === settledOutcome,
                );

        return (
          <>
            <div
              id="my-tips"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '2.5rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
                scrollMarginTop: '1rem',
              }}
            >
              <h2 style={{ margin: 0 }}>My tips</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {mainTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTipsFilter(t.key)}
                    style={pillStyle(tipsFilter === t.key)}
                  >
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>
            </div>

            {tipsFilter === 'settled' ? (
              <div
                style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}
              >
                {subTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSettledOutcome(t.key)}
                    style={pillStyle(settledOutcome === t.key, true)}
                  >
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>
            ) : null}

            {rows.length === 0 ? (
              <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
                {tipsFilter === 'open'
                  ? 'No open tips right now.'
                  : tipsFilter === 'settled'
                    ? 'No settled tips in this view.'
                    : 'No tips yet.'}
              </p>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  marginTop: '1rem',
                }}
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '0.5rem 0' }}>Match</th>
                    <th>Selection</th>
                    <th>Market</th>
                    <th>Odds</th>
                    <th>CLV</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setDetailPick(p)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailPick(p);
                        }
                      }}
                      title="View tip details"
                      style={{
                        borderTop: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '0.5rem 0', color: 'var(--muted)' }}>
                        {p.event ? `${p.event.home} v ${p.event.away}` : '—'}
                      </td>
                      <td>{p.selection}</td>
                      <td>{p.market}</td>
                      <td>{p.oddsAtPick.toFixed(2)}</td>
                      <td>
                        {p.clv != null ? `${(p.clv * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td>{formatTipStatus(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        );
      })()}
      {detailPick ? (
        <TipDetailModal
          pick={detailPick}
          onClose={() => setDetailPick(null)}
        />
      ) : null}
    </main>
  );
}

/** Bucket a pick status into its coarse settled outcome (halves fold in). */
function outcomeBucket(status: string): 'won' | 'lost' | 'void' | null {
  if (status === 'won' || status === 'half_won') return 'won';
  if (status === 'lost' || status === 'half_lost') return 'lost';
  if (status === 'void') return 'void';
  return null;
}

/** Pill button style for the tips filter tabs. */
function pillStyle(active: boolean, small = false): React.CSSProperties {
  return {
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--on-accent)' : 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: small ? '0.25rem 0.75rem' : '0.3rem 0.9rem',
    fontSize: small ? '0.8rem' : '0.85rem',
    cursor: 'pointer',
  };
}

/** Pretty pick-status label (handles Asian half results). */
function formatTipStatus(status: string): string {
  if (status === 'pending') return 'Open';
  if (status === 'half_won') return '½ won';
  if (status === 'half_lost') return '½ lost';
  return status;
}

/**
 * Detail view for a single tip, opened by clicking a row in "My tips". Shows the
 * full context (event, stake, CLV, result, note) plus the plain-language lock
 * timestamp. Closes on backdrop click, the close button, or Escape.
 */
function TipDetailModal({
  pick,
  onClose,
}: {
  pick: FeedPick;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmt = (ms: number | null) =>
    ms
      ? new Date(ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';
  const beforeKickoff = pick.event ? pick.lockedAt < pick.event.startTime : true;

  const details: [string, string][] = [
    ['Match', pick.event ? `${pick.event.home} v ${pick.event.away}` : '—'],
    ['Sport', pick.event?.sport ?? '—'],
    ['Kickoff', pick.event ? fmt(pick.event.startTime) : '—'],
    ['Selection', pick.selection],
    ['Market', pick.market],
    ['Odds', pick.oddsAtPick.toFixed(2)],
    ['Stake', `${pick.stakeUnits} unit${pick.stakeUnits === 1 ? '' : 's'}`],
    ['Status', formatTipStatus(pick.status)],
    ['CLV', pick.clv != null ? `${(pick.clv * 100).toFixed(1)}%` : '—'],
    ['Result', pick.result ?? '—'],
    [
      'Locked',
      `${fmt(pick.lockedAt)}${beforeKickoff ? ' · before kickoff' : ''}`,
    ],
    ['Settled', fmt(pick.settledAt)],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tip details"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 460,
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.25rem 1.4rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Tip details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn--ghost btn--sm"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            marginTop: '1rem',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.5rem 1rem',
          }}
        >
          {details.map(([label, value]) => (
            <Fragment key={label}>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {label}
              </span>
              <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>
                {value}
              </span>
            </Fragment>
          ))}
        </div>
        {pick.note ? (
          <div
            style={{
              marginTop: '1rem',
              borderTop: '1px solid var(--border)',
              paddingTop: '0.75rem',
            }}
          >
            <div
              style={{
                color: 'var(--muted)',
                fontSize: '0.85rem',
                marginBottom: '0.25rem',
              }}
            >
              Note
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{pick.note}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
