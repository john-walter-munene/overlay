// Pure mapping/grading for API-Football (API-Sports) responses. No framework
// deps → unit-testable in isolation. Used primarily as the settlement/results
// source; odds come from The Odds API in v1.
import type {
  EventOutcome,
  EventResult,
  ProviderEvent,
} from './sports-provider.interface';

export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string }; // 'NS' | 'FT' | 'AET' | 'PEN' | ...
  };
  league: { name: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

const FINISHED = new Set(['FT', 'AET', 'PEN']);

export function isFinished(status: string): boolean {
  return FINISHED.has(status);
}

export function mapFixtures(
  raw: ApiFootballFixture[],
  sport = 'football',
): ProviderEvent[] {
  return raw.map((f) => ({
    vendorEventId: String(f.fixture.id),
    sport,
    league: f.league.name,
    home: f.teams.home.name,
    away: f.teams.away.name,
    startTime: new Date(f.fixture.date),
  }));
}

export function gradeFixture(
  f: ApiFootballFixture,
  market: string,
  selection: string,
): EventOutcome {
  if (!isFinished(f.fixture.status.short)) return 'void';
  if (market !== '1X2' && market !== 'moneyline') return 'void';
  const { home, away } = f.goals;
  if (home === null || away === null) return 'void';

  const winner: 'home' | 'draw' | 'away' =
    home > away ? 'home' : away > home ? 'away' : 'draw';

  if (market === 'moneyline' && winner === 'draw') return 'void';
  return selection === winner ? 'won' : 'lost';
}

export function toEventResult(f: ApiFootballFixture): EventResult {
  return {
    vendorEventId: String(f.fixture.id),
    raw: f as unknown as Record<string, unknown>,
    grade: (market, selection) => gradeFixture(f, market, selection),
  };
}
