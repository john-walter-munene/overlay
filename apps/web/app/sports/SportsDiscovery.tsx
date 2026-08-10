'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  buildEventsQuery,
  discoverEvents,
  getEventDetail,
  getEventMarkets,
  listProviderSports,
  sportGroups,
  type EventDetail,
  type EventStatusFilter,
  type EventSummary,
  type MarketInfo,
  type MarketOdds,
  type ProviderSport,
} from '../../lib/events';
import { sportIcon } from '../SportChips';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const PAGE_SIZE = 20;
const STATUS_VALUES: EventStatusFilter[] = ['upcoming', 'live', 'completed', 'all'];

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem',
  borderRadius: 8,
  border: '1px solid var(--border, #33384a)',
  background: 'var(--card, #12141c)',
  color: 'inherit',
  fontSize: '0.9rem',
};

function startLabel(iso: string): string {
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

function relTime(iso: string | null | undefined, t: Translate): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return t('minutesAgo', { mins });
  const hrs = Math.round(mins / 60);
  return t('hoursAgo', { hrs });
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const ms = Date.parse(iso);
  return !Number.isFinite(ms) || Date.now() - ms > 120_000;
}

function StatusBadge({ status }: { status: EventSummary['status'] }) {
  const t = useTranslations('sports');
  const map: Record<EventSummary['status'], { label: string; color: string }> = {
    upcoming: { label: t('badge_upcoming'), color: 'var(--muted, #8b90a0)' },
    live: { label: t('badge_live'), color: 'var(--danger, #e5484d)' },
    completed: { label: t('badge_completed'), color: 'var(--success, #46a758)' },
  };
  const s = map[status];
  return (
    <span style={{ color: s.color, fontWeight: 700, fontSize: '0.75rem' }}>{s.label}</span>
  );
}

/** Best price per selection + collapsible bookmaker comparison for one market. */
function MarketRow({ market }: { market: MarketOdds }) {
  const t = useTranslations('sports');
  const [open, setOpen] = useState(false);
  const selections = Object.entries(market.prices);
  const bookmakers = new Set((market.offers ?? []).map((o) => o.bookmaker));
  return (
    <div style={{ borderTop: '1px solid var(--border, #262a38)', padding: '0.6rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.9rem' }}>{market.market}</strong>
        {bookmakers.size > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #6e8bff)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
            aria-expanded={open}
          >
            {open ? t('hideBooks') : t('compareBooks', { count: bookmakers.size })}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
        {selections.map(([sel, price]) => (
          <span
            key={sel}
            style={{
              padding: '0.3rem 0.55rem',
              borderRadius: 8,
              background: 'var(--chip, #1b1f2b)',
              fontSize: '0.85rem',
            }}
          >
            {sel} <strong style={{ color: 'var(--accent, #6e8bff)' }}>{price.toFixed(2)}</strong>
          </span>
        ))}
      </div>
      {open && (
        <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--muted, #8b90a0)', textAlign: 'left' }}>
              <th style={{ padding: '0.2rem 0' }}>{t('colBook')}</th>
              <th>{t('colSelection')}</th>
              <th>{t('colPrice')}</th>
              <th>{t('colUpdated')}</th>
            </tr>
          </thead>
          <tbody>
            {(market.offers ?? [])
              .slice()
              .sort((a, b) => b.price - a.price)
              .map((o, i) => (
                <tr key={`${o.bookmaker}-${o.selection}-${i}`}>
                  <td style={{ padding: '0.2rem 0' }}>{o.bookmakerTitle ?? o.bookmaker}</td>
                  <td>{o.selection}</td>
                  <td style={{ fontWeight: 700 }}>{o.price.toFixed(2)}</td>
                  <td style={{ color: isStale(o.updatedAt) ? 'var(--danger, #e5484d)' : 'var(--muted, #8b90a0)' }}>
                    {relTime(o.updatedAt, t) ?? t('dash')}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Expanded detail for one event: featured odds + full market inventory. */
function EventDetailPanel({ id }: { id: string }) {
  const t = useTranslations('sports');
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [markets, setMarkets] = useState<MarketInfo[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getEventDetail(id), getEventMarkets(id)]).then(([d, m]) => {
      if (!alive) return;
      setDetail(d);
      setMarkets(m);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) return <p style={{ color: 'var(--muted, #8b90a0)', padding: '0.6rem 0' }}>{t('loadingOdds')}</p>;

  const pickable = (markets ?? []).filter((m) => m.pickable);
  const viewOnly = (markets ?? []).filter((m) => !m.pickable);

  return (
    <div style={{ padding: '0.4rem 0 0.8rem' }}>
      {detail && detail.markets.length > 0 ? (
        detail.markets.map((m) => <MarketRow key={m.market} market={m} />)
      ) : (
        <p style={{ color: 'var(--muted, #8b90a0)' }}>{t('noFeaturedOdds')}</p>
      )}

      {markets && markets.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted, #8b90a0)', marginBottom: '0.3rem' }}>
            {t('marketsOnOffer')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {pickable.map((m) => (
              <span
                key={m.key}
                title={t('bookCount', { count: m.bookmakers.length })}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  background: 'var(--chip, #1b1f2b)',
                  border: '1px solid var(--accent, #6e8bff)',
                }}
              >
                {m.label}
              </span>
            ))}
            {viewOnly.map((m) => (
              <span
                key={m.key}
                title={t('viewOnlyTitle')}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  background: 'var(--chip, #1b1f2b)',
                  color: 'var(--muted, #8b90a0)',
                }}
              >
                {m.label}{t('viewOnlySuffix')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SportsDiscovery({ showTitle = true }: { showTitle?: boolean }) {
  const t = useTranslations('sports');
  const [catalog, setCatalog] = useState<ProviderSport[]>([]);
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState<EventStatusFilter>('upcoming');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [offset, setOffset] = useState(0);

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listProviderSports().then(setCatalog);
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setOffset(0);
  }, [group, status, debouncedQ]);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await discoverEvents({
      group: group || undefined,
      status,
      q: debouncedQ || undefined,
      limit: PAGE_SIZE,
      offset,
    });
    setEvents(page.events);
    setTotal(page.total);
    setLoading(false);
  }, [group, status, debouncedQ, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => sportGroups(catalog), [catalog]);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {showTitle ? (
        <>
          <h1 style={{ marginBottom: '0.25rem' }}>{t('title')}</h1>
          <p style={{ color: 'var(--muted, #8b90a0)', marginTop: 0 }}>
            {t('intro')}
          </p>
        </>
      ) : null}

      <div style={{ margin: '1.25rem 0' }}>
        <div className="sport-chips" role="group" aria-label={t('filterBySport')}>
          <button
            type="button"
            className={`sport-chip${!group ? ' is-active' : ''}`}
            aria-pressed={!group}
            onClick={() => setGroup('')}
          >
            <span className="sport-chip__icon" aria-hidden>
              🏅
            </span>
            <span>{t('allSports')}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`sport-chip${group === g ? ' is-active' : ''}`}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              <span className="sport-chip__icon" aria-hidden>
                {sportIcon(g)}
              </span>
              <span>{g}</span>
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            marginTop: '0.65rem',
            alignItems: 'center',
          }}
        >
          <div role="tablist" aria-label={t('statusAria')} style={{ display: 'flex', gap: '0.25rem' }}>
            {STATUS_VALUES.map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={status === value}
                onClick={() => setStatus(value)}
                style={{
                  padding: '0.45rem 0.7rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: status === value ? 'var(--accent)' : 'transparent',
                  color: status === value ? 'var(--on-accent)' : 'inherit',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {t(`status_${value}`)}
              </button>
            ))}
          </div>

          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 180px', minWidth: 160 }}
            aria-label={t('searchAria')}
          />
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted, #8b90a0)' }}>{t('loadingEvents')}</p>
      ) : events.length === 0 ? (
        <p style={{ color: 'var(--muted, #8b90a0)' }}>
          {t('noEvents')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {events.map((ev) => {
            const open = expanded === ev.id;
            return (
              <li
                key={ev.id}
                style={{
                  border: '1px solid var(--border, #262a38)',
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  background: 'var(--card, #12141c)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : ev.id)}
                  aria-expanded={open}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {ev.home} <span style={{ color: 'var(--muted, #8b90a0)' }}>{t('versus')}</span> {ev.away}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted, #8b90a0)', marginTop: '0.2rem' }}>
                      {[ev.sportGroup, ev.league].filter(Boolean).join(' · ') || ev.sport}
                      {' · '}
                      {startLabel(ev.startTime)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={ev.status} />
                    {ev.score && (
                      <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>
                        {ev.score.home}–{ev.score.away}
                      </div>
                    )}
                  </div>
                </button>
                {open && <EventDetailPanel id={ev.id} />}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            style={{ ...inputStyle, cursor: offset === 0 ? 'default' : 'pointer', opacity: offset === 0 ? 0.5 : 1 }}
          >
            {t('prev')}
          </button>
          <span style={{ color: 'var(--muted, #8b90a0)', fontSize: '0.85rem' }}>
            {t('pageOf', { page, pages })}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={page >= pages}
            style={{ ...inputStyle, cursor: page >= pages ? 'default' : 'pointer', opacity: page >= pages ? 0.5 : 1 }}
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
