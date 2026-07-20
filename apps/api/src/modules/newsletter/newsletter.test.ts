import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyDigestBody,
  generateNewsletterToken,
  newsletterConfirmationBody,
  newsletterConfirmRequestBody,
  newsletterConfirmUrl,
  newsletterUnsubscribeUrl,
  normalizeSubscriberEmail,
  withNewsletterFooter,
  WEEKLY_DIGEST_SUBJECT,
  type WeeklyDigestPick,
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

test('generateNewsletterToken produces distinct url-safe tokens', () => {
  const a = generateNewsletterToken();
  const b = generateNewsletterToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 20);
});

test('newsletterConfirmUrl / newsletterUnsubscribeUrl embed the encoded token and trim slashes', () => {
  assert.equal(
    newsletterConfirmUrl('https://ex.com/', 'a b'),
    'https://ex.com/newsletter/confirm?token=a%20b',
  );
  assert.equal(
    newsletterUnsubscribeUrl('https://ex.com//', 'tok'),
    'https://ex.com/newsletter/unsubscribe?token=tok',
  );
});

test('newsletterConfirmRequestBody is a double opt-in request carrying the confirm link', () => {
  const url = 'https://ex.com/newsletter/confirm?token=xyz';
  const body = newsletterConfirmRequestBody(url);
  assert.ok(body.includes(url));
  assert.match(body, /confirm/i);
  assert.match(body, /double opt-in/i);
  assert.match(body, /ignore this email/i);
});

test('newsletterConfirmationBody is the post-confirm welcome and mentions the brand', () => {
  const body = newsletterConfirmationBody();
  assert.match(body, /Overlay Bets newsletter/);
  assert.match(body, /Picks of the Week/);
});

test('buildWeeklyDigestBody lists every pick with its tipster and odds', () => {
  const picks: WeeklyDigestPick[] = [
    { tipsterName: 'Ada', market: 'Match Odds', selection: 'Home', oddsAtPick: 2.1 },
    { tipsterName: 'Bo', market: 'BTTS', selection: 'Yes', oddsAtPick: 1.8 },
  ];
  const body = buildWeeklyDigestBody(picks);
  assert.match(body, /Ada: Match Odds .* Home @ 2\.1/);
  assert.match(body, /Bo: BTTS .* Yes @ 1\.8/);
  assert.match(WEEKLY_DIGEST_SUBJECT, /Picks of the Week/);
});

test('withNewsletterFooter appends a one-click unsubscribe line', () => {
  const out = withNewsletterFooter('Hello', 'https://ex.com/u?token=z');
  assert.ok(out.startsWith('Hello'));
  assert.match(out, /Unsubscribe \(one click\): https:\/\/ex\.com\/u\?token=z/);
});
