import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFromScores,
  mapEvents,
  mapOdds,
  scoresOf,
  selectionForOutcome,
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
