import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  loadUserSubscriptions,
  loadUserFeed,
  loadTipsterPicks,
  loadTipsterEarnings,
  loadAdminUsers,
  loadAdminAuditLog,
  loadAdminSettlements,
  loadAdminReports,
  loadAdminPayouts,
} from './export-reports';
import { buildXlsx, buildCsv, buildPdf } from './export-formats';

type ExportFormat = 'xlsx' | 'csv' | 'pdf';

interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────
  // USER exports (scoped to userId)
  // ────────────────────────────────────

  async exportUserSubscriptions(
    userId: string,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const rows = await loadUserSubscriptions(this.prisma, userId);
    const headers = ['Tipster', 'Status', 'Current Period End', 'Provider'];
    const data = rows.map((r) => [r.tipsterName, r.status, r.currentPeriodEnd, r.provider]);
    return this.build('subscriptions', headers, data, format);
  }

  async exportUserFeed(
    userId: string,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const rows = await loadUserFeed(this.prisma, userId);
    const headers = [
      'Tipster',
      'Market',
      'Selection',
      'Odds',
      'Stake',
      'Status',
      'CLV',
      'Locked At',
      'Settled At',
      'Sport',
      'Home',
      'Away',
    ];
    const data = rows.map((r) => [
      r.tipsterName,
      r.market,
      r.selection,
      r.oddsAtPick,
      r.stakeUnits,
      r.status,
      r.clv != null ? (r.clv * 100).toFixed(1) + '%' : null,
      r.lockedAt?.toISOString() ?? null,
      r.settledAt?.toISOString() ?? null,
      r.sport,
      r.home,
      r.away,
    ]);
    return this.build('feed', headers, data, format);
  }

  // ────────────────────────────────────
  // TIPSTER exports (scoped to tipsterId)
  // ────────────────────────────────────

  async exportTipsterPicks(
    tipsterId: string,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const rows = await loadTipsterPicks(this.prisma, tipsterId);
    const headers = [
      'ID',
      'Market',
      'Selection',
      'Odds',
      'Stake',
      'Status',
      'CLV',
      'Locked At',
      'Settled At',
      'Note',
      'Sport',
      'Home',
      'Away',
    ];
    const data = rows.map((r) => [
      r.id,
      r.market,
      r.selection,
      r.oddsAtPick,
      r.stakeUnits,
      r.status,
      r.clv != null ? (r.clv * 100).toFixed(1) + '%' : null,
      r.lockedAt.toISOString(),
      r.settledAt?.toISOString() ?? null,
      r.note,
      r.sport,
      r.home,
      r.away,
    ]);
    return this.build('picks', headers, data, format);
  }

  async exportTipsterEarnings(
    tipsterId: string,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const rows = await loadTipsterEarnings(this.prisma, tipsterId);
    const headers = [
      'Period',
      'Amount (USD)',
      'Currency',
      'Provider',
      'Reference',
      'Date',
    ];
    const data = rows.map((r) => [
      r.period,
      (r.amountCents / 100).toFixed(2),
      r.currency,
      r.provider,
      r.reference,
      r.createdAt.toISOString(),
    ]);
    return this.build('earnings', headers, data, format);
  }

  // ────────────────────────────────────
  // ADMIN exports (admin-only)
  // ────────────────────────────────────

  async exportAdminUsers(format: ExportFormat): Promise<ExportResult> {
    const rows = await loadAdminUsers(this.prisma);
    const headers = [
      'Email',
      'Username',
      'Role',
      'Created At',
      'Tipster Status',
      'Verified',
      'Subscriber Count',
    ];
    const data = rows.map((r) => [
      r.email,
      r.username,
      r.role,
      r.createdAt.toISOString(),
      r.tipsterStatus,
      r.tipsterVerified,
      r.subscriberCount,
    ]);
    return this.build('users', headers, data, format);
  }

  async exportAdminAuditLog(format: ExportFormat): Promise<ExportResult> {
    const rows = await loadAdminAuditLog(this.prisma);
    const headers = [
      'Actor',
      'Action',
      'Entity',
      'Entity ID',
      'Payload',
      'Created At',
    ];
    const data = rows.map((r) => [
      r.actor,
      r.action,
      r.entity,
      r.entityId,
      r.payload ? JSON.stringify(r.payload) : null,
      r.createdAt.toISOString(),
    ]);
    return this.build('audit-log', headers, data, format);
  }

  async exportAdminSettlements(format: ExportFormat): Promise<ExportResult> {
    const rows = await loadAdminSettlements(this.prisma);
    const headers = [
      'Tipster',
      'Email',
      'Sport',
      'Home',
      'Away',
      'Market',
      'Selection',
      'Odds',
      'Stake',
      'Closing Odds',
      'CLV',
      'Status',
      'Settled At',
    ];
    const data = rows.map((r) => [
      r.tipsterName,
      r.email,
      r.sport,
      r.home,
      r.away,
      r.market,
      r.selection,
      r.oddsAtPick,
      r.stakeUnits,
      r.closingOdds,
      r.clv != null ? (r.clv * 100).toFixed(1) + '%' : null,
      r.status,
      r.settledAt?.toISOString() ?? null,
    ]);
    return this.build('settlements', headers, data, format);
  }

  async exportAdminReports(format: ExportFormat): Promise<ExportResult> {
    const rows = await loadAdminReports(this.prisma);
    const headers = [
      'Sentiment',
      'Reason',
      'Details',
      'Status',
      'Reporter Email',
      'Tipster Name',
      'Created At',
      'Reviewed At',
      'Review Note',
    ];
    const data = rows.map((r) => [
      r.sentiment,
      r.reason,
      r.details,
      r.status,
      r.reporterEmail,
      r.tipsterName,
      r.createdAt.toISOString(),
      r.reviewedAt?.toISOString() ?? null,
      r.reviewNote,
    ]);
    return this.build('reports', headers, data, format);
  }

  async exportAdminPayouts(format: ExportFormat): Promise<ExportResult> {
    const rows = await loadAdminPayouts(this.prisma);
    const headers = [
      'Tipster',
      'Amount (USD)',
      'Gross (USD)',
      'Fee (USD)',
      'Kind',
      'Period',
      'Status',
      'Created At',
    ];
    const data = rows.map((r) => [
      r.tipsterName,
      (r.amountCents / 100).toFixed(2),
      (r.grossCents / 100).toFixed(2),
      (r.feeCents / 100).toFixed(2),
      r.kind,
      r.period,
      r.status,
      r.createdAt.toISOString(),
    ]);
    return this.build('payouts', headers, data, format);
  }

  // ────────────────────────────────────
// Format dispatch
// ────────────────────────────────────

private async build(
    slug: string,
    headers: string[],
    data: (string | number | boolean | null | undefined)[][],
    format: ExportFormat,
  ): Promise<ExportResult> {
    const ts = new Date().toISOString().slice(0, 10);
    const safeSlug = slug.replace(/[^a-z0-9-]/gi, '_');

    switch (format) {
      case 'xlsx': {
        const buffer = await buildXlsx(safeSlug, headers, data);

        return {
          buffer,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `overlay-${safeSlug}-${ts}.xlsx`,
        };
      }

      case 'csv': {
        const csv = buildCsv(headers, data);

        return {
          buffer: Buffer.from(csv, 'utf-8'),
          contentType: 'text/csv; charset=utf-8',
          filename: `overlay-${safeSlug}-${ts}.csv`,
        };
      }

      case 'pdf': {
        const title = `Overlay Bets — ${slug.replace(/-/g, ' ')}`;

        const buffer = await buildPdf(title, headers, data);

        return {
          buffer,
          contentType: 'application/pdf',
          filename: `overlay-${safeSlug}-${ts}.pdf`,
        };
      }

      default: {
        // This should never happen because ExportFormat is a union type,
        // but keeping this makes the switch exhaustive.
        const exhaustive: never = format;
        throw new Error(`Unsupported export format: ${exhaustive}`);
      }
    }
  }
}