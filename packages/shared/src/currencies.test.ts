import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertUsdCents,
  currencyExponent,
  currencyForCountry,
  formatMinorUnits,
  COUNTRY_CURRENCY,
} from './currencies.ts';

test('currencyForCountry maps countries to ISO 4217, case-insensitive', () => {
  assert.equal(currencyForCountry('KE'), 'KES');
  assert.equal(currencyForCountry('gb'), 'GBP');
  assert.equal(currencyForCountry('US'), 'USD');
  assert.equal(currencyForCountry('DE'), 'EUR');
  assert.equal(currencyForCountry('ZZ'), null);
  assert.equal(currencyForCountry(null), null);
});

test('currencyExponent knows zero/three-decimal currencies, defaults to 2', () => {
  assert.equal(currencyExponent('USD'), 2);
  assert.equal(currencyExponent('KES'), 2);
  assert.equal(currencyExponent('JPY'), 0);
  assert.equal(currencyExponent('ugx'), 0);
  assert.equal(currencyExponent('KWD'), 3);
});

test('convertUsdCents scales by rate and target exponent', () => {
  // $19.99 at 129 KES/USD → 2578.71 KES → 257871 minor units (2 decimals).
  assert.equal(convertUsdCents(1999, 129, 'KES'), 257871);
  // $10.00 at 150 JPY/USD → 1500 JPY → 1500 minor units (0 decimals).
  assert.equal(convertUsdCents(1000, 150, 'JPY'), 1500);
  // USD → USD at rate 1 is identity in cents.
  assert.equal(convertUsdCents(1999, 1, 'USD'), 1999);
  // Three-decimal: $5 at 0.31 KWD/USD → 1.55 KWD → 1550 minor units.
  assert.equal(convertUsdCents(500, 0.31, 'KWD'), 1550);
});

test('formatMinorUnits renders with the right decimals', () => {
  assert.equal(formatMinorUnits(257871, 'KES'), 'KES 2,578.71');
  assert.equal(formatMinorUnits(1500, 'JPY'), 'JPY 1,500');
});

test('every mapped currency has a valid ISO-ish code', () => {
  for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
    assert.match(country, /^[A-Z]{2}$/, `bad country ${country}`);
    assert.match(currency, /^[A-Z]{3}$/, `bad currency ${currency}`);
  }
});
