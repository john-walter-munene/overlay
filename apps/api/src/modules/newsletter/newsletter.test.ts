import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSubscriberEmail,
  newsletterConfirmationBody,
} from './newsletter.ts';

test('normalizeSubscriberEmail trims and lowercases', () => {
  assert.equal(normalizeSubscriberEmail('  Foo@Example.COM '), 'foo@example.com');
});

test('normalizeSubscriberEmail rejects empty or whitespace-only input', () => {
  assert.equal(normalizeSubscriberEmail(''), null);
  assert.equal(normalizeSubscriberEmail('   '), null);
});

test('normalizeSubscriberEmail rejects malformed addresses', () => {
  const bad = [
    'plainaddress',
    'no@domain',
    '@no-local.com',
    'spaces in@x.com',
    'a@b',
  ];
  for (const value of bad) {
    assert.equal(
      normalizeSubscriberEmail(value),
      null,
      `expected "${value}" to be rejected`,
    );
  }
});

test('normalizeSubscriberEmail rejects over-long addresses', () => {
  const long = `${'a'.repeat(201)}@example.com`;
  assert.equal(normalizeSubscriberEmail(long), null);
});

test('normalizeSubscriberEmail accepts a valid address with plus tag and subdomain', () => {
  assert.equal(
    normalizeSubscriberEmail('user.name+tag@sub.example.co'),
    'user.name+tag@sub.example.co',
  );
});

test('newsletterConfirmationBody includes the brand and an opt-out line', () => {
  const body = newsletterConfirmationBody();
  assert.match(body, /Overlay Bets newsletter/);
  assert.match(body, /ignore this email/);
});
