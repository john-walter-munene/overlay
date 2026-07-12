import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFromScores,
  mapEvents,
  mapOdds,
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
