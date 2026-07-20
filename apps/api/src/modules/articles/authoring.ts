// Pure authorization helpers for the blog authoring workflow (OB-071).
//
// Kept free of Nest decorators / DB access so it can be unit-tested with
// Node's native type-stripping test runner.

export type AuthorRole = 'user' | 'tipster' | 'admin';
import type { Role } from '@overlay/shared';

export type AuthorRole = Role;

export type ArticleStatus = 'draft' | 'pending' | 'published' | 'archived';
export type ArticleAuthorStatus = 'pending' | 'approved' | 'suspended';

export interface AuthoringActor {
  userId: string;
  role: AuthorRole;
}

export interface TipsterApproval { articleAuthorStatus: ArticleAuthorStatus; }
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
 * may author only once their article authorship has been approved. This is
 * intentionally independent of the tipster marketplace status.
 * may author only once approved (an active tipster account). Staff moderate
 * content but are not authors.
 */
export function canAuthorArticles(actor: AuthoringActor, tipster?: TipsterApproval | null,): boolean {
  if (actor.role === 'admin') return true;

  return (actor.role === 'tipster' && tipster?.articleAuthorStatus === 'approved');
}

/**
 * Whether a principal may edit/delete a specific article. Content moderators
 * (admin, staff) may manage any article; authors (tipsters) may manage only
 * their own.
 */
export function canManageArticle(actor: AuthoringActor, article: { authorId: string },): boolean {
  if (actor.role === 'admin') return true;

  return (actor.role === 'tipster' && article.authorId === actor.userId);
export function canManageArticle(
  actor: AuthoringActor,
  article: { authorId: string },
): boolean {
  if (isArticleModerator(actor.role)) return true;
  return actor.role === 'tipster' && article.authorId === actor.userId;
}

/**
 * Resolve the status an article should actually be persisted with. Author
 * (tipsters) require admin review before going live: requesting "published"
 * instead submits the article for review ("pending"). Admins may set any
 * status directly, which is how pending articles are approved and published.
 */
export function resolveArticleStatus(actor: AuthoringActor, requested: ArticleStatus, ): ArticleStatus {
  if (actor.role === 'admin') return requested;

  return requested === 'published' ? 'pending': requested;
}
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
