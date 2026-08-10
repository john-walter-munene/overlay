import { Injectable } from '@nestjs/common';
import type {
  EventResult,
  MarketOdds,
  ProviderEvent,
  ProviderMarketInfo,
  ProviderSport,
  SportsDataProvider,
} from './sports-provider.interface';
import { fetchJson } from './http';
import { parseSportsConfig } from './sports-config';
import {
  mapEvents,
  mapEventOdds,
  mapMarketInventory,
  mapOdds,
  scoreStateOf,
  toEventResult,
  type OddsApiEvent,
  type OddsApiEventMarkets,
  type OddsApiEventOdds,
  type OddsApiScoreEvent,
} from './the-odds-api.mapper';

/**
 * The Odds API adapter — primary source for pre-match + closing odds.
 * https://the-odds-api.com/ (v4). Response shaping lives in the pure mapper so
 * it can be unit-tested without the network or framework.
 *
 * The Odds API's odds/scores endpoints are keyed by `sport` (e.g. 'soccer_epl'),
 * not by event id, so we encode the vendor id as "<sport>:<eventId>".
 */
@Injectable()
export class TheOddsApiProvider implements SportsDataProvider {
  readonly name = 'the-odds-api';
  private readonly base = 'https://api.the-odds-api.com/v4';

  private get config() {
    return parseSportsConfig(process.env);
  }

  private get apiKey(): string {
    const key = process.env.SPORTS_API_KEY;
    if (!key) throw new Error('SPORTS_API_KEY is not set');
    return key;
  }

  async getSports(): Promise<ProviderSport[]> {
    const url = `${this.base}/sports?apiKey=${this.apiKey}`;
    const raw = await fetchJson<{ key: string; group: string; title: string; description?: string; active: boolean; has_outrights: boolean }[]>(url, undefined, { label: this.name });
    return raw.map((sport) => ({ ...sport, hasOutrights: sport.has_outrights }));
  }

  async getUpcomingEvents(sport: string): Promise<ProviderEvent[]> {
    const url = `${this.base}/sports/${sport}/events?apiKey=${this.apiKey}`;
    const raw = await fetchJson<OddsApiEvent[]>(url, undefined, {
      label: this.name,
    });
    // Encode sport into the id so later odds/scores lookups can route.
    return mapEvents(raw).map((e) => ({
      ...e,
      vendorEventId: `${sport}:${e.vendorEventId}`,
    }));
  }

  async getOdds(vendorEventId: string): Promise<MarketOdds[]> {
    const { sport, eventId } = this.splitId(vendorEventId);
    // Featured markets across the configured region(s). Credit cost = regions ×
    // markets; both are validated/clamped by parseSportsConfig (defaults: eu ×
    // h2h,spreads,totals = 3).
    const { regions, markets, eventMarkets } = this.config;
    const url = `${this.base}/sports/${sport}/odds?apiKey=${this.apiKey}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;
    const raw = await fetchJson<OddsApiEventOdds[]>(url, undefined, {
      label: this.name,
    });
    const event = raw.find((e) => e.id === eventId);
    let out = event ? mapOdds(event) : [];

    // Extra gradeable markets (BTTS, draw-no-bet, team totals) live on the
    // per-event odds endpoint, not the bulk call. Opt-in via SPORTS_EVENT_MARKETS
    // (paid tier); non-fatal so a failure never drops the featured odds.
    if (eventMarkets) {
      try {
        const evUrl = `${this.base}/sports/${sport}/events/${eventId}/odds?apiKey=${this.apiKey}&regions=${regions}&markets=${eventMarkets}&oddsFormat=decimal`;
        const ev = await fetchJson<OddsApiEventOdds>(evUrl, undefined, {
          label: this.name,
        });
        out = [...out, ...mapEventOdds(ev)];
      } catch {
        // Extended markets are best-effort; featured odds still returned.
      }
    }
    return out;
  }

  async getResult(vendorEventId: string): Promise<EventResult | null> {
    const { sport, eventId } = this.splitId(vendorEventId);
    // Completed games require daysFrom (credit cost 2) — they aren't returned
    // by the live/upcoming-only scores query.
    const url = `${this.base}/sports/${sport}/scores?apiKey=${this.apiKey}&daysFrom=${this.config.scoresDaysFrom}`;
    const raw = await fetchJson<OddsApiScoreEvent[]>(url, undefined, {
      label: this.name,
    });
    const event = raw.find((e) => e.id === eventId);
    if (!event || !event.completed) return null;
    return toEventResult(event);
  }

  async getLiveScore(
    vendorEventId: string,
  ): Promise<{ home: number; away: number } | null> {
    const { sport, eventId } = this.splitId(vendorEventId);
    // In-play gating only needs live/upcoming games, so omit daysFrom — that
    // keeps the credit cost at 1 (daysFrom would double it to 2). A just-
    // finished game simply won't appear here and is settled via getResult().
    const url = `${this.base}/sports/${sport}/scores?apiKey=${this.apiKey}`;
    const raw = await fetchJson<OddsApiScoreEvent[]>(url, undefined, {
      label: this.name,
    });
    const event = raw.find((e) => e.id === eventId);
    if (!event) return null;
    return scoreStateOf(event).score;
  }

  async getMarketInventory(vendorEventId: string): Promise<ProviderMarketInfo[]> {
    const { sport, eventId } = this.splitId(vendorEventId);
    // Available markets per bookmaker for one event (costs 1 credit). Featured +
    // props + period + alternate keys, classified by the shared registry.
    const url = `${this.base}/sports/${sport}/events/${eventId}/markets?apiKey=${this.apiKey}&regions=${this.config.regions}`;
    const raw = await fetchJson<OddsApiEventMarkets>(url, undefined, {
      label: this.name,
    });
    return mapMarketInventory(raw);
  }

  private splitId(vendorEventId: string): { sport: string; eventId: string } {
    const idx = vendorEventId.indexOf(':');
    if (idx === -1) {
      throw new Error(
        `Expected "<sport>:<eventId>" for the-odds-api, got "${vendorEventId}"`,
      );
    }
    return {
      sport: vendorEventId.slice(0, idx),
      eventId: vendorEventId.slice(idx + 1),
    };
  }
}
