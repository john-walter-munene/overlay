import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  countWords,
  readingTimeMinutes,
  excerpt,
  dedupeSlug,
} from './content.ts';

test('slugify lowercases and hyphenates', () => {
  assert.equal(slugify('Beat The Closing Line'), 'beat-the-closing-line');
});

test('slugify strips diacritics, quotes and punctuation', () => {
  assert.equal(slugify("Café's Über-Value!!"), 'cafes-uber-value');
});

test('slugify collapses runs and trims hyphens', () => {
  assert.equal(slugify('  --Hello   World--  '), 'hello-world');
});

test('countWords ignores markdown punctuation and code', () => {
  assert.equal(countWords('# Title\n\nHello **world** `x=1` [link](/a)'), 4);
});

test('readingTimeMinutes is at least 1 for real content', () => {
  assert.equal(readingTimeMinutes('one two three'), 1);
  assert.equal(readingTimeMinutes(''), 0);
});

test('readingTimeMinutes scales with length', () => {
  const words = Array.from({ length: 450 }, () => 'word').join(' ');
  assert.equal(readingTimeMinutes(words), 2);
});

test('excerpt cuts on a word boundary and appends ellipsis', () => {
  const body = 'The overlay is the gap between offered odds and true probability. '.repeat(
    5,
  );
  const out = excerpt(body, 60);
  assert.ok(out.length <= 61);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('  '));
});

test('excerpt returns full text when short', () => {
  assert.equal(excerpt('short body'), 'short body');
});

test('dedupeSlug appends numeric suffixes', () => {
  const taken = new Set(['post', 'post-2']);
  assert.equal(dedupeSlug('fresh', taken), 'fresh');
  assert.equal(dedupeSlug('post', taken), 'post-3');
});
