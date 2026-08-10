import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeMarket,
  isMarketDecidedInPlay,
  parseSpreadSelection,
  parseTotalSelection,
  signedPoint,
  spreadKey,
  totalKey,
} from './grading.ts';

test('signedPoint / key formatting', () => {
  assert.equal(signedPoint(-1.5), '-1.5');
  assert.equal(signedPoint(2), '+2');
  assert.equal(spreadKey('home', -1.5), 'home -1.5');
  assert.equal(spreadKey('away', 1.5), 'away +1.5');
  assert.equal(totalKey('over', 2.5), 'over 2.5');
});

test('parseSpreadSelection', () => {
  assert.deepEqual(parseSpreadSelection('home -1.5'), { side: 'home', line: -1.5 });
  assert.deepEqual(parseSpreadSelection('away +2'), { side: 'away', line: 2 });
  assert.equal(parseSpreadSelection('over 2.5'), null);
  assert.equal(parseSpreadSelection('home'), null);
});

test('parseTotalSelection', () => {
  assert.deepEqual(parseTotalSelection('over 2.5'), { side: 'over', line: 2.5 });
  assert.deepEqual(parseTotalSelection('under 3'), { side: 'under', line: 3 });
  assert.equal(parseTotalSelection('home -1.5'), null);
});

test('gradeMarket 1X2', () => {
  assert.equal(gradeMarket('1X2', 'home', 2, 1), 'won');
  assert.equal(gradeMarket('1X2', 'draw', 1, 1), 'won');
  assert.equal(gradeMarket('1X2', 'away', 1, 1), 'lost');
});

test('gradeMarket moneyline pushes on a draw', () => {
  assert.equal(gradeMarket('moneyline', 'home', 2, 1), 'won');
  assert.equal(gradeMarket('moneyline', 'home', 1, 1), 'void');
  assert.equal(gradeMarket('moneyline', 'away', 2, 1), 'lost');
});

test('gradeMarket spreads: cover / not cover / push', () => {
  assert.equal(gradeMarket('spreads', 'home -1.5', 2, 0), 'won');
  assert.equal(gradeMarket('spreads', 'home -1.5', 2, 1), 'lost');
  assert.equal(gradeMarket('spreads', 'away +1.5', 2, 1), 'won');
  assert.equal(gradeMarket('spreads', 'home -1', 3, 2), 'void'); // whole-number push
});

test('gradeMarket totals: over / under / push', () => {
  assert.equal(gradeMarket('totals', 'over 2.5', 2, 1), 'won'); // total 3
  assert.equal(gradeMarket('totals', 'under 2.5', 2, 1), 'lost');
  assert.equal(gradeMarket('totals', 'under 3.5', 2, 1), 'won');
  assert.equal(gradeMarket('totals', 'over 3', 2, 1), 'void'); // total == line → push
});

test('gradeMarket: unknown market or bad selection → void', () => {
  assert.equal(gradeMarket('props', 'anything', 1, 0), 'void');
  assert.equal(gradeMarket('spreads', 'garbage', 1, 0), 'void');
  assert.equal(gradeMarket('totals', 'over abc', 1, 0), 'void');
});

test('gradeMarket dnb (draw no bet): draw refunds', () => {
  assert.equal(gradeMarket('dnb', 'home', 2, 1), 'won');
  assert.equal(gradeMarket('dnb', 'home', 1, 1), 'void');
  assert.equal(gradeMarket('dnb', 'away', 1, 2), 'won');
});

test('gradeMarket double_chance', () => {
  assert.equal(gradeMarket('double_chance', '1X', 1, 1), 'won'); // draw
  assert.equal(gradeMarket('double_chance', '1X', 0, 1), 'lost'); // away win
  assert.equal(gradeMarket('double_chance', '12', 1, 1), 'lost'); // draw loses 12
  assert.equal(gradeMarket('double_chance', 'X2', 0, 2), 'won');
});

test('gradeMarket btts', () => {
  assert.equal(gradeMarket('btts', 'yes', 1, 1), 'won');
  assert.equal(gradeMarket('btts', 'yes', 2, 0), 'lost');
  assert.equal(gradeMarket('btts', 'no', 2, 0), 'won');
});

test('gradeMarket odd_even (total goals parity)', () => {
  assert.equal(gradeMarket('odd_even', 'odd', 2, 1), 'won'); // 3
  assert.equal(gradeMarket('odd_even', 'even', 2, 1), 'lost');
  assert.equal(gradeMarket('odd_even', 'even', 1, 1), 'won'); // 2
});

test('gradeMarket correct_score', () => {
  assert.equal(gradeMarket('correct_score', '2-1', 2, 1), 'won');
  assert.equal(gradeMarket('correct_score', '2-1', 1, 1), 'lost');
});

test('gradeMarket team_totals', () => {
  assert.equal(gradeMarket('team_totals', 'home over 1.5', 2, 0), 'won');
  assert.equal(gradeMarket('team_totals', 'home over 1.5', 1, 3), 'lost');
  assert.equal(gradeMarket('team_totals', 'away under 0.5', 2, 0), 'won');
});

test('gradeMarket Asian quarter handicap: half-win / half-loss', () => {
  // Home -0.25, final 1-1 (draw): sub-lines 0.0 (push) and -0.5 (loss) → half_lost
  assert.equal(gradeMarket('spreads', 'home -0.25', 1, 1), 'half_lost');
  // Home -0.25, final 1-0 (win by 1): 0.0 (win) and -0.5 (win) → won
  assert.equal(gradeMarket('spreads', 'home -0.25', 1, 0), 'won');
  // Home +0.25, final 1-1 (draw): 0.5 (win) and 0.0 (push) → half_won
  assert.equal(gradeMarket('spreads', 'home +0.25', 1, 1), 'half_won');
  // Home -0.75, win by 1: sub-lines -0.5 (win) and -1.0 (push) → half_won
  assert.equal(gradeMarket('spreads', 'home -0.75', 1, 0), 'half_won');
  // Away +0.75, final 2-1 (away loses by 1): +0.5 (loss) and +1.0 (push) → half_lost
  assert.equal(gradeMarket('spreads', 'away +0.75', 2, 1), 'half_lost');
});

test('gradeMarket Asian quarter totals: half-win / half-loss', () => {
  // Over 2.25, total 2: 2.0 (push) and 2.5 (loss) → half_lost
  assert.equal(gradeMarket('totals', 'over 2.25', 1, 1), 'half_lost');
  // Over 2.75, total 3: 2.5 (win) and 3.0 (push) → half_won
  assert.equal(gradeMarket('totals', 'over 2.75', 2, 1), 'half_won');
  // Under 2.25, total 2: 2.0 (push) and 2.5 (win) → half_won
  assert.equal(gradeMarket('totals', 'under 2.25', 1, 1), 'half_won');
});

test('isMarketDecidedInPlay: totals lock once the line is passed', () => {
  // Over 2.5 is a foregone win once 3 goals are in; still open at 2.
  assert.equal(isMarketDecidedInPlay('totals', 'over 2.5', 2, 1), true);
  assert.equal(isMarketDecidedInPlay('totals', 'over 2.5', 1, 1), false);
  // Under 2.5 is a foregone loss once 3 goals are in; still open below the line.
  assert.equal(isMarketDecidedInPlay('totals', 'under 2.5', 2, 1), true);
  assert.equal(isMarketDecidedInPlay('totals', 'under 2.5', 1, 1), false);
  // Whole line: still open on a push (could go over or stay level at full time).
  assert.equal(isMarketDecidedInPlay('totals', 'over 3', 2, 1), false);
  assert.equal(isMarketDecidedInPlay('totals', 'over 3', 3, 1), true);
  // Quarter line: half-win at the current score is not yet fully decided.
  assert.equal(isMarketDecidedInPlay('totals', 'over 2.75', 2, 1), false);
  assert.equal(isMarketDecidedInPlay('totals', 'over 2.75', 3, 0), false);
  assert.equal(isMarketDecidedInPlay('totals', 'over 2.75', 4, 0), true);
});

test('isMarketDecidedInPlay: team totals lock on the picked team only', () => {
  assert.equal(isMarketDecidedInPlay('team_totals', 'home over 1.5', 2, 0), true);
  assert.equal(isMarketDecidedInPlay('team_totals', 'home over 1.5', 1, 3), false);
  assert.equal(isMarketDecidedInPlay('team_totals', 'home under 1.5', 2, 0), true);
});

test('isMarketDecidedInPlay: btts locks once both teams have scored', () => {
  assert.equal(isMarketDecidedInPlay('btts', 'yes', 1, 1), true);
  assert.equal(isMarketDecidedInPlay('btts', 'no', 1, 1), true);
  assert.equal(isMarketDecidedInPlay('btts', 'yes', 2, 0), false);
  assert.equal(isMarketDecidedInPlay('btts', 'no', 0, 0), false);
});

test('isMarketDecidedInPlay: correct score locks once the game runs past it', () => {
  assert.equal(isMarketDecidedInPlay('correct_score', '1-0', 2, 0), true);
  assert.equal(isMarketDecidedInPlay('correct_score', '1-0', 0, 1), true);
  assert.equal(isMarketDecidedInPlay('correct_score', '2-1', 1, 0), false);
});

test('isMarketDecidedInPlay: winner and parity markets can always still flip', () => {
  assert.equal(isMarketDecidedInPlay('1X2', 'home', 3, 0), false);
  assert.equal(isMarketDecidedInPlay('moneyline', 'home', 3, 0), false);
  assert.equal(isMarketDecidedInPlay('double_chance', '1x', 3, 0), false);
  assert.equal(isMarketDecidedInPlay('spreads', 'home -1.5', 3, 0), false);
  assert.equal(isMarketDecidedInPlay('odd_even', 'odd', 3, 0), false);
});
