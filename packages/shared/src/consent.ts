// Pure cookie-consent helpers (OB-140).
//
// The web app shows a cookie-consent banner and must remember the visitor's
// choice across reloads. These dependency-free helpers serialize/parse the
// stored consent record and decide whether the banner still needs to be shown,
// so the persistence rules can be unit-tested and reused by the React UI (which
// just wires them to localStorage).

/** Storage key used to persist the visitor's consent decision. */
export const CONSENT_STORAGE_KEY = 'overlay.cookie-consent';

/**
 * Current consent policy version. Bump this when the cookie/privacy policy
 * changes materially so returning visitors are re-prompted.
 */
export const CONSENT_VERSION = 1;

/** Whether the visitor accepted or rejected non-essential cookies. */
export type ConsentStatus = 'accepted' | 'rejected';

/** Persisted record of a visitor's consent decision. */
export interface ConsentRecord {
  status: ConsentStatus;
  /** Policy version the decision was made against. */
  version: number;
  /** ISO-8601 timestamp of when the decision was recorded. */
  timestamp: string;
}

function isConsentStatus(value: unknown): value is ConsentStatus {
  return value === 'accepted' || value === 'rejected';
}

/**
 * Build a consent record for the current policy version. `now` is injectable so
 * the timestamp is deterministic in tests.
 */
export function createConsent(
  status: ConsentStatus,
  now: Date = new Date(),
): ConsentRecord {
  return {
    status,
    version: CONSENT_VERSION,
    timestamp: now.toISOString(),
  };
}

/** Serialize a consent record for storage. */
export function serializeConsent(record: ConsentRecord): string {
  return JSON.stringify(record);
}

/**
 * Parse a stored consent value. Returns null when the value is missing or not a
 * well-formed consent record, so callers can treat corrupt data as "no
 * decision yet".
 */
export function parseConsent(
  raw: string | null | undefined,
): ConsentRecord | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isConsentStatus(record.status)) return null;
  if (typeof record.version !== 'number') return null;
  if (typeof record.timestamp !== 'string') return null;
  return {
    status: record.status,
    version: record.version,
    timestamp: record.timestamp,
  };
}

/**
 * Whether the consent banner still needs to be shown. True when there is no
 * stored decision, the stored value is corrupt, or it was made against an older
 * policy version (so the visitor is re-prompted after a policy change).
 */
export function needsConsent(raw: string | null | undefined): boolean {
  const record = parseConsent(raw);
  if (!record) return true;
  return record.version !== CONSENT_VERSION;
}
