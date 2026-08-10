import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

// ────────────────────────────────────────────────
// Typed report rows per role
// ────────────────────────────────────────────────

export interface UserSubscriptionRow {
  tipsterName: string | null;
  status: string;
  currentPeriodEnd: string | null;
  provider: string;
}

export interface UserFeedRow {
  tipsterName: string | null;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: string;
  clv: number | null;
  lockedAt: Date | null;
  settledAt: Date | null;
  sport: string | null;
  home: string | null;
  away: string | null;
}

export interface TipsterPickRow {
  id: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  status: string;
  clv: number | null;
  lockedAt: Date;
  settledAt: Date | null;
  note: string | null;
  sport: string;
  home: string;
  away: string;
}

export interface TipsterEarningsRow {
  period: string;
  amountCents: number;
  currency: string;
  provider: string;
  reference: string;
  createdAt: Date;
}

export interface AdminUserRow {
  email: string;
  username: string | null;
  role: string;
  createdAt: Date;
  tipsterStatus: string | null;
  tipsterVerified: boolean | null;
  subscriberCount: number | null;
}

export interface AdminAuditRow {
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface AdminSettlementRow {
  tipsterName: string | null;
  email: string;
  sport: string;
  home: string;
  away: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  stakeUnits: number;
  closingOdds: number | null;
  clv: number | null;
  status: string;
  settledAt: Date | null;
}

export interface AdminReportRow {
  sentiment: string;
  reason: string;
  details: string | null;
  status: string;
  reporterEmail: string;
  tipsterName: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface AdminPayoutRow {
  tipsterName: string | null;
  amountCents: number;
  grossCents: number;
  feeCents: number;
  kind: string;
  period: string;
  status: string;
  createdAt: Date;
}

// ────────────────────────────────────────────────
// Report data loaders (scoped by role/auth)
// ────────────────────────────────────────────────

export async function loadUserSubscriptions(
  prisma: PrismaService,
  userId: string,
): Promise<UserSubscriptionRow[]> {
  const rows = await prisma.subscription.findMany({
    where: { userId },
    include: { tipster: { select: { displayName: true } } },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  return rows.map((r) => ({
    tipsterName: r.tipster.displayName,
    status: r.status,
    currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
    provider: r.provider,
  }));
}

export async function loadUserFeed(
  prisma: PrismaService,
  userId: string,
): Promise<UserFeedRow[]> {
  const subscribedTipsterIds = await prisma.subscription.findMany({
    where: { userId, status: 'active' },
    select: { tipsterId: true },
  });
  const ids = subscribedTipsterIds.map((s) => s.tipsterId);
  if (ids.length === 0) return [];

  const rows = await prisma.pick.findMany({
    where: { tipsterId: { in: ids } },
    include: {
      tipster: { select: { displayName: true } },
      event: { select: { sport: true, home: true, away: true } },
    },
    orderBy: { lockedAt: 'desc' },
    take: 1000,
  });
  return rows.map((r) => ({
    tipsterName: r.tipster.displayName,
    market: r.market,
    selection: r.selection,
    oddsAtPick: r.oddsAtPick,
    stakeUnits: r.stakeUnits,
    status: r.status,
    clv: r.clv,
    lockedAt: r.lockedAt,
    settledAt: r.settledAt,
    sport: r.event?.sport ?? null,
    home: r.event?.home ?? null,
    away: r.event?.away ?? null,
  }));
}

export async function loadTipsterPicks(
  prisma: PrismaService,
  tipsterId: string,
): Promise<TipsterPickRow[]> {
  const rows = await prisma.pick.findMany({
    where: { tipsterId },
    include: { event: { select: { sport: true, home: true, away: true } } },
    orderBy: { lockedAt: 'desc' },
    take: 5000,
  });
  return rows.map((r) => ({
    id: r.id,
    market: r.market,
    selection: r.selection,
    oddsAtPick: r.oddsAtPick,
    stakeUnits: r.stakeUnits,
    status: r.status,
    clv: r.clv,
    lockedAt: r.lockedAt,
    settledAt: r.settledAt,
    note: r.note,
    sport: r.event?.sport ?? '',
    home: r.event?.home ?? '',
    away: r.event?.away ?? '',
  }));
}

export async function loadTipsterEarnings(
  prisma: PrismaService,
  tipsterId: string,
): Promise<TipsterEarningsRow[]> {
  const rows = await prisma.payment.findMany({
    where: { tipsterId },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return rows.map((r) => ({
    period: r.period,
    amountCents: r.amountCents,
    currency: r.currency,
    provider: r.provider,
    reference: r.reference,
    createdAt: r.createdAt,
  }));
}

export async function loadAdminUsers(
  prisma: PrismaService,
): Promise<AdminUserRow[]> {
  const rows = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10000,
    include: {
      tipster: {
        select: {
          status: true,
          identityVerified: true,
          _count: { select: { subscriptions: { where: { status: 'active' } } } },
        },
      },
    },
  });
  return rows.map((u) => ({
    email: u.email,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    tipsterStatus: u.tipster?.status ?? null,
    tipsterVerified: u.tipster?.identityVerified ?? null,
    subscriberCount: u.tipster?._count.subscriptions ?? null,
  }));
}

export async function loadAdminAuditLog(
  prisma: PrismaService,
): Promise<AdminAuditRow[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });
  return rows.map((r) => ({
    actor: r.actor,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    payload: r.payload,
    createdAt: r.createdAt,
  }));
}

export async function loadAdminSettlements(
  prisma: PrismaService,
): Promise<AdminSettlementRow[]> {
  const rows = await prisma.pick.findMany({
    where: { status: { not: 'pending' } },
    orderBy: { settledAt: 'desc' },
    take: 10000,
    include: {
      tipster: {
        select: { displayName: true, user: { select: { email: true } } },
      },
      event: { select: { sport: true, home: true, away: true } },
    },
  });
  return rows.map((r) => ({
    tipsterName: r.tipster.displayName,
    email: r.tipster.user.email,
    sport: r.event?.sport ?? '',
    home: r.event?.home ?? '',
    away: r.event?.away ?? '',
    market: r.market,
    selection: r.selection,
    oddsAtPick: r.oddsAtPick,
    stakeUnits: r.stakeUnits,
    closingOdds: r.closingOdds,
    clv: r.clv,
    status: r.status,
    settledAt: r.settledAt,
  }));
}

export async function loadAdminReports(
  prisma: PrismaService,
): Promise<AdminReportRow[]> {
  const rows = await prisma.tipsterReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      reporter: { select: { email: true } },
      tipster: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    sentiment: r.sentiment,
    reason: r.reason,
    details: r.details,
    status: r.status,
    reporterEmail: r.reporter.email,
    tipsterName: r.tipster.displayName,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reviewNote: r.reviewNote,
  }));
}

export async function loadAdminPayouts(
  prisma: PrismaService,
): Promise<AdminPayoutRow[]> {
  const rows = await prisma.payout.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10000,
    include: { tipster: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    tipsterName: r.tipster.displayName,
    amountCents: r.amountCents,
    grossCents: r.grossCents,
    feeCents: r.feeCents,
    kind: r.kind,
    period: r.period,
    status: r.status,
    createdAt: r.createdAt,
  }));
}