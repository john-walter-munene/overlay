// Pure age-gate helpers (OB-142).
//
// Overlay Bets shows an age-confirmation gate on entry and must remember the
// visitor's confirmation across reloads. These dependency-free helpers
// serialize/parse the stored confirmation record and decide whether the gate
// still needs to be shown, so the persistence rules can be unit-tested and
// reused by the React UI (which just wires them to localStorage).

/** Storage key used to persist the visitor's age confirmation. */
export const AGE_GATE_STORAGE_KEY = 'overlay.age-gate';

/**
 * Current age-gate policy version. Bump this when the minimum age or gate policy
 * changes materially so returning visitors are re-prompted.
 */
export const AGE_GATE_VERSION = 1;

/** Minimum age required to use Overlay Bets. */
export const MINIMUM_AGE = 18;

/** Persisted record of a visitor's age confirmation. */
export interface AgeGateRecord {
  /** Whether the visitor confirmed they meet the minimum age. */
  confirmed: true;
  /** Policy version the confirmation was made against. */
  version: number;
  /** ISO-8601 timestamp of when the confirmation was recorded. */
  timestamp: string;
}

/**
 * Build an age-confirmation record for the current policy version. `now` is
 * injectable so the timestamp is deterministic in tests.
 */
export function createAgeConfirmation(now: Date = new Date()): AgeGateRecord {
  return {
    confirmed: true,
    version: AGE_GATE_VERSION,
    timestamp: now.toISOString(),
  };
}

/** Serialize an age-confirmation record for storage. */
export function serializeAgeConfirmation(record: AgeGateRecord): string {
  return JSON.stringify(record);
}

/**
 * Parse a stored age-confirmation value. Returns null when the value is missing
 * or not a well-formed confirmation record, so callers can treat corrupt data
 * as "not confirmed yet".
 */
export function parseAgeConfirmation(
  raw: string | null | undefined,
): AgeGateRecord | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.confirmed !== true) return null;
  if (typeof record.version !== 'number') return null;
  if (typeof record.timestamp !== 'string') return null;
  return {
    confirmed: true,
    version: record.version,
    timestamp: record.timestamp,
  };
}

/**
 * Whether the age gate still needs to be shown. True when there is no stored
 * confirmation, the stored value is corrupt, or it was made against an older
 * policy version (so the visitor is re-prompted after a policy change).
 */
export function needsAgeConfirmation(raw: string | null | undefined): boolean {
  const record = parseAgeConfirmation(raw);
  if (!record) return true;
  return record.version !== AGE_GATE_VERSION;
}
