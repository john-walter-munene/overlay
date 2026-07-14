// Pure authorization helpers for the blog authoring workflow (OB-071).
//
// Kept free of Nest decorators / DB access so it can be unit-tested with
// Node's native type-stripping test runner.

export type AuthorRole = 'user' | 'tipster' | 'admin';

export type ArticleStatus = 'draft' | 'pending' | 'published' | 'archived';

export interface AuthoringActor {
  userId: string;
  role: AuthorRole;
}

export interface TipsterApproval {
  status: string;
}

/**
 * Whether a principal may author articles at all. Admins always can; tipsters
 * may author only once approved (an active tipster account).
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
 * Whether a principal may edit/delete a specific article. Admins may manage
 * any article; authors (tipsters) may manage only their own.
 */
export function canManageArticle(
  actor: AuthoringActor,
  article: { authorId: string },
): boolean {
  if (actor.role === 'admin') return true;
  return actor.role === 'tipster' && article.authorId === actor.userId;
}

/**
 * Resolve the status an article should actually be persisted with. Author
 * (tipster) posts require admin review before going live: a tipster cannot
 * publish directly, so requesting `published` instead submits the article for
 * review (`pending`). Admins may set any status directly, which is how a
 * pending article gets approved and published.
 */
export function resolveArticleStatus(
  actor: AuthoringActor,
  requested: ArticleStatus,
): ArticleStatus {
  if (actor.role === 'admin') return requested;
  return requested === 'published' ? 'pending' : requested;
}
