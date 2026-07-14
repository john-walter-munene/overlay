import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PASSWORD_POLICY,
  isPwnedPassword,
  validatePassword,
} from './password.ts';

test('validatePassword: accepts a strong password', () => {
  const r = validatePassword('Tr0ub4dour&3xyz');
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('validatePassword: rejects passwords below the minimum length', () => {
  const r = validatePassword('Ab3!xy'); // 6 chars
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /at least 8 characters/);
});

test('validatePassword: boundary at exactly the minimum length', () => {
  const belowMin = validatePassword('Ab3!xy9'); // 7 chars
  assert.equal(belowMin.valid, false);

  const atMin = validatePassword('Ab3!xy9z'); // 8 chars
  assert.equal(atMin.valid, true);
});

test('validatePassword: boundary at exactly the maximum length', () => {
  const atMax = 'Aa1' + 'x'.repeat(DEFAULT_PASSWORD_POLICY.maxLength - 3);
  assert.equal(atMax.length, DEFAULT_PASSWORD_POLICY.maxLength);
  assert.equal(validatePassword(atMax).valid, true);

  const overMax = atMax + 'y';
  const r = validatePassword(overMax);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /at most 128 characters/);
});

test('validatePassword: rejects common passwords (case-insensitive)', () => {
  for (const weak of ['password', 'PASSWORD', 'Password1', 'letmein']) {
    const r = validatePassword(weak);
    assert.equal(r.valid, false, `${weak} should be rejected`);
    assert.match(r.errors.join(' '), /too common/);
  }
});

test('validatePassword: rejects a single repeated character', () => {
  const r = validatePassword('aaaaaaaa');
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /repeated character/);
});

test('validatePassword: rejects ascending and descending sequences', () => {
  assert.equal(validatePassword('12345678').valid, false);
  assert.equal(validatePassword('abcdefgh').valid, false);
  assert.equal(validatePassword('87654321').valid, false);
});

test('validatePassword: rejects an empty string', () => {
  const r = validatePassword('');
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /at least 8 characters/);
});

test('validatePassword: honours a custom policy', () => {
  const policy = { minLength: 12, maxLength: 64 };
  assert.equal(validatePassword('Ab3!xy9zQ', policy).valid, false); // 9 chars
  assert.equal(validatePassword('Ab3!xy9zQwer', policy).valid, true); // 12 chars
});

test('isPwnedPassword: returns true when the suffix is found', async () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const fakeFetch = (async () =>
    new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\nAAAA:1')) as typeof fetch;
  assert.equal(await isPwnedPassword('password', fakeFetch), true);
});

test('isPwnedPassword: returns false when the suffix is absent', async () => {
  const fakeFetch = (async () => new Response('AAAA:1\nBBBB:2')) as typeof fetch;
  assert.equal(await isPwnedPassword('a-fresh-password', fakeFetch), false);
});

test('isPwnedPassword: fails open on network error', async () => {
  const fakeFetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  assert.equal(await isPwnedPassword('password', fakeFetch), false);
});
