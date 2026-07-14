// Pure tipster-profile editing helpers (OB-021).
//
// The tipster profile editor UI edits bio, sports and the subscription price.
// Prices are shown to tipsters in whole currency units (e.g. dollars) but the
// API and database store them as integer cents. These dependency-free helpers
// parse/normalize the form input, convert between currency units and cents, and
// validate the draft so the same rules can be unit-tested and reused. They
// mirror the server-side constraints in the API's UpdateTipsterDto.

/** Limits applied to a tipster profile edit. */
export const TIPSTER_PROFILE_LIMITS = {
  /** Maximum characters allowed in the bio. */
  bioMaxLength: 500,
  /** Maximum number of sports a tipster may list. */
  maxSports: 12,
  /** Maximum characters allowed in a single sport tag. */
  sportMaxLength: 40,
  /** Maximum subscription price in currency units (guards typos / overflow). */
  maxPriceUnits: 10000,
} as const;

/** Raw values as typed into the editor form. */
export interface TipsterProfileDraft {
  bio: string;
  /** Comma-separated sports as typed, or an already-split list. */
  sports: string | string[];
  /** Subscription price in whole currency units (e.g. "9.99"). */
  price: string;
}

/** Normalized payload sent to PATCH /api/tipsters/me. */
export interface TipsterProfilePayload {
  bio: string;
  sports: string[];
  subscriptionPriceCents: number;
}

export interface TipsterProfileValidation {
  valid: boolean;
  /** Human-readable reasons the draft was rejected (empty when valid). */
  errors: string[];
  /** Normalized payload, present only when {@link valid} is true. */
  payload?: TipsterProfilePayload;
}

/**
 * Split a comma-separated sports string (or list) into trimmed, de-duplicated,
 * non-empty tags, preserving first-seen order. Case-insensitive de-duplication.
 */
export function parseSports(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = item.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Format a list of sports back into the comma-separated form input value. */
export function formatSports(sports: string[]): string {
  return sports.join(', ');
}

/**
 * Convert a price in whole currency units to integer cents. Returns null when
 * the input is not a valid, non-negative money amount (max two decimals).
 */
export function priceUnitsToCents(units: string | number): number | null {
  const trimmed = typeof units === 'number' ? String(units) : units.trim();
  if (trimmed === '') return null;
  // Allow an optional leading currency symbol and thousands-free decimals.
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Format integer cents as a whole-currency-unit string for the form input. */
export function centsToPriceUnits(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return '0';
  return (cents / 100).toFixed(2);
}

/** A settled pick as far as the public CLV chart is concerned. */
export interface ClvChartPick {
  /** Closing-line value as a fraction (e.g. 0.023 = +2.3%), or null if ungraded. */
  clv: number | null;
  /** When the pick settled — used only to order the series chronologically. */
  settledAt: string | number | Date | null;
}

/** Data for the public "CLV over time" chart on a tipster profile (OB-011). */
export interface ClvChartData {
  /** Cumulative average CLV in percent, oldest-first (one point per graded pick). */
  points: number[];
  /** Overall average CLV in percent across all graded picks (0 when none). */
  averagePct: number;
  /** Number of settled picks that carried a CLV value. */
  sampleSize: number;
}

function toTime(value: string | number | Date | null): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Build the public CLV chart series from a tipster's settled picks. Only picks
 * with a graded CLV are counted; they are ordered oldest-first and reduced to a
 * running cumulative-average CLV (in percent) so the line shows how the
 * tipster's edge against the closing line has trended. Pure and unit-tested.
 */
export function buildClvChart(picks: ClvChartPick[]): ClvChartData {
  const graded = picks
    .filter((p) => typeof p.clv === 'number' && Number.isFinite(p.clv))
    .sort((a, b) => toTime(a.settledAt) - toTime(b.settledAt));

  const points: number[] = [];
  let sum = 0;
  graded.forEach((p, i) => {
    sum += p.clv as number;
    points.push((sum / (i + 1)) * 100);
  });

  const sampleSize = graded.length;
  const averagePct = sampleSize === 0 ? 0 : (sum / sampleSize) * 100;

  return { points, averagePct, sampleSize };
}

/**
 * Validate and normalize a profile draft. Pure and synchronous so it can run in
 * the browser for instant feedback and be unit-tested; the API re-validates.
 */
export function validateTipsterProfile(
  draft: TipsterProfileDraft,
): TipsterProfileValidation {
  const errors: string[] = [];

  const bio = draft.bio.trim();
  if (bio.length > TIPSTER_PROFILE_LIMITS.bioMaxLength) {
    errors.push(
      `Bio must be at most ${TIPSTER_PROFILE_LIMITS.bioMaxLength} characters`,
    );
  }

  const sports = parseSports(draft.sports);
  if (sports.length > TIPSTER_PROFILE_LIMITS.maxSports) {
    errors.push(
      `List at most ${TIPSTER_PROFILE_LIMITS.maxSports} sports`,
    );
  }
  if (sports.some((s) => s.length > TIPSTER_PROFILE_LIMITS.sportMaxLength)) {
    errors.push(
      `Each sport must be at most ${TIPSTER_PROFILE_LIMITS.sportMaxLength} characters`,
    );
  }

  const subscriptionPriceCents = priceUnitsToCents(draft.price);
  if (subscriptionPriceCents === null) {
    errors.push('Enter a valid price (e.g. 9.99), or 0 for free');
  } else if (
    subscriptionPriceCents >
    TIPSTER_PROFILE_LIMITS.maxPriceUnits * 100
  ) {
    errors.push(
      `Price must be at most ${TIPSTER_PROFILE_LIMITS.maxPriceUnits}`,
    );
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    payload: {
      bio,
      sports,
      subscriptionPriceCents: subscriptionPriceCents as number,
    },
  };
}
