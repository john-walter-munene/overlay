import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PRERENDERED_TIPSTERS,
  tipsterStaticParams,
} from './api.ts';

test('tipsterStaticParams maps sitemap entries to route params', () => {
  const params = tipsterStaticParams([
    { tipsterId: 'a' },
    { tipsterId: 'b' },
  ]);
  assert.deepEqual(params, [{ id: 'a' }, { id: 'b' }]);
});

test('tipsterStaticParams drops blank and duplicate ids', () => {
  const params = tipsterStaticParams([
    { tipsterId: 'a' },
    { tipsterId: '  ' },
    { tipsterId: 'a' },
    { tipsterId: ' b ' },
  ]);
  assert.deepEqual(params, [{ id: 'a' }, { id: 'b' }]);
});

test('tipsterStaticParams caps the number pre-rendered at build', () => {
  const entries = Array.from({ length: MAX_PRERENDERED_TIPSTERS + 25 }, (_, i) => ({
    tipsterId: `t${i}`,
  }));
  const params = tipsterStaticParams(entries);
  assert.equal(params.length, MAX_PRERENDERED_TIPSTERS);
  assert.deepEqual(params[0], { id: 't0' });

  // An explicit lower limit is honoured too.
  assert.equal(tipsterStaticParams(entries, 5).length, 5);
});

test('tipsterStaticParams returns an empty list for no entries', () => {
  assert.deepEqual(tipsterStaticParams([]), []);
});
