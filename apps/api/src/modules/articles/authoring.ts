// Pure authorization helpers for the blog authoring workflow (OB-071).
//
// Kept free of Nest decorators / DB access so it can be unit-tested with
// Node's native type-stripping test runner.

import type { Role } from '@overlay/shared';

export type AuthorRole = Role;

export type ArticleStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface AuthoringActor {
  userId: string;
  role: AuthorRole;
}

export interface TipsterApproval {
  status: string;
}

/**
 * Whether a role moderates content — may manage (edit/publish/delete) ANY
 * article regardless of authorship. Admins and staff moderate; `staff` is
 * "admin minus finance" and inherits full content moderation.
 */
export function isArticleModerator(role: AuthorRole): boolean {
  return role === 'admin' || role === 'staff';
}

/**
 * Whether a principal may author articles at all. Admins always can; tipsters
 * may author only once approved (an active tipster account). Staff moderate
 * content but are not authors.
 */
export function canAuthorArticles(
  actor: AuthoringActor,
  tipster?: TipsterApproval | null,
): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role === 'tipster') return tipster?.status === 'active';
  return false;
}

/**
 * Whether a principal may edit/delete a specific article. Content moderators
 * (admin, staff) may manage any article; authors (tipsters) may manage only
 * their own.
 */
export function canManageArticle(
  actor: AuthoringActor,
  article: { authorId: string },
): boolean {
  if (isArticleModerator(actor.role)) return true;
  return actor.role === 'tipster' && article.authorId === actor.userId;
}

/**
 * Resolve the status an article should actually be persisted with. Author
 * (tipster) posts require moderator review before going live: a tipster cannot
 * publish directly, so requesting `published` instead submits the article for
 * review (`pending`). Moderators (admin, staff) may set any status directly,
 * which is how a pending article gets approved and published.
 */
export function resolveArticleStatus(
  actor: AuthoringActor,
  requested: ArticleStatus,
): ArticleStatus {
  if (isArticleModerator(actor.role)) return requested;
  return requested === 'published' ? 'pending' : requested;
}
