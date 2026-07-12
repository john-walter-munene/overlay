import { Injectable } from '@nestjs/common';
import type {
  EventResult,
  MarketOdds,
  ProviderEvent,
  SportsDataProvider,
} from './sports-provider.interface';
import {
  mapFixtures,
  toEventResult,
  type ApiFootballFixture,
} from './api-football.mapper';

/**
 * API-Football (API-Sports) adapter — primary source for fixtures + results,
 * used for auto-grading settlement. Odds are sourced from The Odds API in v1,
 * so getOdds returns []. Response shaping lives in the pure mapper.
 * https://www.api-football.com/
 */
@Injectable()
export class ApiFootballProvider implements SportsDataProvider {
  readonly name = 'api-football';
  private readonly base = 'https://v3.football.api-sports.io';

  private headers(): Record<string, string> {
    const key = process.env.SPORTS_API_KEY;
    if (!key) throw new Error('SPORTS_API_KEY is not set');
    return { 'x-apisports-key': key };
  }

  async getUpcomingEvents(sport: string): Promise<ProviderEvent[]> {
    const url = `${this.base}/fixtures?next=50`;
    const body = await this.fetchJson<{ response: ApiFootballFixture[] }>(url);
    return mapFixtures(body.response, sport);
  }

  async getOdds(_vendorEventId: string): Promise<MarketOdds[]> {
    // Odds are sourced from The Odds API in v1.
    return [];
  }

  async getResult(vendorEventId: string): Promise<EventResult | null> {
    const url = `${this.base}/fixtures?id=${vendorEventId}`;
    const body = await this.fetchJson<{ response: ApiFootballFixture[] }>(url);
    const fixture = body.response[0];
    if (!fixture) return null;
    const result = toEventResult(fixture);
    // A pending/unfinished fixture grades to 'void'; treat as "not settled yet".
    return fixture.fixture.status.short === 'FT' ||
      fixture.fixture.status.short === 'AET' ||
      fixture.fixture.status.short === 'PEN'
      ? result
      : null;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`api-football ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
}
