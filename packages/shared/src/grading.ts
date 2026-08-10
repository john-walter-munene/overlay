/**
 * Universal market grading from a final score (OB-045).
 *
 * Pure and shared so it's unit-tested once and reused by every results source
 * (The Odds API scores, API-Football goals, …). Covers the markets a tipster
 * can pick and settles Asian **quarter/split lines** correctly (half-win /
 * half-loss), so `MarketOutcome` includes `half_won` / `half_lost`.
 *
 * Selection formats (also the keys the odds mappers produce, so a pick's
 * selection matches its closing-odds line):
 *   - 1X2:           'home' | 'draw' | 'away'
 *   - moneyline/dnb: 'home' | 'away'            (draw → void)
 *   - double_chance: '1X' | '12' | 'X2'
 *   - btts:          'yes' | 'no'
 *   - odd_even:      'odd' | 'even'
 *   - correct_score: '<h>-<a>'                  e.g. '2-1'
 *   - spreads:       '<home|away> <signed line>' e.g. 'home -1.5', 'home -0.25'
 *   - totals:        '<over|under> <line>'       e.g. 'over 2.5', 'over 2.25'
 *   - team_totals:   '<home|away> <over|under> <line>'  e.g. 'home over 1.5'
 */

export type MarketOutcome = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost';

/**
 * Markets a tipster can post and the settlement engine can grade — the single
 * source of truth shared by the pick DTO (server validation), the pick form
 * (client) and {@link gradeMarket}. To add a market: add it here, add a `case`
 * in `gradeMarket`, and add a selection hint in the pick form.
 */
export const SUPPORTED_MARKETS = [
  '1X2',
  'moneyline',
  'dnb',
  'double_chance',
  'btts',
  'odd_even',
  'correct_score',
  'spreads',
  'totals',
  'team_totals',
] as const;

export type SupportedMarket = (typeof SUPPORTED_MARKETS)[number];

/** Whether a raw string is one of the supported, gradeable markets. */
export function isSupportedMarket(market: string): market is SupportedMarket {
  return (SUPPORTED_MARKETS as readonly string[]).includes(market);
}

const EPS = 1e-9;

/** Format a handicap/point with an explicit sign, e.g. -1.5 → "-1.5", 2 → "+2". */
export function signedPoint(point: number): string {
  return point >= 0 ? `+${point}` : `${point}`;
}

/** Spread selection key for a side + line, e.g. ('home', -1.5) → "home -1.5". */
export function spreadKey(side: 'home' | 'away', point: number): string {
  return `${side} ${signedPoint(point)}`;
}

/** Totals selection key, e.g. ('over', 2.5) → "over 2.5". */
export function totalKey(side: 'over' | 'under', point: number): string {
  return `${side} ${point}`;
}

export function parseSpreadSelection(
  selection: string,
): { side: 'home' | 'away'; line: number } | null {
  const m = selection.trim().match(/^(home|away)\s+([+-]?\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  return { side: m[1].toLowerCase() as 'home' | 'away', line: Number(m[2]) };
}

export function parseTotalSelection(
  selection: string,
): { side: 'over' | 'under'; line: number } | null {
  const m = selection.trim().match(/^(over|under)\s+(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  return { side: m[1].toLowerCase() as 'over' | 'under', line: Number(m[2]) };
}

export function parseTeamTotalSelection(
  selection: string,
): { team: 'home' | 'away'; side: 'over' | 'under'; line: number } | null {
  const m = selection
    .trim()
    .match(/^(home|away)\s+(over|under)\s+(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  return {
    team: m[1].toLowerCase() as 'home' | 'away',
    side: m[2].toLowerCase() as 'over' | 'under',
    line: Number(m[3]),
  };
}

export function parseCorrectScore(
  selection: string,
): { home: number; away: number } | null {
  const m = selection.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

function winnerOf(homeScore: number, awayScore: number): 'home' | 'draw' | 'away' {
  return homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
}

/** A single (whole/half) line's result value: +1 win, 0 push, -1 loss. */
function marginValue(margin: number): number {
  if (margin > EPS) return 1;
  if (margin < -EPS) return -1;
  return 0;
}

/** Is `line` an Asian quarter line (…​.25 / .75)? Those split into two halves. */
function isQuarterLine(line: number): boolean {
  const frac = Math.abs(line) % 1;
  return Math.abs(frac - 0.25) < EPS || Math.abs(frac - 0.75) < EPS;
}

/**
 * Value of an Asian handicap on the picked side (a positive score margin
 * favours the pick). Quarter lines settle as two half-stakes on the adjacent
 * lines and average to −1 / −0.5 / 0 / 0.5 / 1.
 */
function handicapValue(line: number, picked: number, other: number): number {
  if (isQuarterLine(line)) {
    const a = marginValue(picked + (line + 0.25) - other);
    const b = marginValue(picked + (line - 0.25) - other);
    return (a + b) / 2;
  }
  return marginValue(picked + line - other);
}

/** Value of the OVER side of a total at `line` (quarter lines split). */
function overValue(line: number, total: number): number {
  if (isQuarterLine(line)) {
    const a = marginValue(total - (line + 0.25));
    const b = marginValue(total - (line - 0.25));
    return (a + b) / 2;
  }
  return marginValue(total - line);
}

/** Map a settlement value in {−1,−0.5,0,0.5,1} to an outcome. */
function outcomeFromValue(v: number): MarketOutcome {
  if (v >= 1 - EPS) return 'won';
  if (v <= -1 + EPS) return 'lost';
  if (v > EPS) return 'half_won';
  if (v < -EPS) return 'half_lost';
  return 'void';
}

/**
 * Grade a selection on a market given the final home/away scores. Unknown
 * markets or unparseable selections grade to `void` (never silently `lost`).
 */
export function gradeMarket(
  market: string,
  selection: string,
  homeScore: number,
  awayScore: number,
): MarketOutcome {
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return 'void';
  const total = homeScore + awayScore;
  const winner = winnerOf(homeScore, awayScore);
  const sel = selection.trim().toLowerCase();

  switch (market) {
    case '1X2':
      return sel === winner ? 'won' : 'lost';

    case 'moneyline':
    case 'dnb': // draw no bet — 2-way, a draw refunds
      if (winner === 'draw') return 'void';
      return sel === winner ? 'won' : 'lost';

    case 'double_chance': {
      if (sel !== '1x' && sel !== '12' && sel !== 'x2') return 'void';
      const wins =
        (sel === '1x' && winner !== 'away') ||
        (sel === '12' && winner !== 'draw') ||
        (sel === 'x2' && winner !== 'home');
      return wins ? 'won' : 'lost';
    }

    case 'btts': {
      const both = homeScore > 0 && awayScore > 0;
      if (sel === 'yes') return both ? 'won' : 'lost';
      if (sel === 'no') return both ? 'lost' : 'won';
      return 'void';
    }

    case 'odd_even': {
      const isOdd = total % 2 !== 0;
      if (sel === 'odd') return isOdd ? 'won' : 'lost';
      if (sel === 'even') return isOdd ? 'lost' : 'won';
      return 'void';
    }

    case 'correct_score': {
      const cs = parseCorrectScore(selection);
      if (!cs) return 'void';
      return cs.home === homeScore && cs.away === awayScore ? 'won' : 'lost';
    }

    case 'spreads': {
      const p = parseSpreadSelection(selection);
      if (!p) return 'void';
      const picked = p.side === 'home' ? homeScore : awayScore;
      const other = p.side === 'home' ? awayScore : homeScore;
      return outcomeFromValue(handicapValue(p.line, picked, other));
    }

    case 'totals': {
      const p = parseTotalSelection(selection);
      if (!p) return 'void';
      const v = overValue(p.line, total);
      return outcomeFromValue(p.side === 'over' ? v : -v);
    }

    case 'team_totals': {
      const p = parseTeamTotalSelection(selection);
      if (!p) return 'void';
      const teamScore = p.team === 'home' ? homeScore : awayScore;
      const v = overValue(p.line, teamScore);
      return outcomeFromValue(p.side === 'over' ? v : -v);
    }

    default:
      return 'void';
  }
}

/**
 * Is a market/selection *already irreversibly decided* by the current in-play
 * score? (OB-039 — live picks.)
 *
 * A live pick may only be placed on an outcome that is still genuinely open.
 * Since goals only ever accumulate, some markets become a foregone conclusion
 * mid-game — you can't bet Over 2.5 once 3 goals are already in, BTTS once both
 * sides have scored, or a correct score the game has already run past. Placing a
 * pick on such a market is a settled bet, not a wager, so the timing gate
 * rejects it.
 *
 * Returns `true` only when the final outcome is fixed regardless of the rest of
 * the game (won *or* lost). Winner-based markets (1X2, moneyline, dnb,
 * double_chance, spreads) and parity (odd_even) can always still flip while the
 * game is live, so they are never treated as decided in-play. Half-time /
 * period markets are not currently gradeable (not in {@link SUPPORTED_MARKETS})
 * and so are out of scope here.
 */
export function isMarketDecidedInPlay(
  market: string,
  selection: string,
  homeScore: number,
  awayScore: number,
): boolean {
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return false;

  switch (market) {
    case 'totals': {
      const p = parseTotalSelection(selection);
      if (!p) return false;
      // Goals only accumulate: OVER can no longer lose once it has cleanly won;
      // UNDER can no longer win once the line has already been passed.
      const current = gradeMarket(market, selection, homeScore, awayScore);
      return p.side === 'over' ? current === 'won' : current === 'lost';
    }

    case 'team_totals': {
      const p = parseTeamTotalSelection(selection);
      if (!p) return false;
      const current = gradeMarket(market, selection, homeScore, awayScore);
      return p.side === 'over' ? current === 'won' : current === 'lost';
    }

    case 'btts': {
      // Once both teams have scored, both 'yes' (won) and 'no' (lost) are fixed.
      return homeScore > 0 && awayScore > 0;
    }

    case 'correct_score': {
      const cs = parseCorrectScore(selection);
      if (!cs) return false;
      // The exact final score is unreachable once either side has passed it.
      return homeScore > cs.home || awayScore > cs.away;
    }

    default:
      return false;
  }
}
