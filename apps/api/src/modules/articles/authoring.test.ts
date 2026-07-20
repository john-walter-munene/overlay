import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAuthorArticles, canManageArticle, resolveArticleStatus, } from './authoring.ts';

// test actors
const admin = { userId: 'admin-1', role: 'admin' as const, };
const tipster = { userId: 'tipster-1', role: 'tipster' as const, };
const user = { userId: 'user-1', role: 'user' as const, };
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

// canAuthorArticles
test('admins can always author', () => {
  assert.equal(canAuthorArticles(admin), true);
  assert.equal(canAuthorArticles(admin, null), true);
  assert.equal(canAuthorArticles(admin, undefined), true);
});

test('approved article authors can author', () => {
  assert.equal(canAuthorArticles(tipster, { articleAuthorStatus: 'approved', }), true, );
});

test('pending article authors cannot author', () => {
  assert.equal(canAuthorArticles(tipster, { articleAuthorStatus: 'pending', }), false,);
});

test('suspended article authors cannot author', () => {
  assert.equal(canAuthorArticles(tipster, { articleAuthorStatus: 'suspended', }), false,);
});

test('tipsters without an authorship record cannot author', () => {
  assert.equal(canAuthorArticles(tipster, null), false);
  assert.equal(canAuthorArticles(tipster, undefined), false);
});

test('plain users can never author', () => {
  assert.equal(canAuthorArticles(user, { articleAuthorStatus: 'approved',}), false, );
  assert.equal(canAuthorArticles(user), false);
});

// canManageArticle
test('staff moderate content but are not authors', () => {
  assert.equal(isArticleModerator('staff'), true);
  assert.equal(isArticleModerator('admin'), true);
  assert.equal(isArticleModerator('tipster'), false);
  assert.equal(isArticleModerator('user'), false);
  assert.equal(canAuthorArticles(staff), false);
  assert.equal(canAuthorArticles(staff, { status: 'active' }), false);
});

test('admins can manage any article', () => {
  assert.equal(canManageArticle(admin, { authorId: 'someone-else', }), true,);
});

test('tipsters can manage their own articles', () => {
  assert.equal(canManageArticle(tipster, { authorId: 'tipster-1', }), true,);
});

test('tipsters cannot manage another authors articles', () => {
  assert.equal(canManageArticle(tipster, { authorId: 'tipster-2',}), false,);
test('staff can manage any article (moderation)', () => {
  assert.equal(canManageArticle(staff, { authorId: 'someone-else' }), true);
  assert.equal(canManageArticle(staff, { authorId: 's-1' }), true);
});

test('tipsters can manage only their own articles', () => {
  assert.equal(canManageArticle(tipster, { authorId: 't-1' }), true);
  assert.equal(canManageArticle(tipster, { authorId: 't-2' }), false);
});

test('plain users cannot manage articles', () => {
  assert.equal(canManageArticle(user, { authorId: 'user-1',}), false,);
});

// resolveArticleStatus
test('admins may set any article status directly', () => {
  assert.equal(resolveArticleStatus(admin, 'draft'), 'draft');
  assert.equal(resolveArticleStatus(admin, 'pending'), 'pending');
  assert.equal(resolveArticleStatus(admin, 'published'), 'published');
  assert.equal(resolveArticleStatus(admin, 'archived'), 'archived');
});

test('tipster publish requests become pending review', () => {
  assert.equal(resolveArticleStatus(tipster, 'published'), 'pending',);
});

test('tipsters may save drafts', () => {
  assert.equal(resolveArticleStatus(tipster, 'draft'), 'draft',);
test('staff may set any status directly (approve/publish pending posts)', () => {
  assert.equal(resolveArticleStatus(staff, 'published'), 'published');
  assert.equal(resolveArticleStatus(staff, 'pending'), 'pending');
  assert.equal(resolveArticleStatus(staff, 'archived'), 'archived');
});

test('tipster publish requests are queued for admin review (pending)', () => {
  assert.equal(resolveArticleStatus(tipster, 'published'), 'pending');
});

test('tipsters may keep articles pending', () => {
  assert.equal(resolveArticleStatus(tipster, 'pending'), 'pending',);
});

test('tipsters may archive their own articles', () => {
  assert.equal(resolveArticleStatus(tipster, 'archived'), 'archived',);
});

test('plain users follow the same status resolution rules as non-admins', () => {
  assert.equal(resolveArticleStatus(user, 'published'), 'pending',);
  assert.equal(resolveArticleStatus(user, 'draft'), 'draft',);
});