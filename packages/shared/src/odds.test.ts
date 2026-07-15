import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  americanToDecimal,
  computeReturns,
  convertOdds,
  decimalToAmerican,
  decimalToFractional,
  decimalToProbability,
  formatMoney,
  fractionalToDecimal,
  isValidDecimalOdds,
  parseOddsInput,
  probabilityToDecimal,
} from './odds.ts';

test('isValidDecimalOdds accepts finite numbers > 1 only', () => {
  assert.equal(isValidDecimalOdds(2.5), true);
  assert.equal(isValidDecimalOdds(1.01), true);
  assert.equal(isValidDecimalOdds(1), false);
  assert.equal(isValidDecimalOdds(0.5), false);
  assert.equal(isValidDecimalOdds(Infinity), false);
  assert.equal(isValidDecimalOdds('2.5'), false);
});

test('decimal ⇄ implied probability round-trips', () => {
  assert.equal(decimalToProbability(2), 0.5);
  assert.equal(decimalToProbability(4), 0.25);
  assert.equal(probabilityToDecimal(0.5), 2);
  assert.equal(probabilityToDecimal(0.25), 4);
});

test('probabilityToDecimal rejects out-of-range probabilities', () => {
  assert.equal(probabilityToDecimal(0), null);
  assert.equal(probabilityToDecimal(1), null);
  assert.equal(probabilityToDecimal(-0.1), null);
  assert.equal(probabilityToDecimal(1.5), null);
});

test('decimal → American handles favourites, underdogs and evens', () => {
  // Evens: decimal 2.0 is +100.
  assert.equal(decimalToAmerican(2), 100);
  // Underdog: decimal 2.5 → +150.
  assert.equal(decimalToAmerican(2.5), 150);
  // Favourite: decimal 1.5 → -200 (negative American).
  assert.equal(decimalToAmerican(1.5), -200);
  assert.equal(decimalToAmerican(1.8), -125);
});

test('American → decimal handles positive and negative moneylines', () => {
  assert.equal(americanToDecimal(100), 2);
  assert.equal(americanToDecimal(150), 2.5);
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(-125), 1.8);
});

test('americanToDecimal rejects zero and sub-100 magnitudes', () => {
  assert.equal(americanToDecimal(0), null);
  assert.equal(americanToDecimal(50), null);
  assert.equal(americanToDecimal(-99), null);
  assert.equal(americanToDecimal(NaN), null);
});

test('decimal → fractional reduces to simple fractions incl. evens', () => {
  assert.equal(decimalToFractional(2), '1/1'); // evens
  assert.equal(decimalToFractional(2.5), '3/2');
  assert.equal(decimalToFractional(1.5), '1/2');
  assert.equal(decimalToFractional(3), '2/1');
  assert.equal(decimalToFractional(1.2), '1/5');
  assert.equal(decimalToFractional(4.5), '7/2');
});

test('fractional → decimal parses "a/b" and colon form', () => {
  assert.equal(fractionalToDecimal('1/1'), 2);
  assert.equal(fractionalToDecimal('3/2'), 2.5);
  assert.equal(fractionalToDecimal('1/2'), 1.5);
  assert.equal(fractionalToDecimal(' 5 / 1 '), 6);
  assert.equal(fractionalToDecimal('2:1'), 3);
});

test('fractionalToDecimal rejects malformed and zero-denominator input', () => {
  assert.equal(fractionalToDecimal('abc'), null);
  assert.equal(fractionalToDecimal('3/0'), null);
  assert.equal(fractionalToDecimal('3'), null);
  assert.equal(fractionalToDecimal(''), null);
});

test('parseOddsInput parses each format and rejects invalid input', () => {
  assert.equal(parseOddsInput('2.5', 'decimal'), 2.5);
  assert.equal(parseOddsInput('1', 'decimal'), null);
  assert.equal(parseOddsInput('3/2', 'fractional'), 2.5);
  assert.equal(parseOddsInput('+150', 'american'), 2.5);
  assert.equal(parseOddsInput('-200', 'american'), 1.5);
  assert.equal(parseOddsInput('40%', 'probability'), 2.5);
  assert.equal(parseOddsInput('40', 'probability'), 2.5);
  assert.equal(parseOddsInput('  ', 'decimal'), null);
  assert.equal(parseOddsInput('0', 'probability'), null);
});

test('convertOdds produces all four formats consistently', () => {
  assert.deepEqual(convertOdds(2.5), {
    decimal: 2.5,
    fractional: '3/2',
    american: 150,
    impliedProbability: 0.4,
  });
  // Evens across every format.
  assert.deepEqual(convertOdds(2), {
    decimal: 2,
    fractional: '1/1',
    american: 100,
    impliedProbability: 0.5,
  });
  // Favourite with a negative American line.
  assert.deepEqual(convertOdds(1.5), {
    decimal: 1.5,
    fractional: '1/2',
    american: -200,
    impliedProbability: 0.6667,
  });
});

test('convertOdds rejects out-of-range or invalid odds', () => {
  assert.equal(convertOdds(1), null);
  assert.equal(convertOdds(1.005), null); // below MIN_DECIMAL_ODDS
  assert.equal(convertOdds(2000), null); // above MAX_DECIMAL_ODDS
  assert.equal(convertOdds(Number.NaN), null);
});

test('computeReturns: returns = stake × odds, profit = returns − stake', () => {
  assert.deepEqual(computeReturns(10, 2.5), {
    stake: 10,
    decimalOdds: 2.5,
    returns: 25,
    profit: 15,
  });
  assert.deepEqual(computeReturns(100, 1.5), {
    stake: 100,
    decimalOdds: 1.5,
    returns: 150,
    profit: 50,
  });
  // Zero stake is a valid (no-op) calculation.
  assert.deepEqual(computeReturns(0, 3), {
    stake: 0,
    decimalOdds: 3,
    returns: 0,
    profit: 0,
  });
  // Rounds to 2 dp for display stability.
  assert.deepEqual(computeReturns(33.33, 2.2), {
    stake: 33.33,
    decimalOdds: 2.2,
    returns: 73.33,
    profit: 40,
  });
});

test('computeReturns rejects negative stake or invalid odds', () => {
  assert.equal(computeReturns(-5, 2), null);
  assert.equal(computeReturns(10, 1), null);
  assert.equal(computeReturns(Number.NaN, 2), null);
  assert.equal(computeReturns(10, Number.POSITIVE_INFINITY), null);
});

test('formatMoney respects currency minor-unit exponents', () => {
  assert.equal(formatMoney(25, 'USD'), 'USD 25.00');
  assert.equal(formatMoney(2578.71, 'KES'), 'KES 2,578.71');
  assert.equal(formatMoney(1500, 'JPY'), 'JPY 1,500'); // zero-decimal
  assert.equal(formatMoney(1.555, 'KWD'), 'KWD 1.555'); // three-decimal
});
