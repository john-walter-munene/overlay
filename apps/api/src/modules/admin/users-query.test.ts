import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_USERS_PAGE_SIZE,
  MAX_USERS_PAGE_SIZE,
  normalizeUsersQuery,
  paginateUsers,
} from './users-query.ts';

test('normalizeUsersQuery: sane defaults for empty input', () => {
  assert.deepEqual(normalizeUsersQuery(), {
    search: null,
    page: 1,
    pageSize: DEFAULT_USERS_PAGE_SIZE,
  });
});

test('normalizeUsersQuery: trims search and parses paging', () => {
  const q = normalizeUsersQuery({ q: '  Alice ', page: '3', pageSize: '10' });
  assert.equal(q.search, 'Alice');
  assert.equal(q.page, 3);
  assert.equal(q.pageSize, 10);
});

test('normalizeUsersQuery: blank search collapses to null', () => {
  assert.equal(normalizeUsersQuery({ q: '   ' }).search, null);
});

test('normalizeUsersQuery: clamps and falls back on invalid values', () => {
  const q = normalizeUsersQuery({ page: '0', pageSize: '999' });
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, MAX_USERS_PAGE_SIZE);

  const bad = normalizeUsersQuery({ page: 'x', pageSize: '-4' });
  assert.equal(bad.page, 1);
  assert.equal(bad.pageSize, DEFAULT_USERS_PAGE_SIZE);
});

test('paginateUsers: first page window', () => {
  const w = paginateUsers(45, { page: 1, pageSize: 20 });
  assert.deepEqual(w, {
    page: 1,
    pageSize: 20,
    totalPages: 3,
    skip: 0,
    take: 20,
  });
});

test('paginateUsers: middle page offsets by skip', () => {
  const w = paginateUsers(45, { page: 2, pageSize: 20 });
  assert.equal(w.skip, 20);
  assert.equal(w.take, 20);
  assert.equal(w.page, 2);
});

test('paginateUsers: out-of-range page clamps to last page', () => {
  const w = paginateUsers(45, { page: 9, pageSize: 20 });
  assert.equal(w.page, 3);
  assert.equal(w.skip, 40);
  assert.equal(w.totalPages, 3);
});

test('paginateUsers: empty result set reports one page', () => {
  const w = paginateUsers(0, { page: 1, pageSize: 20 });
  assert.equal(w.totalPages, 1);
  assert.equal(w.page, 1);
  assert.equal(w.skip, 0);
});
