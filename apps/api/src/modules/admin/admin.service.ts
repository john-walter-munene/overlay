import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { canAssignRole, type Role } from '@overlay/shared';
import { PrismaService } from '../../prisma.service';
import { SettlementService } from '../../workers/settlement.service';
import type { AuthUser } from '../../common/crypto';
import {
  normalizeUsersQuery,
  paginateUsers,
  type RawUsersQuery,
} from './users-query';
import {
  InvalidVoidReasonError,
  PickAlreadyVoidError,
  PickNotFoundError,
  normalizeSettlementsQuery,
  type RawSettlementsQuery,
} from './settlements';
import {
  buildAuditLogWhere,
  normalizeAuditLogQuery,
  paginateAuditLog,
  type RawAuditLogQuery,
} from './audit-query';
import { resolveIdentityDocumentUrl } from '../tipsters/uploads';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

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
      graduationReviews,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.tipster.count(),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.pick.count(),
      this.prisma.pick.count({ where: { status: { not: 'pending' } } }),
      this.prisma.payout.count({ where: { status: 'pending' } }),
      this.prisma.article.count({ where: { status: 'published' } }),
      this.prisma.article.count({ where: { status: 'draft' } }),
      // Rising tipsters who have met the graduation threshold and await review.
      this.prisma.tipster.count({
        where: { graduationStatus: 'pending_review' },
      }),
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
      graduationReviews,
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
        username: true,
        role: true,
        createdAt: true,
        tipster: {
          select: {
            status: true,
            identityVerified: true,
            // Active subscribers backing this tipster (OB-020 admin oversight).
            _count: { select: { subscriptions: { where: { status: 'active' } } } },
          },
        },
      },
    });

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        tipster: u.tipster
          ? {
              status: u.tipster.status,
              verified: u.tipster.identityVerified,
              subscriberCount: u.tipster._count.subscriptions,
            }
          : null,
      })),
      total,
      page: window.page,
      pageSize: window.pageSize,
      totalPages: window.totalPages,
    };
  }

  async setUserRole(
    actor: AuthUser,
    userId: string,
    role: Role,
    note?: string,
  ) {
    if (!canAssignRole(actor.role, role)) {
      throw new ForbiddenException(
        `Role '${actor.role}' may not assign role '${role}'`,
      );
    }
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
          actor: `admin:${actor.userId}`,
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
   * The rising-tipster graduation review queue (OB-153): tipsters who have met
   * the graduation threshold (`pending_review`) and are awaiting an admin
   * decision to assign the verified tag. Oldest-qualified first so no tipster
   * waits indefinitely. Includes the tipster's settled stats for context.
   */
  async listGraduationReviews() {
    const rows = await this.prisma.tipster.findMany({
      where: { graduationStatus: 'pending_review' },
      orderBy: { graduationEligibleAt: 'asc' },
      select: {
        userId: true,
        displayName: true,
        graduationEligibleAt: true,
        subscriptionGatingEnabled: true,
        user: { select: { email: true, username: true } },
        stats: { select: { winRate: true, sampleSize: true, yield: true } },
      },
    });
    return rows.map((t) => ({
      tipsterId: t.userId,
      name: t.displayName ?? t.user?.username ?? null,
      email: t.user?.email ?? null,
      eligibleAt: t.graduationEligibleAt,
      subscriptionGatingEnabled: t.subscriptionGatingEnabled,
      winRate: t.stats?.winRate ?? 0,
      settledBets: t.stats?.sampleSize ?? 0,
      yield: t.stats?.yield ?? 0,
    }));
  }

  /**
   * Review a graduation-eligible tipster (OB-153). `verify` assigns the verified
   * tag (Rising → Verified), making them eligible to gate live picks; `reject`
   * returns them to provisional `rising`. Verifying never enables billing on its
   * own — subscription gating stays off until explicitly switched on.
   */
  async reviewTipsterGraduation(
    actorId: string,
    tipsterId: string,
    decision: 'verify' | 'reject',
    note?: string,
  ) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');

    const graduationStatus = decision === 'verify' ? 'verified' : 'rising';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tipster.update({
        where: { userId: tipsterId },
        data: { graduationStatus },
      });
      await tx.auditLog.create({
        data: {
          actor: `admin:${actorId}`,
          action: `tipster.graduation_${decision === 'verify' ? 'verified' : 'rejected'}`,
          entity: 'Tipster',
          entityId: tipsterId,
          payload: withNote({ graduationStatus }, note),
        },
      });
      return updated;
    });
  }

  /**
   * Turn subscription gating on/off for a tipster's live picks (OB-153). Gating
   * can only be enabled once the tipster is verified — it's the explicit,
   * non-automatic step that starts paywalling live picks.
   */
  async setTipsterGating(
    actorId: string,
    tipsterId: string,
    enabled: boolean,
    note?: string,
  ) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    if (enabled && tipster.graduationStatus !== 'verified') {
      throw new BadRequestException(
        'Tipster must be verified before subscription gating can be enabled',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tipster.update({
        where: { userId: tipsterId },
        data: { subscriptionGatingEnabled: enabled },
      });
      await tx.auditLog.create({
        data: {
          actor: `admin:${actorId}`,
          action: `tipster.gating_${enabled ? 'enabled' : 'disabled'}`,
          entity: 'Tipster',
          entityId: tipsterId,
          payload: withNote({ subscriptionGatingEnabled: enabled }, note),
        },
      });
      return updated;
    });
  }

  /**
   * Mint a short-lived signed URL for a tipster's uploaded identity document so
   * an admin can review it during verification (OB-020). Returns a null `url`
   * when no document has been uploaded or it isn't servable (e.g. a local-dev
   * file). Never exposes the underlying storage path.
   */
  async getTipsterIdentityDocument(tipsterId: string) {
    const tipster = await this.prisma.tipster.findUnique({
      where: { userId: tipsterId },
      select: {
        identityDocPath: true,
        identityDocName: true,
        identityDocSubmittedAt: true,
        identityVerified: true,
      },
    });
    if (!tipster) throw new NotFoundException('Tipster not found');
    const url = await resolveIdentityDocumentUrl(tipster.identityDocPath);
    return {
      name: tipster.identityDocName,
      submittedAt: tipster.identityDocSubmittedAt,
      verified: tipster.identityVerified,
      url,
    };
  }

  /**
   * Read-only view of recent settlement outcomes for the oversight console
   * (OB-029). Returns settled (won/lost/void) picks — optionally filtered to a
   * single outcome — newest first, with the tipster email and event context.
   */
  async listRecentSettlements(raw: RawSettlementsQuery = {}) {
    const query = normalizeSettlementsQuery(raw);
    const where: Prisma.PickWhereInput = query.status
      ? { status: query.status }
      : { status: { in: ['won', 'lost', 'void', 'half_won', 'half_lost'] } };

    const [total, items] = await Promise.all([
      this.prisma.pick.count({ where }),
      this.prisma.pick.findMany({
        where,
        orderBy: { settledAt: 'desc' },
        take: query.take,
        skip: query.skip,
        select: {
          id: true,
          tipsterId: true,
          market: true,
          selection: true,
          oddsAtPick: true,
          stakeUnits: true,
          status: true,
          closingOdds: true,
          clv: true,
          settledAt: true,
          tipster: {
            select: {
              displayName: true,
              user: { select: { username: true, email: true } },
            },
          },
          event: {
            select: {
              sport: true,
              league: true,
              home: true,
              away: true,
              startTime: true,
            },
          },
        },
      }),
    ]);

    return { items, total, take: query.take, skip: query.skip };
  }

  /**
   * Manually trigger one settlement cycle for a stuck queue (OB-029). Delegates
   * to the settlement worker's idempotent {@link SettlementService.runOnce}.
   */
  async rerunSettlement(actorId: string) {
    await this.settlement.runOnce();
    await this.prisma.auditLog.create({
      data: {
        actor: `admin:${actorId}`,
        action: 'settlement.rerun',
        entity: 'Settlement',
        entityId: 'cycle',
        payload: {},
      },
    });
    return { ok: true };
  }

  /**
   * Void a pick for an objective data error (OB-029). A reason is mandatory;
   * the void writes an audit entry and recomputes the tipster's stats. Pure
   * workflow errors are mapped to the matching HTTP responses.
   */
  async voidPick(actorId: string, pickId: string, reason: unknown) {
    try {
      const { pick, audit } = await this.settlement.voidPick(
        actorId,
        pickId,
        reason,
      );
      return { id: pick.id, status: 'void' as const, audit };
    } catch (err) {
      if (err instanceof InvalidVoidReasonError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof PickNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof PickAlreadyVoidError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
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
