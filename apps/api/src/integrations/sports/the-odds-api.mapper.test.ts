import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFromScores,
  mapEvents,
  mapEventOdds,
  mapMarketInventory,
  mapOdds,
  scoresOf,
  scoreStateOf,
  selectionForOutcome,
  type OddsApiEventMarkets,
  type OddsApiEventOdds,
  type OddsApiScoreEvent,
} from './the-odds-api.mapper.ts';

test('mapEvents normalizes vendor fields', () => {
  const [e] = mapEvents([
    {
      id: 'evt1',
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      home_team: 'Home',
      away_team: 'Away',
      commence_time: '2030-01-01T12:00:00Z',
    },
  ]);
  assert.equal(e.vendorEventId, 'evt1');
  assert.equal(e.home, 'Home');
  assert.equal(e.startTime.getTime(), Date.parse('2030-01-01T12:00:00Z'));
});

test('selectionForOutcome maps team names and draw', () => {
  assert.equal(selectionForOutcome('Home', 'Home', 'Away'), 'home');
  assert.equal(selectionForOutcome('Away', 'Home', 'Away'), 'away');
  assert.equal(selectionForOutcome('Draw', 'Home', 'Away'), 'draw');
  assert.equal(selectionForOutcome('Other', 'Home', 'Away'), null);
});

test('mapOdds takes the best price per selection across books → 1X2', () => {
  const raw: OddsApiEventOdds = {
    id: 'evt1',
    sport_key: 'soccer_epl',
    sport_title: 'EPL',
    home_team: 'Home',
    away_team: 'Away',
    commence_time: '2030-01-01T12:00:00Z',
    bookmakers: [
      {
        key: 'bookA',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Home', price: 2.0 },
              { name: 'Draw', price: 3.3 },
              { name: 'Away', price: 3.5 },
            ],
          },
        ],
      },
      {
        key: 'bookB',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Home', price: 2.15 }, // better
              { name: 'Draw', price: 3.2 },
              { name: 'Away', price: 3.9 }, // better
            ],
          },
        ],
      },
    ],
  };
  const [m] = mapOdds(raw);
  assert.equal(m.market, '1X2');
  assert.equal(m.prices.home, 2.15);
  assert.equal(m.prices.draw, 3.3);
  assert.equal(m.prices.away, 3.9);
});

test('mapOdds without draw → moneyline', () => {
  const raw: OddsApiEventOdds = {
    id: 'e',
    sport_key: 's',
    sport_title: 't',
    home_team: 'H',
    away_team: 'A',
    commence_time: '2030-01-01T00:00:00Z',
    bookmakers: [
      {
        key: 'b',
        markets: [
          { key: 'h2h', outcomes: [{ name: 'H', price: 1.8 }, { name: 'A', price: 2.0 }] },
        ],
      },
    ],
  };
  const [m] = mapOdds(raw);
  assert.equal(m.market, 'moneyline');
});

test('mapOdds emits spreads + totals keyed by their line', () => {
  const raw: OddsApiEventOdds = {
    id: 'e',
    sport_key: 'soccer_epl',
    sport_title: 'EPL',
    home_team: 'Home',
    away_team: 'Away',
    commence_time: '2030-01-01T00:00:00Z',
    bookmakers: [
      {
        key: 'bookA',
        markets: [
          {
            key: 'spreads',
            outcomes: [
              { name: 'Home', price: 1.9, point: -1.5 },
              { name: 'Away', price: 1.95, point: 1.5 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: 1.87, point: 2.5 },
              { name: 'Under', price: 1.95, point: 2.5 },
            ],
          },
        ],
      },
      {
        key: 'bookB',
        markets: [
          {
            key: 'spreads',
            outcomes: [
              { name: 'Home', price: 2.0, point: -1.5 }, // better home -1.5
            ],
          },
        ],
      },
    ],
  };
  const markets = mapOdds(raw);
  const spreads = markets.find((m) => m.market === 'spreads');
  const totals = markets.find((m) => m.market === 'totals');
  assert.ok(spreads && totals);
  // Best price for the exact line, keyed with the signed handicap.
  assert.equal(spreads!.prices['home -1.5'], 2.0);
  assert.equal(spreads!.prices['away +1.5'], 1.95);
  assert.equal(totals!.prices['over 2.5'], 1.87);
  assert.equal(totals!.prices['under 2.5'], 1.95);
});

test('mapEventOdds: btts + draw_no_bet + team_totals with best price', () => {
  const raw: OddsApiEventOdds = {
    id: 'e',
    sport_key: 'soccer_epl',
    sport_title: 'EPL',
    home_team: 'Home',
    away_team: 'Away',
    commence_time: '2030-01-01T00:00:00Z',
    bookmakers: [
      {
        key: 'bookA',
        title: 'Book A',
        markets: [
          {
            key: 'btts',
            outcomes: [
              { name: 'Yes', price: 1.8 },
              { name: 'No', price: 2.0 },
            ],
          },
          {
            key: 'draw_no_bet',
            outcomes: [
              { name: 'Home', price: 1.5 },
              { name: 'Away', price: 2.4 },
            ],
          },
          {
            key: 'team_totals',
            outcomes: [
              { name: 'Over', price: 1.9, point: 1.5, description: 'Home' },
              { name: 'Under', price: 1.85, point: 1.5, description: 'Home' },
            ],
          },
        ],
      },
      {
        key: 'bookB',
        title: 'Book B',
        markets: [
          {
            key: 'btts',
            outcomes: [{ name: 'Yes', price: 1.95 }], // better Yes
          },
        ],
      },
    ],
  };
  const markets = mapEventOdds(raw);
  const btts = markets.find((m) => m.market === 'btts');
  const dnb = markets.find((m) => m.market === 'dnb');
  const tt = markets.find((m) => m.market === 'team_totals');
  assert.ok(btts && dnb && tt);
  assert.equal(btts!.prices['yes'], 1.95); // best across books
  assert.equal(btts!.prices['no'], 2.0);
  assert.equal(dnb!.prices['home'], 1.5);
  assert.equal(dnb!.prices['away'], 2.4);
  assert.equal(tt!.prices['home over 1.5'], 1.9);
  assert.equal(tt!.prices['home under 1.5'], 1.85);
  // Offers carry bookmaker attribution for CLV/comparison.
  assert.ok(btts!.offers!.some((o) => o.bookmaker === 'bookB'));
});

test('mapEventOdds: skips unmappable outcomes and ignores featured keys', () => {
  const raw: OddsApiEventOdds = {
    id: 'e',
    sport_key: 'soccer_epl',
    sport_title: 'EPL',
    home_team: 'Home',
    away_team: 'Away',
    commence_time: '2030-01-01T00:00:00Z',
    bookmakers: [
      {
        key: 'bookA',
        markets: [
          // Featured markets are handled by the bulk call, not here.
          { key: 'h2h', outcomes: [{ name: 'Home', price: 2.0 }] },
          // Ambiguous team on team_totals → dropped rather than mis-settled.
          {
            key: 'team_totals',
            outcomes: [{ name: 'Over', price: 1.9, point: 1.5, description: 'Someone Else' }],
          },
          // draw_no_bet with an unknown team → dropped.
          { key: 'draw_no_bet', outcomes: [{ name: 'Nobody', price: 1.5 }] },
        ],
      },
    ],
  };
  assert.deepEqual(mapEventOdds(raw), []);
});

const score = (h: number, a: number, completed = true): OddsApiScoreEvent => ({
  id: 'e',
  completed,
  home_team: 'H',
  away_team: 'A',
  scores: [
    { name: 'H', score: String(h) },
    { name: 'A', score: String(a) },
  ],
});

test('gradeFromScores: 1X2 home win', () => {
  assert.equal(gradeFromScores(score(2, 1), '1X2', 'home'), 'won');
  assert.equal(gradeFromScores(score(2, 1), '1X2', 'away'), 'lost');
  assert.equal(gradeFromScores(score(2, 1), '1X2', 'draw'), 'lost');
});

test('gradeFromScores: 1X2 draw', () => {
  assert.equal(gradeFromScores(score(1, 1), '1X2', 'draw'), 'won');
  assert.equal(gradeFromScores(score(1, 1), '1X2', 'home'), 'lost');
});

test('gradeFromScores: moneyline draw is a push (void)', () => {
  assert.equal(gradeFromScores(score(1, 1), 'moneyline', 'home'), 'void');
});

test('gradeFromScores: not completed → void', () => {
  assert.equal(gradeFromScores(score(2, 1, false), '1X2', 'home'), 'void');
});

test('gradeFromScores: unsupported market → void', () => {
  assert.equal(gradeFromScores(score(2, 1), 'totals', 'over'), 'void');
});

test('scoresOf: extracts running in-play scores (even when not completed)', () => {
  assert.deepEqual(scoresOf(score(2, 1, false)), { home: 2, away: 1 });
  assert.deepEqual(scoresOf(score(0, 0)), { home: 0, away: 0 });
});

test('scoresOf: null when scores are missing or unparseable', () => {
  assert.equal(scoresOf({ ...score(1, 0), scores: null }), null);
  assert.equal(
    scoresOf({
      ...score(1, 0),
      scores: [{ name: 'H', score: 'x' }],
    }),
    null,
  );
});

const marketsPayload: OddsApiEventMarkets = {
  id: 'evt1',
  sport_key: 'americanfootball_nfl',
  sport_title: 'NFL',
  home_team: 'Home',
  away_team: 'Away',
  commence_time: '2030-01-01T00:00:00Z',
  bookmakers: [
    {
      key: 'draftkings',
      markets: [
        { key: 'h2h', last_update: '2030-01-01T00:00:00Z' },
        { key: 'player_pass_tds', last_update: '2030-01-01T00:05:00Z' },
      ],
    },
    {
      key: 'fanduel',
      markets: [
        { key: 'h2h', last_update: '2030-01-01T00:10:00Z' },
        { key: 'spreads_q1', last_update: '2030-01-01T00:01:00Z' },
      ],
    },
  ],
};

test('mapMarketInventory: classifies markets and aggregates bookmakers', () => {
  const inv = mapMarketInventory(marketsPayload);
  const h2h = inv.find((m) => m.key === 'h2h');
  assert.ok(h2h);
  assert.equal(h2h!.pickable, true);
  assert.deepEqual(h2h!.bookmakers, ['draftkings', 'fanduel']);
  // Latest update across the two books for h2h.
  assert.equal(h2h!.lastUpdate, '2030-01-01T00:10:00Z');

  const prop = inv.find((m) => m.key === 'player_pass_tds');
  assert.equal(prop!.pickable, false);
  assert.equal(prop!.group, 'player_prop');
  assert.deepEqual(prop!.bookmakers, ['draftkings']);

  const period = inv.find((m) => m.key === 'spreads_q1');
  assert.equal(period!.pickable, false);
  assert.equal(period!.group, 'period');
});

test('mapMarketInventory: pickable markets sort first', () => {
  const inv = mapMarketInventory(marketsPayload);
  assert.equal(inv[0].key, 'h2h'); // only pickable one, sorts first
  assert.ok(inv.every((m, i) => i === 0 || !m.pickable || inv[i - 1].pickable));
});

test('mapMarketInventory: empty bookmakers → empty inventory', () => {
  assert.deepEqual(mapMarketInventory({ ...marketsPayload, bookmakers: [] }), []);
});

test('scoreStateOf: normalizes a completed game with freshness', () => {
  const state = scoreStateOf({
    ...score(2, 1),
    last_update: '2026-08-15T16:00:00Z',
  });
  assert.equal(state.vendorEventId, 'e');
  assert.equal(state.completed, true);
  assert.deepEqual(state.score, { home: 2, away: 1 });
  assert.equal(state.lastUpdate, '2026-08-15T16:00:00Z');
});

test('scoreStateOf: in-play game carries a running score, not completed', () => {
  const state = scoreStateOf(score(1, 0, false));
  assert.equal(state.completed, false);
  assert.deepEqual(state.score, { home: 1, away: 0 });
});

test('scoreStateOf: no score yet → null score and null freshness', () => {
  const state = scoreStateOf({ ...score(0, 0, false), scores: null });
  assert.equal(state.completed, false);
  assert.equal(state.score, null);
  assert.equal(state.lastUpdate, null);
});
