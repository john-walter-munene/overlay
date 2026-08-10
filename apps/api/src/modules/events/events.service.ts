import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { SPORTS_PROVIDER } from '../../integrations/sports/sports.module';
import type {
  MarketOdds,
  ProviderMarketInfo,
  ProviderSport,
  SportsDataProvider,
} from '../../integrations/sports/sports-provider.interface';
import { isValidProviderEvent, isIngestAll, resolveIngestSports } from './ingestion';
import {
  normalizeEventQuery,
  resolveSportKeysForGroup,
  sportGroupIndex,
  toEventSummary,
  type EventSummary,
  type RawEventQuery,
} from './events.query';

@Injectable()
export class EventsService {
  private readonly log = new Logger(EventsService.name);
  /** In-process odds cache to limit vendor credit spend (OB-045). */
  private static readonly CACHE_TTL_MS = 60_000;
  private readonly oddsCache = new Map<string, { odds: MarketOdds[]; at: number }>();
  private readonly inventoryCache = new Map<string, { markets: ProviderMarketInfo[]; at: number }>();
  private sportsCache: { sports: ProviderSport[]; at: number } | null = null;
  private static readonly SPORTS_CACHE_TTL_MS = 15 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SPORTS_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  /**
   * Pull upcoming fixtures from the active provider and upsert them by
   * vendorEventId. Called by the ingest-events worker or an admin endpoint.
   * Malformed vendor rows (missing ids/teams/start time) are skipped so a
   * partial upstream response can't corrupt the fixtures table.
   */
  async ingest(sport: string): Promise<number> {
    const events = await this.provider.getUpcomingEvents(sport);
    const valid = events.filter(isValidProviderEvent);
    const skipped = events.length - valid.length;
    if (skipped > 0) {
      this.log.warn(`Ingest ${sport}: skipped ${skipped} invalid event(s)`);
    }
    for (const e of valid) {
      await this.prisma.event.upsert({
        where: { vendorEventId: e.vendorEventId },
        create: {
          vendorEventId: e.vendorEventId,
          sport: e.sport,
          league: e.league,
          home: e.home,
          away: e.away,
          startTime: e.startTime,
        },
        update: { startTime: e.startTime, status: 'scheduled' },
      });
    }
    return valid.length;
  }

  /**
   * Ingest the configured sports. `INGEST_SPORTS` accepts an explicit
   * comma-separated list, or `all`/`*` to ingest every in-season sport from the
   * provider catalog (fixtures are quota-free, so this costs no vendor
   * credits). Outright/futures sports are excluded unless
   * `INGEST_INCLUDE_OUTRIGHTS=true`. Per-sport failures are isolated so one bad
   * vendor call doesn't abort the rest. Returns a per-sport summary.
   */
  async ingestConfigured(): Promise<
    { sport: string; ingested?: number; error?: string }[]
  > {
    const raw = process.env.INGEST_SPORTS;
    const catalog =
      isIngestAll(raw) && this.provider.getSports
        ? await this.provider.getSports()
        : [];
    const sports = resolveIngestSports(raw, catalog, {
      includeOutrights: process.env.INGEST_INCLUDE_OUTRIGHTS === 'true',
    });
    if (isIngestAll(raw)) {
      this.log.log(`Ingest ALL: ${sports.length} in-season sport(s) from catalog`);
    }
    return this.ingestMany(sports);
  }

  /**
   * Ingest fixtures for EVERY in-season sport from the provider catalog,
   * regardless of `INGEST_SPORTS` — for the admin "ingest all now" action.
   * Fixtures (`/events`) are quota-free, so this costs no vendor credits.
   */
  async ingestAll(
    includeOutrights = process.env.INGEST_INCLUDE_OUTRIGHTS === 'true',
  ): Promise<{ sports: number; ingested: number; errors: number }> {
    const catalog = this.provider.getSports ? await this.provider.getSports() : [];
    const sports = resolveIngestSports('all', catalog, { includeOutrights });
    const summary = await this.ingestMany(sports);
    return {
      sports: summary.length,
      ingested: summary.reduce((n, s) => n + (s.ingested ?? 0), 0),
      errors: summary.filter((s) => s.error).length,
    };
  }

  /** Ingest a list of sport keys, isolating per-sport failures. */
  private async ingestMany(
    sports: string[],
  ): Promise<{ sport: string; ingested?: number; error?: string }[]> {
    const results: { sport: string; ingested?: number; error?: string }[] = [];
    for (const sport of sports) {
      try {
        const ingested = await this.ingest(sport);
        results.push({ sport, ingested });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.log.error(`Ingest ${sport} failed: ${error}`);
        results.push({ sport, error });
      }
    }
    return results;
  }

  /** Upcoming events available for tipsters to pick, with optional filters. */
  listUpcoming(
    opts: { sport?: string; league?: string; q?: string; limit?: number } = {},
  ) {
    const where: Prisma.EventWhereInput = {
      startTime: { gt: new Date() },
      status: 'scheduled',
    };
    if (opts.sport) where.sport = opts.sport;
    if (opts.league) where.league = opts.league;
    const q = opts.q?.trim();
    if (q) {
      where.OR = [
        { home: { contains: q, mode: 'insensitive' } },
        { away: { contains: q, mode: 'insensitive' } },
        { league: { contains: q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.event.findMany({
      where,
      orderBy: { startTime: 'asc' },
      take: Math.min(opts.limit ?? 100, 200),
    });
  }

  /**
   * Fixtures that have picks on them (OB-161), ranked by how many tipsters are
   * on the match — the event-centric discovery surface ("N picks on this
   * match"). DB-only / quota-free. Defaults to upcoming fixtures; `status=live`
   * switches to in-play. Counts every pick (pending + settled); the distinct
   * tipster count is derived from (event, tipster) pairs so it never loads the
   * full pick rows.
   */
  async listFixturesWithPicks(
    opts: { sport?: string; status?: string; limit?: number } = {},
  ) {
    const limit = Math.min(opts.limit ?? 30, 100);
    const now = new Date();
    const eventWhere: Prisma.EventWhereInput = {};
    if (opts.status === 'live') {
      eventWhere.status = { not: 'finished' };
      eventWhere.startTime = { lte: now };
    } else if (opts.status !== 'all') {
      eventWhere.status = 'scheduled';
      eventWhere.startTime = { gt: now };
    }
    if (opts.sport) eventWhere.sport = opts.sport;

    const pickWhere: Prisma.PickWhereInput = {
      event: eventWhere,
      tipster: { status: 'active' },
    };

    const [totals, pairs] = await Promise.all([
      this.prisma.pick.groupBy({
        by: ['eventId'],
        where: pickWhere,
        _count: { _all: true },
      }),
      this.prisma.pick.groupBy({
        by: ['eventId', 'tipsterId'],
        where: pickWhere,
      }),
    ]);

    const pickCountByEvent = new Map(
      totals.map((t) => [t.eventId, t._count._all]),
    );
    const tipsterCountByEvent = new Map<string, number>();
    for (const p of pairs) {
      tipsterCountByEvent.set(
        p.eventId,
        (tipsterCountByEvent.get(p.eventId) ?? 0) + 1,
      );
    }

    // Most-backed fixtures first; fetch details only for the top slice.
    const topIds = [...pickCountByEvent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    if (topIds.length === 0) return { fixtures: [] };

    const events = await this.prisma.event.findMany({
      where: { id: { in: topIds } },
    });
    const fixtures = events
      .map((e) => ({
        id: e.id,
        sport: e.sport,
        league: e.league,
        home: e.home,
        away: e.away,
        startTime: e.startTime.toISOString(),
        status: e.status,
        liveHomeScore: e.liveHomeScore,
        liveAwayScore: e.liveAwayScore,
        pickCount: pickCountByEvent.get(e.id) ?? 0,
        tipsterCount: tipsterCountByEvent.get(e.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.pickCount - a.pickCount ||
          Date.parse(a.startTime) - Date.parse(b.startTime),
      );
    return { fixtures };
  }

  /**
   * The tipsters with picks on a single fixture (OB-161). Selections are never
   * exposed here — gated live picks stay private; this is a discovery surface
   * that points bettors to the verified tipsters active on the match. Suspended
   * tipsters are excluded. Ordered by pick count then verified yield.
   */
  async getFixturePicksSummary(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    const grouped = await this.prisma.pick.groupBy({
      by: ['tipsterId'],
      where: { eventId, tipster: { status: 'active' } },
      _count: { _all: true },
    });
    const countById = new Map(grouped.map((g) => [g.tipsterId, g._count._all]));

    const tipsters = grouped.length
      ? await this.prisma.tipster.findMany({
          where: { userId: { in: grouped.map((g) => g.tipsterId) } },
          select: {
            userId: true,
            displayName: true,
            country: true,
            identityVerified: true,
            user: { select: { username: true, avatarUrl: true } },
            stats: { select: { yield: true, clvAvg: true, sampleSize: true } },
          },
        })
      : [];

    const list = tipsters
      .map((t) => ({
        tipsterId: t.userId,
        name: t.displayName ?? t.user?.username ?? t.userId,
        avatarUrl: t.user?.avatarUrl ?? null,
        country: t.country,
        verified: t.identityVerified,
        yield: t.stats?.yield ?? null,
        clvAvg: t.stats?.clvAvg ?? null,
        sampleSize: t.stats?.sampleSize ?? null,
        pickCount: countById.get(t.userId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.pickCount - a.pickCount || (b.yield ?? -1e9) - (a.yield ?? -1e9),
      );

    return {
      event: {
        id: event.id,
        sport: event.sport,
        league: event.league,
        home: event.home,
        away: event.away,
        startTime: event.startTime.toISOString(),
        status: event.status,
        liveHomeScore: event.liveHomeScore,
        liveAwayScore: event.liveAwayScore,
      },
      tipsters: list,
      pickCount: list.reduce((sum, t) => sum + t.pickCount, 0),
      tipsterCount: list.length,
    };
  }

  /** Distinct sports + leagues across upcoming events, for the pick filters. */
  async filters(): Promise<{ sports: string[]; leagues: Record<string, string[]> }> {
    const rows = await this.prisma.event.findMany({
      where: { startTime: { gt: new Date() }, status: 'scheduled' },
      select: { sport: true, league: true },
    });
    const sports = [...new Set(rows.map((r) => r.sport))].sort();
    const leagues: Record<string, string[]> = {};
    for (const r of rows) {
      if (!r.league) continue;
      (leagues[r.sport] ??= []).push(r.league);
    }
    for (const s of Object.keys(leagues)) {
      leagues[s] = [...new Set(leagues[s])].sort();
    }
    return { sports, leagues };
  }

  /**
   * Live markets/odds for one event (OB-045), for the odds-driven pick form.
   * Cached in-process for CACHE_TTL to avoid burning vendor credits on repeated
   * lookups while a tipster browses.
   */
  async getEventOdds(eventId: string): Promise<MarketOdds[]> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const cached = this.oddsCache.get(eventId);
    if (cached && Date.now() - cached.at < EventsService.CACHE_TTL_MS) {
      return cached.odds;
    }
    const odds = await this.provider.getOdds(event.vendorEventId);
    this.oddsCache.set(eventId, { odds, at: Date.now() });
    return odds;
  }

  async providerSports(): Promise<ProviderSport[]> {
    if (this.sportsCache && Date.now() - this.sportsCache.at < EventsService.SPORTS_CACHE_TTL_MS) return this.sportsCache.sports;
    const sports = this.provider.getSports ? await this.provider.getSports() : [];
    this.sportsCache = { sports, at: Date.now() };
    return sports;
  }

  /**
   * Bettor-facing event discovery (Phase 3). DB-only (no vendor calls, so it is
   * quota-free and paginatable) with generic multi-sport filtering: a `group`
   * filter is resolved to concrete sport keys via the cached provider catalog,
   * so it becomes an indexed `sport IN (...)` predicate. Odds/bookmaker
   * comparison is deliberately NOT here — it is an on-demand, per-event detail
   * call ({@link getEventDetail}) to keep vendor credit spend bounded.
   */
  async listEvents(
    raw: RawEventQuery,
  ): Promise<{ events: EventSummary[]; total: number; limit: number; offset: number }> {
    const q = normalizeEventQuery(raw);
    const now = Date.now();
    const nowDate = new Date(now);

    const where: Prisma.EventWhereInput = {};

    // Lifecycle status → persisted predicates.
    if (q.status === 'upcoming') {
      where.status = 'scheduled';
      where.startTime = { gt: nowDate };
    } else if (q.status === 'live') {
      where.status = { not: 'finished' };
      where.startTime = { lte: nowDate };
    } else if (q.status === 'completed') {
      where.status = 'finished';
    }

    // Commence-time window (merged with any status-derived startTime bound).
    if (q.startFrom || q.startTo) {
      where.startTime = {
        ...(typeof where.startTime === 'object' ? where.startTime : {}),
        ...(q.startFrom ? { gte: q.startFrom } : {}),
        ...(q.startTo ? { lte: q.startTo } : {}),
      };
    }

    // Sport / group. `group` wins and expands to its sport keys via the catalog.
    const catalog = await this.providerSports();
    if (q.group) {
      const keys = resolveSportKeysForGroup(q.group, catalog);
      where.sport = { in: keys };
    } else if (q.sport) {
      where.sport = q.sport;
    }
    if (q.league) where.league = q.league;

    if (q.q) {
      where.OR = [
        { home: { contains: q.q, mode: 'insensitive' } },
        { away: { contains: q.q, mode: 'insensitive' } },
        { league: { contains: q.q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startTime: q.status === 'completed' ? 'desc' : 'asc' },
        skip: q.offset,
        take: q.limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    const groups = sportGroupIndex(catalog);
    return {
      events: rows.map((r) => toEventSummary(r, now, groups)),
      total,
      limit: q.limit,
      offset: q.offset,
    };
  }

  /**
   * On-demand bettor-facing event detail (Phase 3): the normalized event
   * summary plus its featured markets (best price + per-bookmaker offers),
   * served from the same in-process odds cache as the pick form to bound vendor
   * credit spend. Optional `bookmaker` / `market` narrow the returned offers.
   */
  async getEventDetail(
    id: string,
    opts: { bookmaker?: string; market?: string } = {},
  ): Promise<{ event: EventSummary; markets: MarketOdds[] }> {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    const catalog = await this.providerSports();
    const summary = toEventSummary(event, Date.now(), sportGroupIndex(catalog));

    let markets = await this.getEventOdds(id);
    if (opts.market) {
      markets = markets.filter((m) => m.market === opts.market);
    }
    if (opts.bookmaker) {
      const book = opts.bookmaker.toLowerCase();
      markets = markets
        .map((m) => ({
          ...m,
          offers: (m.offers ?? []).filter((o) => o.bookmaker.toLowerCase() === book),
        }))
        .filter((m) => (m.offers?.length ?? 0) > 0);
    }
    return { event: summary, markets };
  }

  /**
   * On-demand market inventory for one event (Phase 3): every market on offer
   * (featured + props + period + alternate), classified so the UI can show
   * props read-only and mark which markets are pickable. Costs one vendor
   * credit, so it is cached in-process like the odds lookup. Returns [] when the
   * provider can't list per-event markets.
   */
  async getEventMarketInventory(id: string): Promise<ProviderMarketInfo[]> {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (!this.provider.getMarketInventory) return [];

    const cached = this.inventoryCache.get(id);
    if (cached && Date.now() - cached.at < EventsService.CACHE_TTL_MS) {
      return cached.markets;
    }
    const markets = await this.provider.getMarketInventory(event.vendorEventId);
    this.inventoryCache.set(id, { markets, at: Date.now() });
    return markets;
  }
}
