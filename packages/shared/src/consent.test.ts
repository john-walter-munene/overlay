import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  createConsent,
  serializeConsent,
  parseConsent,
  needsConsent,
} from './consent.ts';

test('createConsent stamps the current version and an ISO timestamp', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const record = createConsent('accepted', now);
  assert.equal(record.status, 'accepted');
  assert.equal(record.version, CONSENT_VERSION);
  assert.equal(record.timestamp, '2026-07-14T12:00:00.000Z');
});

test('serializeConsent and parseConsent round-trip', () => {
  const record = createConsent('rejected', new Date('2026-01-01T00:00:00.000Z'));
  const raw = serializeConsent(record);
  assert.deepEqual(parseConsent(raw), record);
});

test('parseConsent returns null for missing or corrupt values', () => {
  assert.equal(parseConsent(null), null);
  assert.equal(parseConsent(undefined), null);
  assert.equal(parseConsent(''), null);
  assert.equal(parseConsent('not json'), null);
  assert.equal(parseConsent('{"status":"maybe","version":1,"timestamp":"x"}'), null);
  assert.equal(parseConsent('{"status":"accepted","timestamp":"x"}'), null);
  assert.equal(parseConsent('123'), null);
});

test('needsConsent is true without a valid, current decision', () => {
  assert.equal(needsConsent(null), true);
  assert.equal(needsConsent('garbage'), true);
});

test('needsConsent is false once a decision for the current version exists', () => {
  const accepted = serializeConsent(createConsent('accepted'));
  const rejected = serializeConsent(createConsent('rejected'));
  assert.equal(needsConsent(accepted), false);
  assert.equal(needsConsent(rejected), false);
});

test('needsConsent re-prompts when the stored version is outdated', () => {
  const stale = serializeConsent({
    status: 'accepted',
    version: CONSENT_VERSION - 1,
    timestamp: new Date().toISOString(),
  });
  assert.equal(needsConsent(stale), true);
});

test('CONSENT_STORAGE_KEY is stable', () => {
  assert.equal(CONSENT_STORAGE_KEY, 'overlay.cookie-consent');
});
