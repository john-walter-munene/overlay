import test from 'node:test';
import assert from 'node:assert/strict';

import { collectAdvisories, isExpired, triage } from './audit-ci.mjs';

const GATED = new Set(['high', 'critical']);

test('collectAdvisories dedupes advisory objects by source and lowercases severity', () => {
  const auditJson = {
    vulnerabilities: {
      next: {
        via: [
          { source: 111, name: 'next', severity: 'HIGH', title: 'a', url: 'u1' },
          { source: 111, name: 'next', severity: 'high', title: 'a', url: 'u1' },
          'react', // string via entries are ignored
        ],
      },
      tmp: {
        via: [{ source: 222, name: 'tmp', severity: 'high', title: 'b', url: 'u2' }],
      },
    },
  };
  const advisories = collectAdvisories(auditJson);
  assert.equal(advisories.length, 2);
  const byName = Object.fromEntries(advisories.map((a) => [a.name, a]));
  assert.equal(byName.next.source, '111');
  assert.equal(byName.next.severity, 'high');
});

test('isExpired only returns true for past expiry dates', () => {
  const now = Date.parse('2026-07-20');
  assert.equal(isExpired({ expires: '2025-01-01' }, now), true);
  assert.equal(isExpired({ expires: '2027-01-01' }, now), false);
  assert.equal(isExpired({}, now), false); // no expiry => never expires
  assert.equal(isExpired(undefined, now), false);
});

test('triage separates untriaged, triaged and expired advisories', () => {
  const advisories = [
    { source: '1', name: 'a', severity: 'high' }, // untriaged
    { source: '2', name: 'b', severity: 'high' }, // triaged
    { source: '3', name: 'c', severity: 'high' }, // expired
    { source: '4', name: 'd', severity: 'moderate' }, // below gate, ignored
  ];
  const allowlist = {
    2: { reason: 'ok' },
    3: { reason: 'stale', expires: '2020-01-01' },
  };
  const now = Date.parse('2026-07-20');
  const { untriaged, triaged, expired } = triage(advisories, allowlist, GATED, now);

  assert.deepEqual(untriaged.map((a) => a.source), ['1']);
  assert.deepEqual(triaged.map((t) => t.adv.source), ['2']);
  assert.deepEqual(expired.map((e) => e.adv.source), ['3']);
});

test('triage passes cleanly when every gated advisory is allow-listed', () => {
  const advisories = [{ source: '9', name: 'x', severity: 'critical' }];
  const { untriaged, expired } = triage(
    advisories,
    { 9: { reason: 'accepted' } },
    GATED,
    Date.now(),
  );
  assert.equal(untriaged.length, 0);
  assert.equal(expired.length, 0);
});
