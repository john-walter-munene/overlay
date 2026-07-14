import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGE_GATE_STORAGE_KEY,
  AGE_GATE_VERSION,
  MINIMUM_AGE,
  createAgeConfirmation,
  serializeAgeConfirmation,
  parseAgeConfirmation,
  needsAgeConfirmation,
} from './age-gate.ts';

test('createAgeConfirmation stamps the current version and an ISO timestamp', () => {
  const now = new Date('2026-07-14T12:00:00.000Z');
  const record = createAgeConfirmation(now);
  assert.equal(record.confirmed, true);
  assert.equal(record.version, AGE_GATE_VERSION);
  assert.equal(record.timestamp, '2026-07-14T12:00:00.000Z');
});

test('serializeAgeConfirmation and parseAgeConfirmation round-trip', () => {
  const record = createAgeConfirmation(new Date('2026-01-01T00:00:00.000Z'));
  const raw = serializeAgeConfirmation(record);
  assert.deepEqual(parseAgeConfirmation(raw), record);
});

test('parseAgeConfirmation returns null for missing or corrupt values', () => {
  assert.equal(parseAgeConfirmation(null), null);
  assert.equal(parseAgeConfirmation(undefined), null);
  assert.equal(parseAgeConfirmation(''), null);
  assert.equal(parseAgeConfirmation('not json'), null);
  assert.equal(parseAgeConfirmation('{"confirmed":false,"version":1,"timestamp":"x"}'), null);
  assert.equal(parseAgeConfirmation('{"confirmed":true,"timestamp":"x"}'), null);
  assert.equal(parseAgeConfirmation('123'), null);
});

test('needsAgeConfirmation is true without a valid, current confirmation', () => {
  assert.equal(needsAgeConfirmation(null), true);
  assert.equal(needsAgeConfirmation('garbage'), true);
});

test('needsAgeConfirmation is false once a confirmation for the current version exists', () => {
  const confirmed = serializeAgeConfirmation(createAgeConfirmation());
  assert.equal(needsAgeConfirmation(confirmed), false);
});

test('needsAgeConfirmation re-prompts when the stored version is outdated', () => {
  const stale = serializeAgeConfirmation({
    confirmed: true,
    version: AGE_GATE_VERSION - 1,
    timestamp: new Date().toISOString(),
  });
  assert.equal(needsAgeConfirmation(stale), true);
});

test('AGE_GATE_STORAGE_KEY and MINIMUM_AGE are stable', () => {
  assert.equal(AGE_GATE_STORAGE_KEY, 'overlay.age-gate');
  assert.equal(MINIMUM_AGE, 18);
});
