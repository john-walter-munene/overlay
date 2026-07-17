/**
 * Pure newsletter helpers (no framework deps) so they run under
 * `node --experimental-strip-types` in unit tests.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize and validate a newsletter email. Trims, lowercases, and checks a
 * basic shape + length. Returns the normalized email, or null if invalid.
 */
export function normalizeSubscriberEmail(raw: string): string | null {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email || email.length > 200) return null;
  if (!EMAIL_SHAPE.test(email)) return null;
  return email;
}

/** Plain-text body for the subscription confirmation email. */
export function newsletterConfirmationBody(): string {
  return [
    'Thanks for subscribing to the Overlay Bets newsletter.',
    '',
    'You will get product updates, verified-tipster insights and closing line',
    'value education — no spam.',
    '',
    'If you did not sign up, you can ignore this email and you will not hear',
    'from us again.',
    '',
    '— The Overlay Bets team',
  ].join('\n');
}
