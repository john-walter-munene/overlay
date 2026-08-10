/**
 * Pure, framework-agnostic helpers for the account settings page (OB-006).
 *
 * Kept free of React / Supabase imports so the client-side validation and the
 * irreversible-delete confirmation gate can be unit-tested with `node --test`.
 */

/** Minimum password length — mirrors the signup form and Supabase's default policy. */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Validate a new password before sending it to Supabase. Returns a
 * user-facing error message, or `null` when the password is acceptable.
 */
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** The exact phrase a user must type to confirm irreversible account deletion. */
export const DELETE_CONFIRM_PHRASE = 'DELETE';

/**
 * True when the typed confirmation matches the required phrase. Case-sensitive
 * (so an accidental "delete" doesn't pass) but tolerant of surrounding
 * whitespace.
 */
export function isDeleteConfirmed(input: string): boolean {
  return input.trim() === DELETE_CONFIRM_PHRASE;
}
