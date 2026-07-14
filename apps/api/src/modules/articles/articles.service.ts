import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  slugify,
  dedupeSlug,
  excerpt as makeExcerpt,
  readingTimeMinutes,
} from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import type { CreateArticleDto } from './dto/create-article.dto';
import type { UpdateArticleDto } from './dto/update-article.dto';
import {
  canAuthorArticles,
  canManageArticle,
  resolveArticleStatus,
  type AuthoringActor,
} from './authoring';

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public list: only published articles, newest first, optional tag filter. */
  async listPublished(opts: { tag?: string; take?: number; skip?: number } = {}) {
    const take = Math.min(opts.take ?? 20, 50);
    return this.prisma.article.findMany({
      where: {
        status: 'published',
        ...(opts.tag ? { tags: { has: opts.tag } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take,
      skip: opts.skip ?? 0,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        tags: true,
        readingMinutes: true,
        publishedAt: true,
      },
    });
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
    const rows = await this.prisma.article.findMany({
      where: { status: 'published' },
      select: { tags: true },
    });
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags) set.add(t);
    return [...set].sort();
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

  /** Articles the current author may manage: admins see all, tipsters see own. */
  listMine(actor: AuthoringActor) {
    return this.prisma.article.findMany({
      where: actor.role === 'admin' ? {} : { authorId: actor.userId },
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
          })
        : null;
    if (!canAuthorArticles(actor, tipster)) {
      throw new ForbiddenException('Not allowed to author articles');
    }
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
    return this.prisma.article.create({
      data: {
        slug,
        title: dto.title,
        body: dto.body,
        excerpt: dto.excerpt?.trim() || makeExcerpt(dto.body),
        coverImage: dto.coverImage,
        tags: dto.tags ?? [],
        status,
        readingMinutes: readingTimeMinutes(dto.body),
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        canonicalUrl: dto.canonicalUrl,
        authorId: actor.userId,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
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

    return this.prisma.article.update({
      where: { id },
      data: {
        title: dto.title ?? existing.title,
        body: dto.body ?? existing.body,
        excerpt:
          dto.excerpt ?? (dto.body ? makeExcerpt(dto.body) : existing.excerpt),
        coverImage: dto.coverImage ?? existing.coverImage,
        tags: dto.tags ?? existing.tags,
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
  }

  async remove(id: string, actor: AuthoringActor) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (!canManageArticle(actor, existing)) {
      throw new ForbiddenException('Not allowed to delete this article');
    }
    await this.prisma.article.delete({ where: { id } });
    return { deleted: true };
  }
}
