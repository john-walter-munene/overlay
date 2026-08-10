'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authFetch, getProfile, requestPayout } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import { downloadExport } from '../../lib/export';
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
  offers?: {
    bookmaker: string;
    bookmakerTitle?: string;
    selection: string;
    price: number;
    updatedAt?: string;
  }[];
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
// expected format (see packages/shared/src/grading.ts). Values are message keys.
const SELECTION_HINT_KEYS: Record<string, string> = {
  '1X2': 'hint1X2',
  moneyline: 'hintMoneyline',
  dnb: 'hintDnb',
  double_chance: 'hintDoubleChance',
  btts: 'hintBtts',
  spreads: 'hintSpreads',
  totals: 'hintTotals',
  team_totals: 'hintTeamTotals',
  odd_even: 'hintOddEven',
  correct_score: 'hintCorrectScore',
};

export default function DashboardPage() {
  const t = useTranslations('tipsterDashboard');
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
    pickType: 'pre_match' as 'pre_match' | 'live',
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
      if (profile.role === 'admin' || profile.role === 'staff') {
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
      setMsg(t('pickEventFirst'));
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
          pickType: form.pickType,
          note: form.note.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setMsg(t('pickLocked'));
      setForm((f) => ({ ...f, selection: '', note: '' }));
      await loadMyTips();
      await loadPerformance();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('failedToSubmit'));
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
        t('payoutRequested', { amount: (amountCents / 100).toFixed(2) }),
      );
      await loadEarnings();
    } catch (e) {
      setPayoutMsg(e instanceof Error ? e.message : t('payoutFailed'));
    } finally {
      setPayoutBusy(false);
    }
  }

  if (viewRole === 'user') return <UserDashboard />;
  if (viewRole !== 'tipster') return null;

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {t('subtitle')}
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
            {t('activeSubscribers', { count: subscriberCount ?? 0 })}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          <a href="#my-tips" className="btn btn--primary btn--sm">
            {t('navMyTips')}
          </a>
          <a href="#earnings" className="btn btn--secondary btn--sm">
            {t('navEarnings')}
          </a>
          <Link href="/dashboard/profile" className="btn btn--secondary btn--sm">
            {t('editProfile')}
          </Link>
          <Link href="/admin/blog" className="btn btn--secondary btn--sm">
            {t('writeArticle')}
          </Link>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() =>
              downloadExport(
                '/api/exports/tipsters/picks',
                'xlsx',
                'my-picks.xlsx',
              ).catch((e) =>
                alert(e instanceof Error ? e.message : t('exportFailed')),
              )
            }
          >
            {t('exportPicks')}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() =>
              downloadExport(
                '/api/exports/tipsters/earnings',
                'xlsx',
                'my-earnings.xlsx',
              ).catch((e) =>
                alert(e instanceof Error ? e.message : t('exportFailed')),
              )
            }
          >
            {t('exportEarnings')}
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: '2rem' }}>{t('submitPick')}</h2>
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
            {t('finishOnboarding', {
              completed: onboarding.completedSteps,
              total: onboarding.totalSteps,
            })}
          </p>
          <Link href="/onboarding" style={{ color: 'var(--accent)' }}>
            {t('completeOnboarding')}
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
            aria-label={t('filterBySport')}
            style={{ ...formStyles.input, flex: '1 1 140px' }}
            value={fSport}
            onChange={(e) => {
              setFSport(e.target.value);
              setFLeague('');
            }}
          >
            <option value="">{t('allSports')}</option>
            {filters.sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label={t('filterByLeague')}
            style={{ ...formStyles.input, flex: '1 1 140px' }}
            value={fLeague}
            onChange={(e) => setFLeague(e.target.value)}
            disabled={!fSport || !(filters.leagues[fSport]?.length)}
          >
            <option value="">{t('allLeagues')}</option>
            {(filters.leagues[fSport] ?? []).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <input
          style={formStyles.input}
          placeholder={t('searchTeams')}
          value={fQuery}
          onChange={(e) => setFQuery(e.target.value)}
        />

        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {t('event')}
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.eventId}
            onChange={(e) => selectEvent(e.target.value)}
          >
            <option value="">
              {events.length ? t('selectEvent') : t('noMatchingEvents')}
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.home} vs {ev.away} — {new Date(ev.startTime).toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {t('market')}
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.market}
            onChange={(e) => selectMarket(e.target.value)}
          >
            {MARKETS.map((m) => (
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
              {t('selection')}
              {oddsLoading ? (
                <span style={{ marginLeft: '0.5rem' }}>{t('loadingOdds')}</span>
              ) : null}
              {hasLiveOdds ? (
                <select
                  style={{ ...formStyles.input, marginTop: '0.35rem' }}
                  value={form.selection}
                  onChange={(e) => selectSelection(e.target.value)}
                  required
                >
                  <option value="">{t('chooseLine')}</option>
                  {Object.entries(prices!).map(([sel, price]) => (
                    <option key={sel} value={sel}>
                      {sel} @ {price.toFixed(2)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={{ ...formStyles.input, marginTop: '0.35rem' }}
                  placeholder={
                    SELECTION_HINT_KEYS[form.market]
                      ? t(SELECTION_HINT_KEYS[form.market])
                      : t('selectionFallback')
                  }
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
          {t('odds')}{' '}
          {eventOdds && eventOdds.length > 0 ? (
            <span style={{ fontSize: '0.8rem' }}>
              {t('oddsAutofilled')}
            </span>
          ) : null}
          <input
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            type="number"
            step="0.01"
            min="1.01"
            placeholder={t('odds')}
            value={form.oddsAtPick}
            onChange={(e) => setForm({ ...form, oddsAtPick: e.target.value })}
            required
          />
        </label>
        {(() => {
          const market = eventOdds?.find((m) => m.market === form.market);
          const offers = (market?.offers ?? []).filter(
            (o) => !form.selection || o.selection === form.selection,
          );
          if (offers.length === 0) return null;
          const sorted = [...offers].sort((a, b) => b.price - a.price);
          const best = sorted[0].price;
          return (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--muted)',
                border: '1px solid var(--border, #262a38)',
                borderRadius: 8,
                padding: '0.5rem 0.6rem',
              }}
            >
              <div style={{ marginBottom: '0.3rem' }}>
                {t('compareBooks')}{form.selection ? ` · ${form.selection}` : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {sorted.slice(0, 8).map((o, i) => (
                  <button
                    key={`${o.bookmaker}-${o.selection}-${i}`}
                    type="button"
                    title={t('useBookPrice', { price: o.price.toFixed(2), book: o.bookmakerTitle ?? o.bookmaker })}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        selection: o.selection,
                        oddsAtPick: String(o.price),
                      }))
                    }
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: 'var(--chip, #1b1f2b)',
                      border:
                        o.price === best
                          ? '1px solid var(--success, #46a758)'
                          : '1px solid var(--border, #33384a)',
                      color: 'inherit',
                    }}
                  >
                    {o.bookmakerTitle ?? o.bookmaker}{' '}
                    <strong style={{ color: o.price === best ? 'var(--success, #46a758)' : 'inherit' }}>
                      {o.price.toFixed(2)}
                    </strong>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <input
          style={formStyles.input}
          type="number"
          step="0.1"
          min="0.1"
          placeholder={t('stakeUnits')}
          value={form.stakeUnits}
          onChange={(e) => setForm({ ...form, stakeUnits: e.target.value })}
          required
        />
        <fieldset
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            margin: 0,
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <legend style={{ padding: '0 0.35rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            {t('pickType')}
          </legend>
          {(
            [
              { key: 'pre_match', label: t('preMatch'), hint: t('preMatchHint') },
              { key: 'live', label: t('liveInPlay'), hint: t('liveHint') },
            ] as const
          ).map((opt) => (
            <label
              key={opt.key}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="pickType"
                value={opt.key}
                checked={form.pickType === opt.key}
                onChange={() => setForm({ ...form, pickType: opt.key })}
              />
              <span>
                {opt.label}
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}> · {opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {form.pickType === 'live' ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: 0 }}>
            {t('liveNote')}
          </p>
        ) : null}
        <textarea
          style={{ ...formStyles.input, minHeight: 72, resize: 'vertical' }}
          placeholder={t('notePlaceholder')}
          value={form.note}
          maxLength={280}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        {msg ? <p style={{ color: 'var(--accent)', margin: 0 }}>{msg}</p> : null}
        <button className="btn btn--primary" disabled={submitting}>
          {submitting ? t('locking') : t('lockPick')}
        </button>
      </form>
      )}

      <PerformanceDashboardView data={performance} />

      <section id="earnings" style={{ marginTop: '2.5rem', scrollMarginTop: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem' }}>{t('earningsTitle')}</h2>
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
                  label: t('availableNow'),
                  value: money(earnings.availableCents),
                  hint: t('readyToWithdraw'),
                },
                {
                  label: t('projectedCycle'),
                  value: money(earnings.projected.netCents),
                  hint: t('afterFee', { fee: Math.round(earnings.feeRate * 100) }),
                },
                { label: t('paidOut'), value: money(earnings.paidCents) },
                { label: t('pending'), value: money(earnings.pendingCents) },
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
              {t.rich('payoutsInfo', {
                b: (chunks) => <strong>{chunks}</strong>,
              })}{' '}
              <Link href="/earnings" style={{ color: 'var(--accent)' }}>
                {t('fullPayoutHistory')}
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
                {payoutBusy ? t('requesting') : t('requestPayout')}
              </button>
              {earnings.awaitingApproval ? (
                <span style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
                  {t('awaitingApproval')}
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
          <p style={{ color: 'var(--muted)' }}>{t('loadingEarnings')}</p>
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
          { key: 'open', label: t('tabOpen'), count: openCount },
          { key: 'settled', label: t('tabSettled'), count: settledList.length },
          { key: 'all', label: t('tabAll'), count: myTips.length },
        ];
        const subTabs: { key: SettledOutcome; label: string; count: number }[] =
          [
            { key: 'all', label: t('tabAll'), count: settledList.length },
            { key: 'won', label: t('outcomeWon'), count: wonCount },
            { key: 'lost', label: t('outcomeLost'), count: lostCount },
            { key: 'void', label: t('outcomeVoid'), count: voidCount },
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
              <h2 style={{ margin: 0 }}>{t('myTips')}</h2>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {mainTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setTipsFilter(tab.key)}
                    style={pillStyle(tipsFilter === tab.key)}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {tipsFilter === 'settled' ? (
              <div
                style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}
              >
                {subTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSettledOutcome(tab.key)}
                    style={pillStyle(settledOutcome === tab.key, true)}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            ) : null}

            {rows.length === 0 ? (
              <p style={{ color: 'var(--muted)', marginTop: '1rem' }}>
                {tipsFilter === 'open'
                  ? t('noOpenTips')
                  : tipsFilter === 'settled'
                    ? t('noSettledTips')
                    : t('noTipsYet')}
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
                    <th style={{ padding: '0.5rem 0' }}>{t('thMatch')}</th>
                    <th>{t('thSelection')}</th>
                    <th>{t('thMarket')}</th>
                    <th>{t('thOdds')}</th>
                    <th>CLV</th>
                    <th>{t('thStatus')}</th>
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
                      title={t('viewTipDetails')}
                      style={{
                        borderTop: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '0.5rem 0', color: 'var(--muted)' }}>
                        {p.event ? `${p.event.home} v ${p.event.away}` : '—'}
                      </td>
                      <td>
                        {p.selection}
                        {p.pickType === 'live' ? (
                          <span
                            title={t('liveBadgeTitle')}
                            style={{
                              marginLeft: '0.4rem',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'var(--danger)',
                              border: '1px solid var(--danger)',
                            }}
                          >
                            ● {t('statusLive')}
                          </span>
                        ) : null}
                      </td>
                      <td>{p.market}</td>
                      <td>{p.oddsAtPick.toFixed(2)}</td>
                      <td>
                        {p.clv != null ? `${(p.clv * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td>{formatTipStatus(p.status, (k) => t(k))}</td>
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
function formatTipStatus(status: string, tr: (key: string) => string): string {
  if (status === 'pending') return tr('statusOpen');
  if (status === 'half_won') return tr('halfWon');
  if (status === 'half_lost') return tr('halfLost');
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
  const t = useTranslations('tipsterDashboard');
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
    [t('thMatch'), pick.event ? `${pick.event.home} v ${pick.event.away}` : '—'],
    [t('detailSport'), pick.event?.sport ?? '—'],
    [t('detailKickoff'), pick.event ? fmt(pick.event.startTime) : '—'],
    [t('thSelection'), pick.selection],
    [t('thMarket'), pick.market],
    [t('thOdds'), pick.oddsAtPick.toFixed(2)],
    [t('detailStake'), t('unitsValue', { count: pick.stakeUnits })],
    [t('thStatus'), formatTipStatus(pick.status, (k) => t(k))],
    ['CLV', pick.clv != null ? `${(pick.clv * 100).toFixed(1)}%` : '—'],
    [t('detailResult'), pick.result ?? '—'],
    [
      t('detailLocked'),
      `${fmt(pick.lockedAt)}${beforeKickoff ? ` · ${t('beforeKickoff')}` : ''}`,
    ],
    [t('detailSettled'), fmt(pick.settledAt)],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('tipDetails')}
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
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('tipDetails')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
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
              {t('note')}
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{pick.note}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
