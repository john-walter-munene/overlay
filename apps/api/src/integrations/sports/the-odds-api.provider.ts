import { Injectable } from '@nestjs/common';
import type {
  EventResult,
  MarketOdds,
  ProviderEvent,
  SportsDataProvider,
} from './sports-provider.interface';
import {
  mapEvents,
  mapOdds,
  toEventResult,
  type OddsApiEvent,
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

  private get apiKey(): string {
    const key = process.env.SPORTS_API_KEY;
    if (!key) throw new Error('SPORTS_API_KEY is not set');
    return key;
  }

  async getUpcomingEvents(sport: string): Promise<ProviderEvent[]> {
    const url = `${this.base}/sports/${sport}/events?apiKey=${this.apiKey}`;
    const raw = await this.fetchJson<OddsApiEvent[]>(url);
    // Encode sport into the id so later odds/scores lookups can route.
    return mapEvents(raw).map((e) => ({
      ...e,
      vendorEventId: `${sport}:${e.vendorEventId}`,
    }));
  }

  async getOdds(vendorEventId: string): Promise<MarketOdds[]> {
    const { sport, eventId } = this.splitId(vendorEventId);
    const url = `${this.base}/sports/${sport}/odds?apiKey=${this.apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`;
    const raw = await this.fetchJson<OddsApiEventOdds[]>(url);
    const event = raw.find((e) => e.id === eventId);
    return event ? mapOdds(event) : [];
  }

  async getResult(vendorEventId: string): Promise<EventResult | null> {
    const { sport, eventId } = this.splitId(vendorEventId);
    const url = `${this.base}/sports/${sport}/scores?apiKey=${this.apiKey}&daysFrom=3`;
    const raw = await this.fetchJson<OddsApiScoreEvent[]>(url);
    const event = raw.find((e) => e.id === eventId);
    if (!event || !event.completed) return null;
    return toEventResult(event);
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

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the-odds-api ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
}
