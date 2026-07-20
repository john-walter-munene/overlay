import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCorrelationContext,
  getCorrelationId,
  newCorrelationId,
  resolveCorrelationId,
  runWithCorrelation,
} from './correlation.ts';

test('getCorrelationId is undefined outside any scope', () => {
  assert.equal(getCorrelationId(), undefined);
  assert.equal(getCorrelationContext(), undefined);
});

test('runWithCorrelation exposes the id and kind within the scope', () => {
  runWithCorrelation({ correlationId: 'req-1', kind: 'request' }, () => {
    assert.equal(getCorrelationId(), 'req-1');
    assert.deepEqual(getCorrelationContext(), {
      correlationId: 'req-1',
      kind: 'request',
    });
  });
  // Scope is cleared once the callback returns.
  assert.equal(getCorrelationId(), undefined);
});

test('correlation id propagates across awaited async continuations', async () => {
  const seen = await runWithCorrelation(
    { correlationId: 'job-async', kind: 'job' },
    async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getCorrelationId();
    },
  );
  assert.equal(seen, 'job-async');
});

test('nested scopes shadow and restore the parent id', () => {
  runWithCorrelation({ correlationId: 'outer', kind: 'request' }, () => {
    runWithCorrelation({ correlationId: 'inner', kind: 'job' }, () => {
      assert.equal(getCorrelationId(), 'inner');
    });
    assert.equal(getCorrelationId(), 'outer');
  });
});

test('resolveCorrelationId trusts a supplied non-empty header value', () => {
  assert.equal(resolveCorrelationId('caller-id'), 'caller-id');
  assert.equal(resolveCorrelationId('  spaced  '), 'spaced');
  assert.equal(resolveCorrelationId(['first', 'second']), 'first');
});

test('resolveCorrelationId mints a UUID for absent/blank ids', () => {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.match(resolveCorrelationId(undefined), uuidRe);
  assert.match(resolveCorrelationId(''), uuidRe);
  assert.match(resolveCorrelationId('   '), uuidRe);
  assert.match(resolveCorrelationId([]), uuidRe);
});

test('newCorrelationId returns distinct UUIDs', () => {
  const a = newCorrelationId();
  const b = newCorrelationId();
  assert.notEqual(a, b);
  assert.match(
    a,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
});
