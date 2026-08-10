import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayTranslations,
  needsTranslation,
  type LocalizableCard,
} from './articles.i18n.ts';

const base: (LocalizableCard & { tags: string[] })[] = [
  { slug: 'a', title: 'A', excerpt: 'ex-a', coverImage: 'a.png', tags: ['x'] },
  { slug: 'b', title: 'B', excerpt: 'ex-b', coverImage: null, tags: ['y'] },
];

test('overlayTranslations replaces display fields for matched slugs', () => {
  const out = overlayTranslations(base, [
    { slug: 'a', title: 'Ä', excerpt: 'ex-ä', coverImage: 'a-de.png' },
  ]);
  assert.equal(out[0].title, 'Ä');
  assert.equal(out[0].excerpt, 'ex-ä');
  assert.equal(out[0].coverImage, 'a-de.png');
  // Canonical metadata is preserved from the English source.
  assert.deepEqual(out[0].tags, ['x']);
});

test('overlayTranslations falls back to English for unmatched slugs', () => {
  const out = overlayTranslations(base, [
    { slug: 'a', title: 'Ä', excerpt: 'ex-ä', coverImage: null },
  ]);
  // b has no translation → unchanged English row.
  assert.equal(out[1].title, 'B');
  assert.equal(out[1].excerpt, 'ex-b');
});

test('overlayTranslations keeps English cover image when translation omits it', () => {
  const out = overlayTranslations(base, [
    { slug: 'a', title: 'Ä', excerpt: 'ex-ä', coverImage: null },
  ]);
  assert.equal(out[0].coverImage, 'a.png');
});

test('overlayTranslations preserves base ordering', () => {
  const out = overlayTranslations(base, [
    { slug: 'b', title: 'Bee', excerpt: 'e', coverImage: null },
    { slug: 'a', title: 'Ay', excerpt: 'e', coverImage: null },
  ]);
  assert.deepEqual(
    out.map((r) => r.slug),
    ['a', 'b'],
  );
});

test('needsTranslation is true only for non-English, non-empty locales', () => {
  assert.equal(needsTranslation('fr'), true);
  assert.equal(needsTranslation('en'), false);
  assert.equal(needsTranslation(''), false);
  assert.equal(needsTranslation('   '), false);
});
