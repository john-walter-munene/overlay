/**
 * Password strength policy (OB-005).
 *
 * A small, dependency-free validator shared by the API and web so that the
 * same rules and messages are enforced on signup and password reset. The
 * policy is NIST 800-63B aligned: length is the primary signal and obviously
 * weak passwords (common, repeated, or sequential) are rejected rather than
 * relying on brittle composition rules.
 */

export interface PasswordPolicy {
  /** Minimum number of characters. */
  minLength: number;
  /** Maximum number of characters (guards against hashing DoS). */
  maxLength: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 128,
};

/**
 * A small blocklist of the most common weak passwords. This is intentionally
 * short; the full breach check is delegated to {@link isPwnedPassword}.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwertyuiop',
  'letmein',
  'iloveyou',
  'admin',
  'welcome',
  'monkey',
  'football',
  'abc12345',
  'baseball',
  'dragon',
  'sunshine',
  'princess',
  'trustno1',
]);

export interface PasswordValidationResult {
  valid: boolean;
  /** Human-readable reasons the password was rejected (empty when valid). */
  errors: string[];
}

/** True when the string is a single character repeated (e.g. "aaaaaaaa"). */
function isSingleRepeatedChar(value: string): boolean {
  return value.length > 0 && [...value].every((c) => c === value[0]);
}

/**
 * True when the string is a run of sequential characters, ascending or
 * descending (e.g. "12345678", "abcdefgh", "87654321").
 */
function isSequential(value: string): boolean {
  if (value.length < 2) return false;
  const deltas = new Set<number>();
  for (let i = 1; i < value.length; i++) {
    deltas.add(value.charCodeAt(i) - value.charCodeAt(i - 1));
  }
  return deltas.size === 1 && (deltas.has(1) || deltas.has(-1));
}

/**
 * Validate a password against the policy. Pure and synchronous so it can be
 * unit tested and run in the browser; the optional network breach check lives
 * in {@link isPwnedPassword}.
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordValidationResult {
  const errors: string[] = [];

  if (typeof password !== 'string' || password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (typeof password === 'string' && password.length > policy.maxLength) {
    errors.push(`Password must be at most ${policy.maxLength} characters`);
  }

  const normalized = typeof password === 'string' ? password.toLowerCase() : '';
  if (COMMON_PASSWORDS.has(normalized)) {
    errors.push('Password is too common; choose something less guessable');
  } else if (normalized.length > 0 && isSingleRepeatedChar(normalized)) {
    errors.push('Password cannot be a single repeated character');
  } else if (normalized.length > 0 && isSequential(normalized)) {
    errors.push('Password cannot be a sequence of characters');
  }

  return { valid: errors.length === 0, errors };
}

async function sha1Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Check a password against the Have I Been Pwned range API using k-anonymity:
 * only the first 5 characters of the SHA-1 hash are sent, and the suffix is
 * matched locally so the plaintext never leaves the process.
 *
 * Network/parse failures fail open (returns `false`) so an outage of the
 * external service never blocks a legitimate signup.
 */
export async function isPwnedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetchImpl(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { headers: { 'Add-Padding': 'true' } },
    );
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':');
      if (candidate === suffix) return Number(count) > 0;
    }
    return false;
  } catch {
    return false;
  }
}
