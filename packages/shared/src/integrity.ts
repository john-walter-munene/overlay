import { createHash, randomBytes } from 'node:crypto';

/** Canonical fields that are locked into a pick's hash. */
export interface PickPayload {
  tipsterId: string;
  eventId: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
}

/**
 * Deterministic canonical serialization of a pick payload.
 * Field order is fixed so the same pick always hashes identically.
 */
export function canonicalizePick(payload: PickPayload): string {
  return [
    payload.tipsterId,
    payload.eventId,
    payload.market,
    payload.selection,
    payload.oddsAtPick.toString(),
    payload.stakeUnits.toString(),
  ].join('|');
}

/** Generate a random per-pick nonce (hex). */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Compute the tamper-evident hash for a pick.
 *   hash = SHA256(canonical(payload) + nonce + pepper)
 * The server-side pepper prevents forging hashes from public fields alone.
 */
export function hashPick(
  payload: PickPayload,
  nonce: string,
  pepper: string,
): string {
  return createHash('sha256')
    .update(canonicalizePick(payload))
    .update(nonce)
    .update(pepper)
    .digest('hex');
}

/** Constant-time-ish verification that a stored hash matches a payload. */
export function verifyPick(
  payload: PickPayload,
  nonce: string,
  pepper: string,
  expectedHash: string,
): boolean {
  return hashPick(payload, nonce, pepper) === expectedHash;
}
