import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_CONFIRM_PHRASE,
  MIN_PASSWORD_LENGTH,
  isDeleteConfirmed,
  validateNewPassword,
} from './account.ts';

test('validateNewPassword accepts a password at or above the minimum length', () => {
  // Happy path: exactly the minimum, and comfortably above it.
  assert.equal(validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH)), null);
  assert.equal(validateNewPassword('a-perfectly-fine-passphrase'), null);
});

test('validateNewPassword rejects a too-short password with a clear message', () => {
  // Error path: one char under the minimum, and empty input.
  const short = validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1));
  assert.equal(short, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  assert.equal(
    validateNewPassword(''),
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  );
});

test('isDeleteConfirmed accepts the exact phrase, tolerating surrounding whitespace', () => {
  assert.equal(isDeleteConfirmed(DELETE_CONFIRM_PHRASE), true);
  assert.equal(isDeleteConfirmed(`  ${DELETE_CONFIRM_PHRASE}  `), true);
});

test('isDeleteConfirmed rejects wrong case, partial, or empty confirmation', () => {
  assert.equal(isDeleteConfirmed('delete'), false);
  assert.equal(isDeleteConfirmed('DELET'), false);
  assert.equal(isDeleteConfirmed(''), false);
  assert.equal(isDeleteConfirmed('DELETE ME'), false);
});
