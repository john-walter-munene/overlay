import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { storeCover, deleteCover, InvalidCoverError, type UploadedCover } from './cover-upload';
import {
  slugify,
  dedupeSlug,
  excerpt as makeExcerpt,
  readingTimeMinutes,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import {
  EntityCache,
  readThroughCache,
} from '../../common/cache/entity-cache';
import { ARTICLE_LIST_CACHE } from '../../common/cache/cache.module';
import type { CreateArticleDto } from './dto/create-article.dto';
import type { UpdateArticleDto } from './dto/update-article.dto';
import type { UpdateArticleAuthorStatusDto } from './dto/update-article-author-status.dto';
import {
  canAuthorArticles,
  canManageArticle,
  isArticleModerator,
  resolveArticleStatus,
  type AuthoringActor,
} from './authoring';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTICLE_LIST_CACHE) private readonly listCache: EntityCache,
  ) {}

  /** Public list: only published articles, newest first, optional tag/category filter. */
  async listPublished(
    opts: {
      tag?: string;
      category?: 'content' | 'news';
      take?: number;
      skip?: number;
    } = {},
  ) {
    const take = Math.min(opts.take ?? 20, 50);
    const skip = opts.skip ?? 0;
    // OB-130: hot, public SEO read served through the Redis cache. Keyed by the
    // normalized query shape; invalidated globally on any article write below.
    const key = `published:t=${opts.tag ?? ''}:c=${opts.category ?? ''}:k=${take}:s=${skip}`;
    return readThroughCache(this.listCache, key, () =>
      this.prisma.article.findMany({
        where: {
          status: 'published',
          ...(opts.tag ? { tags: { has: opts.tag } } : {}),
          ...(opts.category ? { category: opts.category } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        take,
        skip,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          tags: true,
          category: true,
          readingMinutes: true,
          publishedAt: true,
        },
      }),
    );
  }

  /** Public single article by slug (published only). */
  async getPublishedBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: { slug, status: 'published' },
    });
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  /** All distinct tags across published articles (for topic nav / sitemap). */
  async listTags(): Promise<string[]> {
    // OB-130: served through the same cache as the article lists; any article
    // write invalidates the whole namespace, so tags stay in sync.
    return readThroughCache(this.listCache, 'tags', async () => {
      const rows = await this.prisma.article.findMany({
        where: { status: 'published' },
        select: { tags: true },
      });
      const set = new Set<string>();
      for (const r of rows) for (const t of r.tags) set.add(t);
      return [...set].sort();
    });
  }

  /** Slugs + timestamps for sitemap generation. */
  listPublishedSlugs() {
    return this.prisma.article.findMany({
      where: { status: 'published' },
      select: { slug: true, updatedAt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // ---- authoring (admin + approved tipsters) ----

  /** Admin list including drafts/archived across all authors. */
  listAll() {
    return this.prisma.article.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  /** Articles the current author may manage: moderators (admin/staff) see all, tipsters see own. */
  listMine(actor: AuthoringActor) {
    return this.prisma.article.findMany({
      where: isArticleModerator(actor.role) ? {} : { authorId: actor.userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Throw unless the actor is allowed to author articles (approved tipster/admin). */
  private async assertCanAuthor(actor: AuthoringActor) {
    if (actor.role === 'admin') return;

    const tipster =
      actor.role === 'tipster'
        ? await this.prisma.tipster.findUnique({
            where: { userId: actor.userId },
            select: {
              articleAuthorStatus: true,
            },
          })
        : null;

    if (canAuthorArticles(actor, tipster)) {
      return;
    }

    throw new ForbiddenException('Not allowed to author articles');
  }

  async create(actor: AuthoringActor, dto: CreateArticleDto) {
    await this.assertCanAuthor(actor);
    const base = slugify(dto.slug?.trim() || dto.title);
    if (!base) throw new BadRequestException('Title produces an empty slug');
    const taken = new Set(
      (
        await this.prisma.article.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((a) => a.slug),
    );
    const slug = dedupeSlug(base, taken);

    // Tipster posts require admin review: `resolveArticleStatus` downgrades a
    // tipster's `published` request to `pending` (admins publish directly).
    const status = resolveArticleStatus(actor, dto.status ?? 'draft');
    const created = await this.prisma.article.create({
      data: {
        slug,
        title: dto.title,
        body: dto.body,
        excerpt: dto.excerpt?.trim() || makeExcerpt(dto.body),
        coverImage: dto.coverImage,
        tags: dto.tags ?? [],
        category: dto.category ?? 'content',
        status,
        readingMinutes: readingTimeMinutes(dto.body),
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        canonicalUrl: dto.canonicalUrl,
        authorId: actor.userId,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
    // OB-130: a new article may appear in the public lists — retire the cache.
    await this.listCache.invalidate();
    return created;
  }

  async uploadCover(actor: AuthoringActor, file: UploadedCover | undefined): Promise<{ url: string }> {
    await this.assertCanAuthor(actor);
    try {
      const url = await storeCover(file);
      return { url };
    } catch (err) {
      if (err instanceof InvalidCoverError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async removeCover(actor: AuthoringActor, id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (!canManageArticle(actor, existing)) {
      throw new ForbiddenException('Not allowed to edit this article');
    }
    if (existing.coverImage) {
      await deleteCover(existing.coverImage);
    }
    await this.prisma.article.update({
      where: { id },
      data: { coverImage: null },
    });
    return { deleted: true };
  }

  async update(id: string, dto: UpdateArticleDto, actor: AuthoringActor) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (!canManageArticle(actor, existing)) {
      throw new ForbiddenException('Not allowed to edit this article');
    }
    const nextStatus = resolveArticleStatus(
      actor,
      dto.status ?? existing.status,
    );
    const wasPublished = existing.status === 'published';
    const nowPublished = nextStatus === 'published';

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        body: dto.body ?? existing.body,
        excerpt:
          dto.excerpt ?? (dto.body ? makeExcerpt(dto.body) : existing.excerpt),
        coverImage: dto.coverImage ?? existing.coverImage,
        tags: dto.tags ?? existing.tags,
        category: dto.category ?? existing.category,
        status: nextStatus,
        readingMinutes: dto.body
          ? readingTimeMinutes(dto.body)
          : existing.readingMinutes,
        seoTitle: dto.seoTitle ?? existing.seoTitle,
        seoDescription: dto.seoDescription ?? existing.seoDescription,
        canonicalUrl: dto.canonicalUrl ?? existing.canonicalUrl,
        // Stamp publishedAt the first time it goes live; keep it stable after.
        publishedAt:
          nowPublished && !wasPublished ? new Date() : existing.publishedAt,
      },
    });
    // OB-130: an edit can change a published article's fields, its published
    // state, or its tags — retire the public list cache.
    await this.listCache.invalidate();
    return updated;
  }

  async remove(id: string, actor: AuthoringActor) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (!canManageArticle(actor, existing)) {
      throw new ForbiddenException('Not allowed to delete this article');
    }
    await this.prisma.article.delete({ where: { id } });
    // OB-130: a removed article must drop out of the public lists.
    await this.listCache.invalidate();
    return { deleted: true };
  }

  async listAuthors() {
    return this.prisma.tipster.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        userId: true,
        displayName: true,
        status: true,
        articleAuthorStatus: true,
        identityVerified: true,
        createdAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  async updateAuthorStatus(
    userId: string,
    dto: UpdateArticleAuthorStatusDto,
  ) {
    return this.prisma.tipster.update({
      where: {
        userId,
      },
      data: {
        articleAuthorStatus: dto.articleAuthorStatus,
      },
    });
  }
}
