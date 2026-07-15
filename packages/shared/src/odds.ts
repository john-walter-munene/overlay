/**
 * Odds-format conversion + bet-returns math (OB-152).
 *
 * Pure and dependency-light so the self-service calculator page (web) and any
 * future API consumer share one tested implementation. Decimal odds are the
 * canonical form every other representation converts through:
 *   - decimal:     2.50          (total return per 1 unit staked)
 *   - fractional:  "3/2"         (profit as a reduced fraction of the stake)
 *   - american:    +150 / -200   (moneyline)
 *   - probability: 0.40          (implied probability as a 0..1 fraction)
 *
 * Currency display reuses the shared minor-unit exponent table so the returns
 * calculator formats money the same way the rest of the app does.
 */

import { currencyExponent } from './currencies.ts';

/** The four odds representations the converter understands. */
export type OddsFormat = 'decimal' | 'fractional' | 'american' | 'probability';

/** A single odds value expressed in every supported format. */
export interface OddsConversion {
  /** Decimal (European) odds, e.g. 2.5. Rounded to 2 dp. */
  decimal: number;
  /** Reduced fractional (UK) odds, e.g. "3/2". */
  fractional: string;
  /** American (moneyline) odds, e.g. 150 or -200. Integer. */
  american: number;
  /** Implied probability as a 0..1 fraction, e.g. 0.4. Rounded to 4 dp. */
  impliedProbability: number;
}

/** Smallest and largest decimal odds we treat as valid input. */
export const MIN_DECIMAL_ODDS = 1.01;
export const MAX_DECIMAL_ODDS = 1000;

/** Round `n` to `dp` decimal places, avoiding negative-zero. */
function round(n: number, dp: number): number {
  const f = 10 ** dp;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** True when `n` is a finite decimal-odds value greater than 1. */
export function isValidDecimalOdds(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 1;
}

/** Decimal → implied probability (0..1). */
export function decimalToProbability(decimal: number): number {
  return 1 / decimal;
}

/** Implied probability (0..1, exclusive) → decimal odds. */
export function probabilityToDecimal(probability: number): number | null {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    return null;
  }
  return 1 / probability;
}

/** Decimal → American (moneyline) odds, rounded to the nearest integer. */
export function decimalToAmerican(decimal: number): number {
  const american = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  const rounded = Math.round(american);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** American (moneyline) odds → decimal odds. */
export function americanToDecimal(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  // Moneyline magnitudes below 100 are undefined (they'd imply |odds| < 100).
  if (Math.abs(american) < 100) return null;
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

/**
 * Best rational approximation of a non-negative value using a bounded
 * continued-fraction expansion. Clean inputs (0.5, 1.5, 2, …) recover their
 * exact simple fraction; noisy decimals collapse to the nearest small fraction.
 */
function toFraction(value: number, maxDenominator = 1000): [number, number] {
  if (value <= 0) return [0, 1];
  let h0 = 0;
  let h1 = 1;
  let k0 = 1;
  let k1 = 0;
  let b = value;
  for (let i = 0; i < 64; i += 1) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDenominator) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    const frac = b - a;
    if (frac < 1e-9) break;
    b = 1 / frac;
  }
  return [h1, k1];
}

/** Decimal → reduced fractional odds string, e.g. 2.5 → "3/2". */
export function decimalToFractional(decimal: number): string {
  const [num, den] = toFraction(decimal - 1);
  return `${num}/${den}`;
}

/** Fractional odds string ("a/b") → decimal odds. */
export function fractionalToDecimal(fractional: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)\s*$/.exec(
    fractional,
  );
  if (!match) return null;
  const num = Number(match[1]);
  const den = Number(match[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0 || num < 0) {
    return null;
  }
  return 1 + num / den;
}

/**
 * Parse a raw input string in the given format into canonical decimal odds,
 * or null when it is empty/invalid. Probability input is a percentage (0–100).
 */
export function parseOddsInput(
  value: string,
  format: OddsFormat,
): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  switch (format) {
    case 'decimal': {
      const decimal = Number(trimmed);
      return isValidDecimalOdds(decimal) ? decimal : null;
    }
    case 'fractional':
      return fractionalToDecimal(trimmed);
    case 'american': {
      const american = Number(trimmed.replace(/^\+/, ''));
      return americanToDecimal(american);
    }
    case 'probability': {
      const percent = Number(trimmed.replace(/%$/, '').trim());
      if (!Number.isFinite(percent)) return null;
      return probabilityToDecimal(percent / 100);
    }
    default:
      return null;
  }
}

/**
 * Convert a canonical decimal-odds value into every supported representation,
 * or null when the decimal odds are out of the accepted range.
 */
export function convertOdds(decimal: number): OddsConversion | null {
  if (!isValidDecimalOdds(decimal)) return null;
  if (decimal < MIN_DECIMAL_ODDS || decimal > MAX_DECIMAL_ODDS) return null;
  return {
    decimal: round(decimal, 2),
    fractional: decimalToFractional(decimal),
    american: decimalToAmerican(decimal),
    impliedProbability: round(decimalToProbability(decimal), 4),
  };
}

/** Result of the bet/returns calculator. All amounts are in major units. */
export interface BetReturns {
  /** Amount staked. */
  stake: number;
  /** Decimal odds applied. */
  decimalOdds: number;
  /** Total returned if the bet wins: stake × decimal odds. */
  returns: number;
  /** Profit if the bet wins: returns − stake. */
  profit: number;
}

/**
 * Compute potential returns and profit from a stake and decimal odds:
 *   returns = stake × decimalOdds
 *   profit  = returns − stake
 * Returns null for a negative stake or invalid odds. Amounts are rounded to
 * two decimal places for display stability.
 */
export function computeReturns(
  stake: number,
  decimalOdds: number,
): BetReturns | null {
  if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 0) {
    return null;
  }
  if (!isValidDecimalOdds(decimalOdds)) return null;
  const returns = round(stake * decimalOdds, 2);
  return {
    stake: round(stake, 2),
    decimalOdds,
    returns,
    profit: round(returns - stake, 2),
  };
}

/**
 * Format a major-unit money amount with its currency code, honouring the
 * currency's minor-unit exponent, e.g. (2578.71, 'KES') → "KES 2,578.71".
 */
export function formatMoney(amount: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })}`;
}
