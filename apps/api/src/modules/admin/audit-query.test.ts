import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_PAGE_SIZE,
  buildAuditLogWhere,
  normalizeAuditLogQuery,
  paginateAuditLog,
} from './audit-query.ts';

test('normalizeAuditLogQuery: sane defaults for empty input', () => {
  assert.deepEqual(normalizeAuditLogQuery(), {
    entity: null,
    actor: null,
    action: null,
    from: null,
    to: null,
    page: 1,
    pageSize: DEFAULT_AUDIT_PAGE_SIZE,
  });
});

test('normalizeAuditLogQuery: trims filters and parses paging', () => {
  const q = normalizeAuditLogQuery({
    entity: '  Tipster ',
    actor: ' admin:1 ',
    action: ' role.changed ',
    page: '3',
    pageSize: '10',
  });
  assert.equal(q.entity, 'Tipster');
  assert.equal(q.actor, 'admin:1');
  assert.equal(q.action, 'role.changed');
  assert.equal(q.page, 3);
  assert.equal(q.pageSize, 10);
});

test('normalizeAuditLogQuery: blank filters collapse to null', () => {
  const q = normalizeAuditLogQuery({ entity: '   ', actor: '', action: '  ' });
  assert.equal(q.entity, null);
  assert.equal(q.actor, null);
  assert.equal(q.action, null);
});

test('normalizeAuditLogQuery: clamps and falls back on invalid paging', () => {
  const q = normalizeAuditLogQuery({ page: '0', pageSize: '999' });
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, MAX_AUDIT_PAGE_SIZE);

  const bad = normalizeAuditLogQuery({ page: 'x', pageSize: '-4' });
  assert.equal(bad.page, 1);
  assert.equal(bad.pageSize, DEFAULT_AUDIT_PAGE_SIZE);
});

test('normalizeAuditLogQuery: parses valid date range to UTC day bounds', () => {
  const q = normalizeAuditLogQuery({ from: '2026-01-01', to: '2026-01-31' });
  assert.equal(q.from?.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(q.to?.toISOString(), '2026-01-31T23:59:59.999Z');
});

test('normalizeAuditLogQuery: ignores malformed dates', () => {
  const q = normalizeAuditLogQuery({ from: '01/01/2026', to: '2026-13-40' });
  assert.equal(q.from, null);
  assert.equal(q.to, null);
});

test('buildAuditLogWhere: filter by entity produces an exact match', () => {
  const where = buildAuditLogWhere(normalizeAuditLogQuery({ entity: 'Tipster' }));
  assert.deepEqual(where, { entity: 'Tipster' });
});

test('buildAuditLogWhere: empty query matches everything', () => {
  assert.deepEqual(buildAuditLogWhere(normalizeAuditLogQuery()), {});
});

test('buildAuditLogWhere: actor and action use insensitive contains', () => {
  const where = buildAuditLogWhere(
    normalizeAuditLogQuery({ actor: 'admin:1', action: 'role' }),
  );
  assert.deepEqual(where.actor, { contains: 'admin:1', mode: 'insensitive' });
  assert.deepEqual(where.action, { contains: 'role', mode: 'insensitive' });
});

test('buildAuditLogWhere: date range bounds createdAt', () => {
  const where = buildAuditLogWhere(
    normalizeAuditLogQuery({ from: '2026-01-01', to: '2026-01-31' }),
  );
  assert.equal(where.createdAt?.gte?.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(where.createdAt?.lte?.toISOString(), '2026-01-31T23:59:59.999Z');
});

test('buildAuditLogWhere: only from bound omits lte', () => {
  const where = buildAuditLogWhere(normalizeAuditLogQuery({ from: '2026-01-01' }));
  assert.ok(where.createdAt?.gte);
  assert.equal(where.createdAt?.lte, undefined);
});

test('paginateAuditLog: first page window', () => {
  const w = paginateAuditLog(60, { page: 1, pageSize: 25 });
  assert.deepEqual(w, {
    page: 1,
    pageSize: 25,
    totalPages: 3,
    skip: 0,
    take: 25,
  });
});

test('paginateAuditLog: out-of-range page clamps to last page', () => {
  const w = paginateAuditLog(60, { page: 9, pageSize: 25 });
  assert.equal(w.page, 3);
  assert.equal(w.skip, 50);
  assert.equal(w.totalPages, 3);
});

test('paginateAuditLog: empty result set reports one page', () => {
  const w = paginateAuditLog(0, { page: 1, pageSize: 25 });
  assert.equal(w.totalPages, 1);
  assert.equal(w.page, 1);
  assert.equal(w.skip, 0);
});
