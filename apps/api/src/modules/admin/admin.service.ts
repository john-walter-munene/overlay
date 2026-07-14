import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  normalizeUsersQuery,
  paginateUsers,
  type RawUsersQuery,
} from './users-query';
import {
  buildAuditLogWhere,
  normalizeAuditLogQuery,
  paginateAuditLog,
  type RawAuditLogQuery,
} from './audit-query';

type TipsterStatus = 'active' | 'suspended';

/** Merge an optional free-text admin note into an audit-log payload. */
function withNote(
  payload: Prisma.InputJsonObject,
  note?: string,
): Prisma.InputJsonObject {
  const trimmed = note?.trim();
  return trimmed ? { ...payload, note: trimmed } : payload;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** High-level platform metrics for the admin dashboard. */
  async dashboard() {
    const [
      users,
      tipsters,
      activeSubscriptions,
      picks,
      settledPicks,
      pendingPayouts,
      publishedArticles,
      draftArticles,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.tipster.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.pick.count(),
      this.prisma.pick.count({ where: { status: { not: 'pending' } } }),
      this.prisma.payout.count({ where: { status: 'pending' } }),
      this.prisma.article.count({ where: { status: 'published' } }),
      this.prisma.article.count({ where: { status: 'draft' } }),
    ]);

    const grossPendingPayoutCents = await this.prisma.payout.aggregate({
      where: { status: 'pending' },
      _sum: { amountCents: true },
    });

    return {
      users,
      tipsters,
      activeSubscriptions,
      picks,
      settledPicks,
      pendingPayouts,
      grossPendingPayoutCents: grossPendingPayoutCents._sum.amountCents ?? 0,
      publishedArticles,
      draftArticles,
    };
  }

  /**
   * Search + paginate the users table for the admin console (OB-026). Search
   * matches email case-insensitively. Returns a paged envelope so the UI can
   * render page controls without a second count round-trip.
   */
  async listUsers(raw: RawUsersQuery = {}) {
    const query = normalizeUsersQuery(raw);
    const where: Prisma.UserWhereInput = query.search
      ? { email: { contains: query.search, mode: 'insensitive' } }
      : {};

    const total = await this.prisma.user.count({ where });
    const window = paginateUsers(total, query);

    const items = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: window.take,
      skip: window.skip,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        tipster: { select: { status: true } },
      },
    });

    return {
      items,
      total,
      page: window.page,
      pageSize: window.pageSize,
      totalPages: window.totalPages,
    };
  }

  async setUserRole(
    actorId: string,
    userId: string,
    role: 'user' | 'tipster' | 'admin',
    note?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role },
      });
      // Promoting to tipster provisions a tipster profile if absent.
      if (role === 'tipster') {
        await tx.tipster.upsert({
          where: { userId },
          create: { userId, sports: [] },
          update: {},
        });
      }
      await tx.auditLog.create({
        data: {
          actor: `admin:${actorId}`,
          action: 'user.role_changed',
          entity: 'User',
          entityId: userId,
          payload: withNote({ role }, note),
        },
      });
      return updated;
    });
  }

  /** Suspend or reinstate a tipster (hides them from leaderboard/marketplace). */
  async setTipsterStatus(
    actorId: string,
    tipsterId: string,
    status: TipsterStatus,
    note?: string,
  ) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tipster.update({
        where: { userId: tipsterId },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actor: `admin:${actorId}`,
          action: `tipster.${status === 'suspended' ? 'suspended' : 'reinstated'}`,
          entity: 'Tipster',
          entityId: tipsterId,
          payload: withNote({ status }, note),
        },
      });
      return updated;
    });
  }

  /**
   * Search + paginate the audit log for the admin viewer (OB-027). Filters by
   * entity (exact), actor/action (case-insensitive substring) and a createdAt
   * date range. Returns a paged envelope so the UI can render page controls
   * without a second count round-trip.
   */
  async listAuditLog(raw: RawAuditLogQuery = {}) {
    const query = normalizeAuditLogQuery(raw);
    const where = buildAuditLogWhere(query) as Prisma.AuditLogWhereInput;

    const total = await this.prisma.auditLog.count({ where });
    const window = paginateAuditLog(total, query);

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: window.take,
      skip: window.skip,
    });

    return {
      items,
      total,
      page: window.page,
      pageSize: window.pageSize,
      totalPages: window.totalPages,
    };
  }
}
