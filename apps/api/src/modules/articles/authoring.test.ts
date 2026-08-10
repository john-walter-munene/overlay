import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAuthorArticles,
  canManageArticle,
  isArticleModerator,
  resolveArticleStatus,
} from './authoring.ts';

const admin = { userId: 'admin-1', role: 'admin' as const };
const staff = { userId: 's-1', role: 'staff' as const };
const tipster = { userId: 't-1', role: 'tipster' as const };
const user = { userId: 'u-1', role: 'user' as const };

test('admins can always author', () => {
  assert.equal(canAuthorArticles(admin), true);
  assert.equal(canAuthorArticles(admin, null), true);
});

test('approved (active) tipsters can author', () => {
  assert.equal(canAuthorArticles(tipster, { status: 'active' }), true);
});

test('suspended or unknown tipsters cannot author', () => {
  assert.equal(canAuthorArticles(tipster, { status: 'suspended' }), false);
  assert.equal(canAuthorArticles(tipster, null), false);
  assert.equal(canAuthorArticles(tipster, undefined), false);
});

test('plain users can never author', () => {
  assert.equal(canAuthorArticles(user, { status: 'active' }), false);
});

test('staff moderate content but are not authors', () => {
  assert.equal(isArticleModerator('staff'), true);
  assert.equal(isArticleModerator('admin'), true);
  assert.equal(isArticleModerator('tipster'), false);
  assert.equal(isArticleModerator('user'), false);
  assert.equal(canAuthorArticles(staff), false);
  assert.equal(canAuthorArticles(staff, { status: 'active' }), false);
});

test('admins can manage any article', () => {
  assert.equal(canManageArticle(admin, { authorId: 'someone-else' }), true);
});

test('staff can manage any article (moderation)', () => {
  assert.equal(canManageArticle(staff, { authorId: 'someone-else' }), true);
  assert.equal(canManageArticle(staff, { authorId: 's-1' }), true);
});

test('tipsters can manage only their own articles', () => {
  assert.equal(canManageArticle(tipster, { authorId: 't-1' }), true);
  assert.equal(canManageArticle(tipster, { authorId: 't-2' }), false);
});

test('plain users cannot manage articles', () => {
  assert.equal(canManageArticle(user, { authorId: 'u-1' }), false);
});

test('admins may set any status directly, including published', () => {
  assert.equal(resolveArticleStatus(admin, 'published'), 'published');
  assert.equal(resolveArticleStatus(admin, 'draft'), 'draft');
  assert.equal(resolveArticleStatus(admin, 'pending'), 'pending');
  assert.equal(resolveArticleStatus(admin, 'archived'), 'archived');
});

test('staff may set any status directly (approve/publish pending posts)', () => {
  assert.equal(resolveArticleStatus(staff, 'published'), 'published');
  assert.equal(resolveArticleStatus(staff, 'pending'), 'pending');
  assert.equal(resolveArticleStatus(staff, 'archived'), 'archived');
});

test('tipster publish requests are queued for admin review (pending)', () => {
  assert.equal(resolveArticleStatus(tipster, 'published'), 'pending');
});

test('tipsters may still keep drafts, submit for review, or archive', () => {
  assert.equal(resolveArticleStatus(tipster, 'draft'), 'draft');
  assert.equal(resolveArticleStatus(tipster, 'pending'), 'pending');
  assert.equal(resolveArticleStatus(tipster, 'archived'), 'archived');
});
